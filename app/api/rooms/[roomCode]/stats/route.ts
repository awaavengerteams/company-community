import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembership, requireRoomCode, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

/**
 * GET /api/rooms/[roomCode]/stats — สรุปท้ายปาร์ตี้
 *
 * ★ ทำไมต้องนับที่ server ไม่ใช่นับจาก state ที่ client มีอยู่แล้ว
 *
 *   client เก็บประวัติไว้แค่ 30 เพลงล่าสุด (ดู bootstrap) เพราะไม่มีใคร
 *   เลื่อนดูย้อนหลังมากกว่านั้น — แต่ "สรุป" ต้องนับทั้งคืน
 *
 *   ห้องที่เปิดมา 5 ชั่วโมงอาจมี 80 เพลง ถ้านับจากของที่ client มี
 *   จะได้ "เปิดไป 30 เพลง" ซึ่งผิดและดูเหมือนระบบนับไม่เป็น
 *
 * ★ ไม่เสีย quota ของ YouTube เลย — อ่านจากตารางของเราล้วน ๆ
 */
export const dynamic = 'force-dynamic'

/** เพดานแถวที่ดึงมานับ — ห้องที่ยาวกว่านี้ถือว่าพอแล้วสำหรับการสรุป */
const MAX_ROWS = 2000

export const GET = withErrorHandling(
  async (_request: Request, ctx: RouteContext<'/api/rooms/[roomCode]/stats'>) => {
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('suggest', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()

    const [played, members] = await Promise.all([
      admin
        .from('queue_items')
        .select('video_id, title, channel_title, thumbnail_url, duration, status, added_by')
        // ★ นับเฉพาะที่ "ได้ยินจริง" — REMOVED ไม่เคยถูกเล่น จะเอามานับไม่ได้
        .eq('room_id', roomCtx.room.id)
        .in('status', ['PLAYED', 'SKIPPED'])
        .limit(MAX_ROWS),

      admin
        .from('room_members')
        .select('user_id, joined_at')
        .eq('room_id', roomCtx.room.id),
    ])

    const rows = played.data ?? []

    /* ── เพลงที่เปิดบ่อยที่สุด ───────────────────────────────────────── */
    const byVideo = new Map<
      string,
      { count: number; title: string; thumbnailUrl: string | null }
    >()
    let secondsPlayed = 0
    let skipped = 0

    for (const row of rows) {
      if (row.status === 'SKIPPED') skipped += 1
      secondsPlayed += row.duration
      const current = byVideo.get(row.video_id)
      if (current) current.count += 1
      else
        byVideo.set(row.video_id, {
          count: 1,
          title: row.title,
          thumbnailUrl: row.thumbnail_url,
        })
    }

    const topSongs = [...byVideo.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([videoId, v]) => ({
        videoId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        plays: v.count,
      }))

    /* ── ใครใส่เพลงเยอะสุด ──────────────────────────────────────────── */
    const byUser = new Map<string, number>()
    for (const row of rows) {
      if (!row.added_by) continue
      byUser.set(row.added_by, (byUser.get(row.added_by) ?? 0) + 1)
    }

    const topIds = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

    let names = new Map<string, string>()
    if (topIds.length > 0) {
      const { data } = await admin
        .from('profiles')
        .select('id, display_name')
        .in(
          'id',
          topIds.map(([id]) => id),
        )
      names = new Map((data ?? []).map((p) => [p.id, p.display_name]))
    }

    return ok(
      {
        totalPlayed: rows.length,
        skipped,
        secondsPlayed,
        listeners: (members.data ?? []).length,
        roomCreatedAt: roomCtx.room.created_at,
        topSongs,
        topAdders: topIds.map(([userId, count]) => ({
          userId,
          displayName: names.get(userId) ?? 'Listener',
          count,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  },
)

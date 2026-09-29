import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembership, requireRoomCode, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { rankCandidates, titleTokens, type Candidate, type SeedSong } from '@/lib/youtube/relevance'
import { searchYouTube } from '@/lib/youtube/search-service'
import type { VideoResult } from '@/types/youtube'

/**
 * GET /api/youtube/recommend?room=CODE&seed=N&offset=N — เพลงแนะนำ
 *
 * ★★★ แนะนำจาก "เพลงที่กำลังเล่นอยู่" ไม่ใช่สุ่มทั้งเว็บ
 *
 *     เดิมทีนี่คือการสุ่มกองเพลงทั้งเว็บด้วย seed แล้วเอียงให้เพลงฮิตขึ้นก่อน
 *     ★ ซึ่งแปลว่าไม่ว่าห้องกำลังเปิดลูกทุ่ง เพลงเกาหลี หรือเพลงบรรเลง
 *       รายการแนะนำก็หน้าตาเหมือนกันหมด — ผู้ใช้ทักมาตรง ๆ ว่า
 *       "อันนี้ไปดึงอะไรมาไม่รู้" ซึ่งถูกทุกตัวอักษร
 *
 *     ตอนนี้ให้คะแนนความเกี่ยวข้องกับเพลงที่เล่นอยู่ก่อน แล้วค่อยเรียง
 *     (ตรรกะการให้คะแนนอยู่ที่ lib/youtube/relevance.ts พร้อมเหตุผลของ
 *     น้ำหนักแต่ละตัว)
 *
 * ★★ ยังไม่เสีย YouTube quota แม้แต่หน่วยเดียวเหมือนเดิม
 *
 *    ของที่ใช้คิดคือ youtube_videos (ทุกเพลงที่เคยผ่านเว็บนี้) กับ
 *    queue_items (ใครเปิดอะไรในห้องไหน) ★ ซึ่งเป็นข้อมูลของเราเองทั้งคู่
 *
 * ★★ "เพลงที่เล่นอยู่" อ่านจาก DB ฝั่ง server ไม่รับจาก client
 *
 *    client ส่งมาก็ได้และง่ายกว่า ★ แต่แปลว่าใครก็ได้ยิง API ด้วย videoId
 *      อะไรก็ได้เพื่อไล่ดูว่าเว็บนี้มีเพลงอะไรเกี่ยวกับอะไรบ้าง
 *      ซึ่งเป็นข้อมูลของห้องอื่นที่เขาไม่ได้อยู่
 *
 *    ★ อ่านจากคิวของห้องที่เขาเป็นสมาชิกอยู่จริง จึงไม่มีอะไรให้ปลอม
 */
export const dynamic = 'force-dynamic'

/** จำนวนต่อหน้า — 24 = กริด 4 คอลัมน์ 6 แถว */
const PAGE_SIZE = 24
/** เพดานกองที่เอามาเรียง — ป้องกัน payload บวมเมื่อระบบโตขึ้นมาก */
const POOL_MAX = 1000
/** ดูประวัติย้อนหลังกี่แถวเพื่อนับความนิยม */
const HISTORY_ROWS = 600
/** ห้องที่เคยเปิดเพลงนี้ — เอามาหาว่ามีอะไรถูกเปิดคู่กันบ้าง */
const CO_PLAY_ROOMS = 40
/** เพลงในห้องเหล่านั้น — เพดานกันห้องที่มีคิวยาวผิดปกติลากทั้ง query ช้า */
const CO_PLAY_ITEMS = 600
/**
 * ประวัติล่าสุดของห้องนี้ที่หยิบมาดู
 *
 * ★ ใช้สองอย่างพร้อมกัน: หาเพลงต้นทาง และกันไม่ให้แนะนำเพลงที่เพิ่งฟังไป
 *   ★★ 20 ไม่ใช่ทั้งประวัติ — ห้องที่เปิดมาทั้งวันจะตัดเพลงออกจนไม่เหลือ
 *      อะไรให้แนะนำ ถ้าจำทุกเพลงที่เคยเล่น
 */
const RECENT_ROWS = 20
/**
 * มีเพลงเกี่ยวข้องน้อยกว่านี้ถึงจะยอมไปถาม YouTube
 *
 * ★ 8 = หนึ่งแถวครึ่งของกริด — น้อยกว่านี้ผู้ใช้จะเห็นเส้น "เพลงอื่นในเว็บ"
 *   ตั้งแต่ยังไม่ทันเลื่อน ซึ่งแปลว่าฟีเจอร์นี้แทบไม่ได้ทำงาน
 */
const MIN_RELATED = 8
/** เอาผลค้นหามาไม่เกินเท่านี้ — พอให้เต็มกริดแรก ไม่บวม */
const TOP_UP_MAX = 20

export const GET = withErrorHandling(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams
  const code = requireRoomCode(params.get('room') ?? '')

  const seed = Number.parseInt(params.get('seed') ?? '', 10) || 1
  const offset = Math.max(0, Math.min(POOL_MAX, Number.parseInt(params.get('offset') ?? '0', 10) || 0))

  const user = await requireUser()
  await enforceRateLimit('suggest', user.id)
  const roomCtx = await requireMembership(code, user.id)

  const admin = getSupabaseAdminClient()

  /**
   * ★ เพลงที่เล่นอยู่ — ถ้าหยุดอยู่ก็เอาเพลงล่าสุดที่เพิ่งเล่นจบ
   *
   *   ★★ คนที่เพิ่งฟังเพลงจบแล้วคิวว่าง คือคนที่ต้องการคำแนะนำมากที่สุด
   *      การคืนค่าสุ่มให้เขาตอนนั้นคือพลาดจังหวะที่สำคัญที่สุดพอดี
   */
  const { data: seedRows } = await admin
    .from('queue_items')
    .select('video_id, title, channel_title, status, created_at')
    .eq('room_id', roomCtx.room.id)
    .in('status', ['PLAYING', 'PLAYED', 'SKIPPED'])
    .order('created_at', { ascending: false })
    .limit(RECENT_ROWS)

  const rows = seedRows ?? []

  /**
   * ★★★ เพลงที่ถูกข้าม ไม่ใช้เป็นต้นทางของคำแนะนำ แต่ยังต้องกันไม่ให้ซ้ำ
   *
   *     SKIPPED แปลว่ามีคนในห้องกดบอกว่า "ไม่เอาเพลงนี้" ★ การเอามันไป
   *       หาเพลงคล้าย ๆ มาเสิร์ฟต่อ คือเข้าใจสัญญาณกลับด้านทั้งหมด
   *
   *     ★★ แต่มันยังต้องอยู่ในรายการที่ห้ามแนะนำ — เพลงที่เพิ่งโดนข้ามไป
   *        เด้งกลับมาอยู่ในกริด คือสิ่งที่น่ารำคาญที่สุดที่เกิดขึ้นได้ตรงนี้
   *
   *     ★ สองบทบาทนี้จึงแยกกันชัดเจน: หาต้นทางจาก PLAYING/PLAYED เท่านั้น
   *       ส่วนรายการห้ามแนะนำเอาทั้งสามสถานะ
   */
  const seedRow =
    rows.find((r) => r.status === 'PLAYING') ??
    rows.find((r) => r.status === 'PLAYED') ??
    null
  const seedSong: SeedSong | null = seedRow
    ? { videoId: seedRow.video_id, title: seedRow.title, channelTitle: seedRow.channel_title }
    : null

  /**
   * ★ ดึง title + channel ของทั้งกองมาด้วย เพราะต้องใช้คิดคะแนน
   *   (ของเดิมดึงแค่ video_id ได้เพราะไม่ได้คิดอะไรเลย นอกจากสุ่ม)
   *   ★★ ยังไม่ดึง thumbnail/duration — ของพวกนั้นเอาเฉพาะ 24 แถวที่จะส่งจริง
   *      ซึ่งเป็นเหตุผลเดิมที่แยกเป็นสอง query อยู่แล้ว
   */
  const [pool, history, inRoom, coPlayRooms] = await Promise.all([
    admin
      .from('youtube_videos')
      .select('video_id, title, channel_title')
      .eq('embeddable', true)
      .gt('duration', 0)
      .limit(POOL_MAX),

    admin
      .from('queue_items')
      .select('video_id')
      .order('created_at', { ascending: false })
      .limit(HISTORY_ROWS),

    admin
      .from('queue_items')
      .select('video_id')
      .eq('room_id', roomCtx.room.id)
      .in('status', ['WAITING', 'PLAYING']),

    /*
     * ★★★ หัวใจของความเกี่ยวข้อง: ห้องไหนเคยเปิดเพลงนี้บ้าง
     *
     *     สองสเต็ป (หาห้อง → หาเพลงในห้องนั้น) ไม่ใช่ join เดียว เพราะ
     *     PostgREST ทำ self-join บนตารางเดียวกันไม่ได้ตรง ๆ
     *     ★ และการแยกสองรอบทำให้ใส่ limit คุมขนาดได้ทั้งสองชั้น
     *       — ห้องที่มีคิว 5,000 เพลงจะไม่ลากทั้ง endpoint ช้าไปด้วย
     */
    seedSong
      ? admin
          .from('queue_items')
          .select('room_id')
          .eq('video_id', seedSong.videoId)
          .order('created_at', { ascending: false })
          .limit(CO_PLAY_ROOMS)
      : Promise.resolve({ data: [] as { room_id: string }[] }),
  ])

  /** ★ เพลงที่อยู่ในคิวห้องนี้แล้ว ไม่ต้องแนะนำซ้ำ */
  const exclude = new Set((inRoom.data ?? []).map((r) => r.video_id))

  /**
   * ★★★ รวมเพลงที่ห้องนี้ "เพิ่งเล่นจบ" เข้าไปในรายการที่ไม่แนะนำด้วย
   *
   *     เจอตอนกดข้ามเพลง: เพลงที่เพิ่งฟังจบกระโดดขึ้นมาเป็นอันดับหนึ่งทันที
   *     ★ เพราะห้องนี้เองเพิ่งเปิดมันคู่กับเพลงใหม่ — สัญญาณ "เคยเปิดคู่กัน"
   *       จึงชี้กลับมาที่ประวัติของห้องตัวเอง ซึ่งถูกตามสูตรแต่ผิดตามสามัญสำนึก
   *
   *     ★★ ไม่มีใครเพิ่งฟังเพลงจบแล้วอยากให้ระบบเชียร์เพลงเดิมทันที
   *        และเพลงนั้นอยู่ในแท็บ "ประวัติ" ให้กดซ้ำได้อยู่แล้วถ้าอยากฟังจริง
   *
   *     ★ จำกัดแค่ 20 เพลงล่าสุด ไม่ใช่ทั้งประวัติ — ห้องที่เปิดมาทั้งวัน
   *       ไม่งั้นจะตัดเพลงออกจนไม่เหลืออะไรให้แนะนำ
   */
  for (const row of rows) exclude.add(row.video_id)

  const plays = new Map<string, number>()
  for (const row of history.data ?? []) {
    plays.set(row.video_id, (plays.get(row.video_id) ?? 0) + 1)
  }

  /**
   * ★ นับเป็น "จำนวนห้อง" ไม่ใช่ "จำนวนครั้ง"
   *
   *   ★★ ถ้านับครั้ง ห้องเดียวที่กดเพลงเดิมวนซ้ำ 20 รอบจะกลายเป็นหลักฐาน
   *      หนักแน่นกว่า 5 ห้องที่ต่างคนต่างเลือก ทั้งที่ความจริงกลับกัน —
   *      คนละคนเลือกเหมือนกัน คือสัญญาณที่แข็งแรงกว่าคนเดิมเลือกซ้ำ
   */
  const coPlayed = new Map<string, number>()
  const roomIds = [...new Set((coPlayRooms.data ?? []).map((r) => r.room_id))]
  if (roomIds.length > 0) {
    const { data: neighbours } = await admin
      .from('queue_items')
      .select('room_id, video_id')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false })
      .limit(CO_PLAY_ITEMS)

    const seen = new Set<string>()
    for (const row of neighbours ?? []) {
      const key = `${row.room_id}:${row.video_id}`
      if (seen.has(key)) continue
      seen.add(key)
      coPlayed.set(row.video_id, (coPlayed.get(row.video_id) ?? 0) + 1)
    }
    if (seedSong) coPlayed.delete(seedSong.videoId)
  }

  const candidates: Candidate[] = (pool.data ?? [])
    .filter((r) => !exclude.has(r.video_id))
    .map((r) => ({ videoId: r.video_id, title: r.title, channelTitle: r.channel_title }))

  let ordered = rankCandidates({ candidates, seedSong, coPlayed, plays, seed })
  let relatedCount = ordered.filter((r) => r.related).length

  /**
   * ★★★ ถ้าในเว็บยังไม่มีเพลงที่เกี่ยวข้องมากพอ ค่อยไปถาม YouTube สักครั้ง
   *
   *     ข้อจำกัดที่แก้ด้วยการเรียงลำดับอย่างเดียวไม่ได้เลย: เราแนะนำได้เฉพาะ
   *     เพลงที่เคยมีคนค้นในเว็บนี้ ★ วัดจริงตอนเปิด BLACKPINK — ทั้งเว็บมี
   *       เพลงเกี่ยวข้องแค่ 1 เพลง เพราะไม่เคยมีใครค้นเพลง K-pop ที่นี่
   *       ต่อให้จัดอันดับเก่งแค่ไหนก็ไม่มีอะไรให้จัด
   *
   * ★★ ทำไมถึงยอมจ่าย 100 units ทั้งที่ทั้งไฟล์นี้ออกแบบมาเพื่อไม่จ่าย
   *
   *    เพราะมันจ่ายครั้งเดียวแล้วได้ตลอด:
   *      · ผลค้นหาถูก cache 12 ชั่วโมง — เพลงเดิมในห้องอื่นไม่เสียอีก
   *      · ★ ที่สำคัญกว่าคือ writeVideoCache() เติมเพลงพวกนั้นลง
   *        youtube_videos ถาวร (30 วัน) ★★ กองเพลงของเว็บจึงโตขึ้นเอง
   *        ทุกครั้งที่มีคนเปิดแนวใหม่ — ครั้งต่อไปไม่ต้องถาม YouTube แล้ว
   *
   *    ★ เงื่อนไขคุมไว้สามชั้น: เฉพาะหน้าแรก · เฉพาะตอนของไม่พอจริง ·
   *      และ searchYouTube() หักโควตาเองก่อนยิงเสมอ
   *
   * ★★ พังแล้วต้องไม่ทำทั้ง endpoint ล้ม
   *    โควตาหมดหรือ YouTube ล่ม = คืนผลจากกองในเว็บเหมือนเดิม
   *    ★ "แนะนำได้ไม่ค่อยตรง" ยังใช้งานได้ ส่วน "หน้าพัง" ใช้ไม่ได้เลย
   */
  if (seedSong && offset === 0 && relatedCount < MIN_RELATED) {
    const extra = await topUpFromYouTube(seedSong, exclude)
    if (extra.length > 0) {
      const known = new Set(candidates.map((c) => c.videoId))
      for (const c of extra) if (!known.has(c.videoId)) candidates.push(c)
      ordered = rankCandidates({ candidates, seedSong, coPlayed, plays, seed })
      relatedCount = ordered.filter((r) => r.related).length
    }
  }

  const slice = ordered.slice(offset, offset + PAGE_SIZE)

  let items: VideoResult[] = []

  if (slice.length > 0) {
    const { data } = await admin
      .from('youtube_videos')
      .select('video_id, title, channel_title, thumbnail_url, duration')
      .in(
        'video_id',
        slice.map((r) => r.videoId),
      )

    // PostgREST ไม่รับประกันลำดับของ .in() — เรียงกลับตามที่เราคำนวณไว้
    const byId = new Map((data ?? []).map((r) => [r.video_id, r]))
    items = slice.flatMap((entry) => {
      const row = byId.get(entry.videoId)
      if (!row) return []
      return [
        {
          videoId: row.video_id,
          title: row.title,
          channelTitle: row.channel_title ?? '',
          thumbnailUrl:
            row.thumbnail_url ?? `https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`,
          duration: row.duration,
        },
      ]
    })
  }

  return ok(
    {
      items,
      nextOffset: offset + slice.length,
      hasMore: offset + slice.length < ordered.length,
      total: ordered.length,
      /**
       * ★★ บอกผู้ใช้ไปเลยว่าแนะนำมาจากเพลงอะไร
       *
       *    คำบ่นเดิมคือ "ไม่รู้ว่าไปดึงอะไรมา" ★ ซึ่งการทำให้ผลลัพธ์ดีขึ้น
       *      อย่างเดียวแก้ไม่หมด ตราบใดที่หน้าเว็บยังไม่ยอมบอกว่ามันคิดจากอะไร
       */
      basedOn: seedSong ? { videoId: seedSong.videoId, title: seedSong.title } : null,
      relatedCount,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})

/**
 * ถาม YouTube ว่ามีอะไรคล้ายเพลงนี้อีกบ้าง
 *
 * ★★ ค้นด้วย "ชื่อเพลงที่ล้างคำขยะออกแล้ว" ไม่ใช่ชื่อช่อง
 *
 *    ชื่อช่องดูเหมือนตรงกว่า ★ แต่เพลงลูกทุ่งไทยส่วนใหญ่อัปโหลดโดยค่าย
 *      ไม่ใช่ศิลปิน — ค้นด้วย "GRAMMY GOLD OFFICIAL" จะได้ศิลปินทั้งค่าย
 *      ซึ่งกว้างเกินจนไม่ต่างจากสุ่ม
 *
 *    ★★ ชื่อเพลงมีทั้งชื่อเพลงและชื่อศิลปินอยู่ในนั้นแล้ว (ทั้งแบบไทย
 *       "เพลง - ศิลปิน" และแบบสากล "Artist - Song") ★ ค้นด้วยมันจึงได้
 *         ทั้งเพลงอื่นของคนเดียวกัน เวอร์ชันคัฟเวอร์ และเพลงแนวใกล้กัน
 *         โดยไม่ต้องเดาว่าส่วนไหนของชื่อคือศิลปิน
 */
async function topUpFromYouTube(
  seedSong: SeedSong,
  exclude: Set<string>,
): Promise<Candidate[]> {
  const query = [...titleTokens(seedSong.title)].slice(0, 6).join(' ').trim()
  if (query.length < 3) return []

  try {
    const result = await searchYouTube(query, '')
    return result.items
      /*
       * ★ duration > 0 — ตัด live stream ทิ้งให้ตรงกับเงื่อนไขของกองหลัก
       *   searchYouTube กรอง embeddable ให้แล้ว แต่ไม่ได้กรองอันนี้
       *   ★★ ถ้าหลุดเข้ามา ผู้ใช้จะกดเพิ่มแล้วโดนปฏิเสธตอน validate คิว
       *      — เห็นปุ่มที่กดไม่ได้ แย่กว่าไม่เห็นปุ่มเลย
       */
      .filter(
        (v) =>
          v.duration > 0 && v.videoId !== seedSong.videoId && !exclude.has(v.videoId),
      )
      .slice(0, TOP_UP_MAX)
      .map((v) => ({ videoId: v.videoId, title: v.title, channelTitle: v.channelTitle }))
  } catch (error) {
    /*
     * ★ โควตาหมด / YouTube ล่ม / คำค้นเพี้ยน — ทั้งหมดไม่ใช่เหตุให้หน้าพัง
     *   log ไว้ให้รู้ว่าเกิดขึ้นบ่อยแค่ไหน แล้วเดินต่อด้วยกองในเว็บ
     */
    console.warn('[recommend] เติมเพลงจาก YouTube ไม่สำเร็จ:', error)
    return []
  }
}

import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { QuizDto } from '@/types/room'

/**
 * อ่านสถานะเกมทายเพลงของห้อง
 *
 * ★★★ ฟังก์ชันนี้คือกำแพงกั้นเฉลย
 *
 *     ตาราง quiz_rounds (ที่เก็บชื่อเพลงจริงกับ videoId) ไม่มี policy อ่าน
 *     client จึงแตะไม่ได้เลย ★ และที่นี่ก็ไม่เคย select จากตารางนั้น
 *
 *     ทุกอย่างที่ส่งออกไปมาจาก quiz_games ซึ่งเก็บเฉพาะของที่เปิดเผยได้:
 *     ป้ายปิดชื่อเพลง · ชื่อช่อง · คนที่ขอเพลงนั้น · เวลาหมดรอบ
 *     ส่วน last_* คือของรอบที่เฉลยไปแล้ว จึงปลอดภัยที่จะส่ง
 */
export async function loadQuiz(roomId: string): Promise<QuizDto | null> {
  const admin = getSupabaseAdminClient()

  const { data: game } = await admin
    .from('quiz_games')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'PLAYING')
    .maybeSingle()

  if (!game) return null

  const { data: scoreRows } = await admin
    .from('quiz_scores')
    .select('user_id, points')
    .eq('game_id', game.id)

  const ids = (scoreRows ?? []).map((s) => s.user_id)
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name, nickname')
      .in('id', ids)
    for (const p of profiles ?? []) names.set(p.id, p.nickname ?? p.display_name)
  }

  return {
    id: game.id,
    hostId: game.host_id,
    totalRounds: game.total_rounds,
    roundIdx: game.round_idx,
    status: game.status,
    mask: game.hint_mask,
    initials: game.hint_initials,
    channel: game.hint_channel,
    adder: game.hint_adder,
    startedAt: game.round_started_at,
    endsAt: game.round_ends_at,
    lastAnswer: game.last_answer,
    lastCover: game.last_cover,
    lastWinner: game.last_winner,
    scores: (scoreRows ?? [])
      .map((s) => ({
        userId: s.user_id,
        displayName: names.get(s.user_id) ?? 'Listener',
        points: s.points,
      }))
      .sort((a, b) => b.points - a.points),
  }
}

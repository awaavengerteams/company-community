import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { createMatch, loadPlayers, notifyUser } from './server'

/**
 * รับคำท้า → สร้างกระดาน → คืน id ของกระดาน
 *
 * ★★ เปลี่ยนสถานะแบบมีเงื่อนไขในคำสั่งเดียว
 *    (where id = … and to_user = ฉัน and status = PENDING and ยังไม่หมดอายุ)
 *    ★ กดรับสองครั้งพร้อมกัน / รับตอนที่ผู้ท้ากดยกเลิกพอดี — มีแค่คำขอเดียว
 *      ที่ได้แถวกลับมา อีกคำขอได้ CHALLENGE_EXPIRED ไม่มีทางได้สองกระดาน
 */
export async function acceptChallenge(challengeId: string, userId: string): Promise<string> {
  const admin = getSupabaseAdminClient()
  const now = new Date().toISOString()

  const { data: claimed, error } = await admin
    .from('game_challenges')
    .update({ status: 'ACCEPTED', responded_at: now })
    .eq('id', challengeId)
    .eq('to_user', userId)
    .eq('status', 'PENDING')
    .gt('expires_at', now)
    .select('id, from_user, to_user, settings')
    .maybeSingle()
  if (error) throw fromPostgresError(error)

  if (!claimed) {
    /* ★ กดรับซ้ำหลังรับไปแล้ว (เน็ตช้า กดสองที) — พาเข้าเกมเดิม ไม่ใช่โชว์ error */
    const { data: again } = await admin
      .from('game_challenges')
      .select('match_id, status')
      .eq('id', challengeId)
      .eq('to_user', userId)
      .maybeSingle()
    if (again?.status === 'ACCEPTED' && again.match_id) return again.match_id
    throw new AppError('CHALLENGE_EXPIRED')
  }

  const match = await createMatch({
    challengeId: claimed.id,
    a: claimed.from_user,
    b: claimed.to_user,
    forceCapture: claimed.settings.forceCapture ?? true,
    turnSeconds: claimed.settings.turnSeconds === undefined ? 60 : claimed.settings.turnSeconds,
  })

  const { error: linkError } = await admin
    .from('game_challenges')
    .update({ match_id: match.id })
    .eq('id', claimed.id)
  if (linkError) throw fromPostgresError(linkError)

  const me = (await loadPlayers([userId])).get(userId)
  await notifyUser(
    claimed.from_user,
    'gameChallenge',
    'notify.type.gameAccepted',
    { name: me?.name ?? '—' },
    `/office/fun/checkers/${match.id}`,
  )

  return match.id
}

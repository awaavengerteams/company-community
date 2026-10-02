import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { acceptChallenge } from '@/lib/games/checkers/challenges'
import { loadPlayers, notifyUser } from '@/lib/games/checkers/server'
import { CHALLENGE_TTL_MINUTES, DEFAULT_TURN_SECONDS } from '@/lib/games/checkers/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/games/checkers/challenges — คำท้าที่รอฉันตอบ (แบนเนอร์ทุกหน้า)
 *
 * ★ เบากว่า /lobby มาก — แบนเนอร์ถามตัวนี้จากทุกหน้าในระบบออฟฟิศ
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('game_challenges')
    .select('id, from_user, expires_at')
    .eq('to_user', actor.id)
    .eq('status', 'PENDING')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw fromPostgresError(error)

  const players = await loadPlayers((data ?? []).map((c) => c.from_user))
  return ok({
    items: (data ?? []).map((c) => ({
      id: c.id,
      from: players.get(c.from_user) ?? { id: c.from_user, name: '—', avatarUrl: null },
      expiresAt: c.expires_at,
    })),
  })
})

const bodySchema = z.object({
  to: z.uuid(),
  /* ★ ไม่ส่งมา = ค่าเริ่มต้น — ปุ่ม "ท้า" ส่งแค่ to ก็เล่นได้เลย */
  forceCapture: z.boolean().default(true),
  turnSeconds: z.number().int().min(10).max(600).nullable().default(DEFAULT_TURN_SECONDS),
})

/**
 * POST /api/office/games/checkers/challenges — ส่งคำท้า (และ "เล่นอีกครั้ง")
 *
 * ★★ ถ้าอีกฝ่ายท้าเรามาอยู่แล้ว = ต่างคนต่างอยากเล่น → เริ่มเกมเลย
 *    ไม่สร้างคำท้าสองใบที่ต้องรอให้ใครสักคนกดรับอีกรอบ
 * ★ คำท้าเก่าของเราที่ส่งไปหาคนเดิมถูกยกเลิก — กดท้าซ้ำไม่กลายเป็นกองคำท้า
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('gameChallenge', actor.id)

  if (body.to === actor.id) throw new AppError('VALIDATION_FAILED')

  const admin = getSupabaseAdminClient()
  const now = new Date()

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, account_status')
    .eq('id', body.to)
    .maybeSingle()
  if (targetError) throw fromPostgresError(targetError)
  if (!target || target.account_status !== 'ACTIVE') throw new AppError('MEMBER_NOT_FOUND')

  /* ── อีกฝ่ายท้าเรามาอยู่แล้ว → รับเลย ───────────────────────── */
  const { data: theirs, error: theirsError } = await admin
    .from('game_challenges')
    .select('id')
    .eq('from_user', body.to)
    .eq('to_user', actor.id)
    .eq('status', 'PENDING')
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (theirsError) throw fromPostgresError(theirsError)

  if (theirs) {
    const matchId = await acceptChallenge(theirs.id, actor.id)
    return ok({ challengeId: theirs.id, matchId })
  }

  /* ── ยกเลิกคำท้าเก่าที่เราส่งหาคนเดิม ──────────────────────── */
  const { error: cancelError } = await admin
    .from('game_challenges')
    .update({ status: 'CANCELLED', responded_at: now.toISOString() })
    .eq('from_user', actor.id)
    .eq('to_user', body.to)
    .eq('status', 'PENDING')
  if (cancelError) throw fromPostgresError(cancelError)

  const { data, error } = await admin
    .from('game_challenges')
    .insert({
      from_user: actor.id,
      to_user: body.to,
      settings: { forceCapture: body.forceCapture, turnSeconds: body.turnSeconds },
      expires_at: new Date(now.getTime() + CHALLENGE_TTL_MINUTES * 60_000).toISOString(),
    })
    .select('id, expires_at')
    .single()
  if (error) throw fromPostgresError(error)

  await notifyUser(
    body.to,
    'gameChallenge',
    'notify.type.gameChallenge',
    { name: actor.profile.nickname || actor.profile.display_name },
    '/office/fun/checkers',
  )

  return ok({ challengeId: data.id, expiresAt: data.expires_at, matchId: null })
})

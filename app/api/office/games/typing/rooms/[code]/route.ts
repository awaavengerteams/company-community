import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import {
  finishRace,
  hostStart,
  invite,
  joinRoom,
  leaveRoom,
  nextRound,
  readRoomByCode,
  roomDto,
  settleRoom,
} from '@/lib/games/typing/server'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/games/typing/rooms/[code]'>

/**
 * GET /api/office/games/typing/rooms/:code — สภาพห้อง
 *
 * ★ settle ก่อนตอบ — รอครบเวลาแล้วเริ่มเอง / หมดเวลาแล้วจบเอง
 */
export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const actor = await requireOfficeUser()
  const { code } = await ctx.params
  const room = await settleRoom(await readRoomByCode(code))
  return ok({ room: await roomDto(room, actor.id) })
})

const count = z.number().int().min(0).max(100_000)

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('again') }),
  z.object({ action: z.literal('invite'), to: z.uuid() }),
  z.object({
    action: z.literal('finish'),
    round: z.number().int().min(1),
    elapsedMs: z.number().int().min(0).max(3_600_000),
    keystrokes: count,
    firstTry: count,
  }),
])

/** POST /api/office/games/typing/rooms/:code — เข้า · ออก · เริ่ม · แข่งอีกรอบ · เชิญ · ส่งผล */
export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('gameAction', actor.id)

  const { code } = await ctx.params
  let room = await settleRoom(await readRoomByCode(code))

  switch (body.action) {
    case 'join':
      await joinRoom(room, actor.id)
      room = await settleRoom(await readRoomByCode(code))
      break
    case 'leave':
      await leaveRoom(room, actor.id)
      room = await settleRoom(await readRoomByCode(code))
      break
    case 'start':
      room = await hostStart(room, actor.id)
      break
    case 'again':
      room = await settleRoom(await nextRound(room, actor.id))
      break
    case 'invite':
      await invite(room, actor.id, body.to)
      break
    case 'finish': {
      const result = await finishRace(room, actor.id, body)
      room = await readRoomByCode(code)
      return ok({ result, room: await roomDto(room, actor.id) })
    }
  }
  return ok({ room: await roomDto(room, actor.id) })
})

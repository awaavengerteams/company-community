import type { NextRequest } from 'next/server'
import { AppError } from '@/lib/http/errors'
import { requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { searchYouTube } from '@/lib/youtube/search-service'
import { searchQuerySchema } from '@/lib/validation/schemas'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * GET /api/youtube/search?q=...&pageToken=...
 *
 * ★ เป็น GET ไม่ใช่ POST (สเปกเดิมเขียนไว้สองแบบ — เลือก GET ตามที่ตกลงกันไว้)
 *   เพราะเป็นการอ่านล้วน ๆ cache ได้ แชร์ลิงก์ได้ และเข้ากับ pageToken ตรง ๆ
 *
 * ★ ต้อง sign in ก่อนถึงจะค้นหาได้ แม้จะเป็นแค่ anonymous
 *   ไม่ใช่เพราะหวงข้อมูล แต่เพราะต้องมี id ไว้นับ rate limit
 *   ถ้าเปิดให้ค้นหาโดยไม่มีตัวตน คนเดียวยิงรัว ๆ ทำให้ทั้งเว็บค้นหาไม่ได้ทั้งวัน
 *   (quota 10,000/วัน ÷ 101 = ~99 ครั้ง)
 */
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: NextRequest) => {
  const parsed = searchQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
    pageToken: request.nextUrl.searchParams.get('pageToken') ?? '',
  })

  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', {
      messageKey: (parsed.error.issues[0]?.message as DictKey | undefined) ?? 'valid.badQuery',
    })
  }

  const user = await requireUser()
  await enforceRateLimit('youtubeSearch', user.id)

  const result = await searchYouTube(parsed.data.q, parsed.data.pageToken)

  return ok(result, {
    // ★ no-store ที่ชั้น HTTP — เรามี cache ของเราเองใน Postgres แล้ว
    //   ถ้าปล่อยให้ CDN cache ด้วย จะเกิดกรณีที่ rate limit ไม่ถูกนับ
    //   เพราะ request ไม่เคยมาถึง server
    headers: { 'Cache-Control': 'no-store' },
  })
})

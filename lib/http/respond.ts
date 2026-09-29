import { NextResponse } from 'next/server'
import { EnvError } from '@/lib/env'
import { getT } from '@/lib/i18n/server'
import { AppError, isAppError, type AppErrorCode } from './errors'

/** รูปแบบ response เดียวที่ทุก endpoint ใช้ร่วมกัน */
export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = {
  ok: false
  error: { code: AppErrorCode; message: string; retryAfter?: number; requestId?: string }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, init)
}

/**
 * ★★★ แปลข้อความผิดพลาดที่ "ประตูออก" จุดเดียว
 *
 *     ทางเลือกอีกทางคือส่งแต่ code ออกไปแล้วให้ client แปลเอง ซึ่งเบากว่า
 *     ★ แต่ข้อความผิดพลาดบางอันเราเขียนเองตรงจุดที่โยน (เช่น "รูปพื้นหลังต้อง
 *       อัปผ่านเว็บนี้เท่านั้น") ซึ่งไม่มี code เป็นของตัวเอง
 *       ถ้าแปลฝั่ง client ข้อความพวกนั้นจะเป็นไทยอยู่ภาษาเดียวตลอดไป
 *
 *     ★★ แปลที่นี่แทน: server อ่าน cookie ภาษาได้อยู่แล้ว และทุก error
 *        ไม่ว่าจะมาจากไหน ต้องผ่านฟังก์ชันนี้ก่อนถึงผู้ใช้เสมอ —
 *        จุดเดียวที่ไม่มีทางลืม
 */
export async function fail(error: AppError, requestId?: string): Promise<NextResponse<ApiFailure>> {
  const headers = new Headers()
  if (error.retryAfter !== undefined) {
    headers.set('Retry-After', String(error.retryAfter))
  }

  const { t } = await getT()
  /* ★ ข้อความที่โยนมาเองเป็นกุญแจแปล — ถ้าไม่ใช่กุญแจที่รู้จัก t() จะคืนค่าเดิม */
  const message = error.messageKey ? t(error.messageKey) : t(`apiErr.${error.code}`)

  return NextResponse.json(
    {
      ok: false as const,
      error: {
        code: error.code,
        message,
        ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
        ...(requestId ? { requestId } : {}),
      },
    },
    { status: error.status, headers },
  )
}

/**
 * ครอบ handler ทุกตัว — ตรงนี้คือจุดเดียวที่ error จะรั่วออกไปหาผู้ใช้ได้
 * จึงเป็นจุดเดียวที่ต้อง sanitize
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (error) {
      if (isAppError(error)) {
        // error ที่เราตั้งใจโยนเอง — ข้อความปลอดภัยอยู่แล้ว ไม่ต้อง log เป็น error
        if (error.status >= 500) {
          console.error('[api] AppError', error.code, error.cause ?? error.message)
        }
        return await fail(error)
      }

      // ยังตั้งค่า environment ไม่ครบ — เป็นปัญหาการติดตั้ง ไม่ใช่บั๊ก
      // log ชื่อตัวแปรที่ขาดไว้ให้คนดูแลเห็น แต่ไม่ส่งชื่อออกไปหาผู้ใช้
      if (error instanceof EnvError) {
        console.error('[api] ตั้งค่า environment ไม่ครบ:', error.missing.join(', '))
        return await fail(new AppError('NOT_CONFIGURED'))
      }

      // error ที่ไม่รู้จัก — log เต็ม ๆ ฝั่ง server, ส่งออกแค่ requestId
      const requestId = crypto.randomUUID()
      console.error(`[api] unhandled error requestId=${requestId}`, error)
      return await fail(new AppError('INTERNAL_ERROR'), requestId)
    }
  }
}

'use client'

import type { AppErrorCode } from '@/lib/http/errors'
import type { ApiResponse } from '@/lib/http/respond'
import type { DictKey, Translate } from '@/lib/i18n/dict'

/**
 * error ที่ client จับได้จากการเรียก API
 * เก็บ `code` ไว้ด้วย เพราะบาง code ต้องจัดการเงียบ ๆ ไม่ใช่โชว์ให้ผู้ใช้
 * (เช่น STALE_PLAYBACK แปลว่ามีคนเปลี่ยนเพลงไปก่อน — ไม่ใช่ความผิดพลาด)
 */
/*
 * ★★ ข้อความใน ApiClientError ที่เราสร้างเองเป็น "กุญแจแปล"
 *
 *    ส่วนข้อความที่มาจาก server (payload.error.message) ถูกแปลมาแล้วที่
 *    respond.ts ★ จึงต้องแยกให้ออกว่าอันไหนแปลแล้วอันไหนยัง —
 *      ใช้ธง `needsTranslation` บอกตรง ๆ ดีกว่าให้คนอ่านเดาจากที่มา
 */
export class ApiClientError extends Error {
  readonly code: AppErrorCode | 'NETWORK_ERROR'
  readonly status: number
  readonly retryAfter?: number
  /** true = `message` เป็นกุญแจแปล ยังไม่ได้แปล (เกิดฝั่ง client) */
  readonly needsTranslation: boolean

  constructor(
    code: AppErrorCode | 'NETWORK_ERROR',
    message: string,
    status: number,
    retryAfter?: number,
    needsTranslation = false,
  ) {
    super(message)
    this.needsTranslation = needsTranslation
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    if (retryAfter !== undefined) this.retryAfter = retryAfter
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/**
 * fetch ที่รู้จักรูปแบบ response ของเรา
 *
 * ★ ตั้ง Content-Type: application/json เสมอ ไม่ใช่แค่ตอนมี body
 *   เพราะฝั่ง server บังคับ header นี้เป็นมาตรการกัน CSRF
 *   (ดูเหตุผลใน lib/http/guard.ts)
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      ...(signal ? { signal } : {}),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    /**
     * ★ แยก "หมดเวลา" ออกจาก "เชื่อมต่อไม่ได้"
     *
     *   AbortSignal.timeout() โยน TimeoutError ไม่ใช่ AbortError ถ้าไม่แยกไว้
     *   มันจะตกลงมาเป็น NETWORK_ERROR แล้วผู้ใช้เห็นว่า "เชื่อมต่อไม่ได้
     *   ตรวจสอบอินเทอร์เน็ต" ทั้งที่เน็ตปกติดี — แล้วเขาจะไปงมผิดที่
     *
     *   เจอจริงตอนไล่บั๊กหน้าเข้าใช้งาน: เซิร์ฟเวอร์ตอบช้าเกิน 25 วินาที
     *   แต่ข้อความบอกให้ไปเช็ค WiFi
     */
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiClientError('INTERNAL_ERROR', 'net.slow', 0, undefined, true)
    }
    throw new ApiClientError('NETWORK_ERROR', 'net.offline', 0, undefined, true)
  }

  let payload: ApiResponse<T>
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    // server ตอบมาไม่ใช่ JSON — เกิดได้ตอน proxy/edge ขัดข้อง
    throw new ApiClientError('INTERNAL_ERROR', 'net.badShape', response.status, undefined, true)
  }

  if (!payload.ok) {
    throw new ApiClientError(
      payload.error.code,
      payload.error.message,
      response.status,
      payload.error.retryAfter,
    )
  }

  return payload.data
}

/**
 * อัปโหลดไฟล์ — ★ ต้องแยกจาก apiFetch ห้ามใช้ปนกัน
 *
 * ★★ บั๊กที่เจอจริง: กดอัปรูปโปรไฟล์แล้วขึ้น "ไม่พบไฟล์รูป"
 *
 *    apiFetch ตั้ง Content-Type: application/json แล้ว JSON.stringify body
 *    ทุกครั้งโดยไม่มีข้อยกเว้น — พอส่ง FormData เข้าไป มันกลายเป็นสตริง "{}"
 *    ไฟล์จึงไม่เคยออกจากเครื่องผู้ใช้เลย แล้ว server ก็บอกตรง ๆ ว่าไม่เจอไฟล์
 *
 *    ★ อาการหลอกตรงที่ error message ถูกต้องทุกอย่าง — server ไม่เจอไฟล์จริง ๆ
 *      คนอ่านจึงไปหาสาเหตุที่ฝั่ง server ทั้งที่ปัญหาอยู่ก่อนหน้านั้นหนึ่งขั้น
 *
 * ★★ ทำไมไม่แก้ apiFetch ให้ฉลาดขึ้นแทน
 *
 *    เพราะ Content-Type: application/json เป็นมาตรการกัน CSRF ที่ตั้งใจ
 *    (<form> ข้ามเว็บส่ง header นี้ไม่ได้ — ดู lib/http/guard.ts)
 *    การให้ apiFetch "ยกเว้นให้บางกรณี" คือการเปิดรูในด่านนั้นแบบเงียบ ๆ
 *
 *    ★ multipart ต้องให้เบราว์เซอร์ตั้ง boundary เอง จึงกำหนด header ไม่ได้
 *      เส้นทางนี้พึ่ง Sec-Fetch-Site ใน assertSameOrigin แทน — ซึ่งเป็นคนละ
 *      ด่านที่อ่อนกว่าเล็กน้อย การแยกฟังก์ชันทำให้ "จุดที่อ่อนกว่า" มองเห็นได้
 *      จากชื่อฟังก์ชัน ไม่ใช่ซ่อนอยู่ในเงื่อนไข if ข้างใน apiFetch
 */
export async function apiUpload<T>(
  path: string,
  file: File,
  options: {
    signal?: AbortSignal
    /** ฟิลด์เพิ่มที่ส่งไปพร้อมไฟล์ (เช่นขนาดรูปที่วัดไว้แล้ว) */
    fields?: Record<string, string | number>
  } = {},
): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.append(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      // ★ ห้ามตั้ง Content-Type เอง — boundary ต้องมาจากเบราว์เซอร์
      body: form,
      credentials: 'same-origin',
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiClientError('INTERNAL_ERROR', 'net.uploadSlow', 0, undefined, true)
    }
    throw new ApiClientError('NETWORK_ERROR', 'net.offline', 0, undefined, true)
  }

  let payload: ApiResponse<T>
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiClientError('INTERNAL_ERROR', 'net.badShape', response.status, undefined, true)
  }

  if (!payload.ok) {
    throw new ApiClientError(
      payload.error.code,
      payload.error.message,
      response.status,
      payload.error.retryAfter,
    )
  }

  return payload.data
}

/**
 * ข้อความที่เอาไปโชว์ผู้ใช้ได้เลย
 *
 * ★★ มีที่เดียวที่ต้องรู้ว่า error ก้อนไหนแปลแล้วหรือยัง
 *
 *    ก่อนหน้านี้โค้ด 23 จุดเขียน `err instanceof ApiClientError ? err.message : …`
 *    ★ ถ้าให้แต่ละจุดตัดสินใจเรื่องการแปลเอง จะมีจุดที่ลืมแน่นอน
 *      และมันจะลืมแบบเงียบ ๆ — ผู้ใช้เห็นคำว่า "net.offline" โผล่มาบนจอ
 */
export function errorText(error: unknown, t: Translate, fallback: DictKey): string {
  if (!(error instanceof ApiClientError)) return t(fallback)
  return error.needsTranslation ? t(error.message as DictKey) : error.message
}

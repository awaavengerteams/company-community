import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Supabase client ฝั่ง server ที่ "สวมสิทธิ์ผู้ใช้คนที่ยิง request เข้ามา"
 *
 * ใช้ anon key + cookie ของ session → RLS ยังทำงานเต็มที่
 * เหมาะกับ: Server Component อ่านข้อมูล bootstrap, Route Handler ที่ต้องรู้ว่า auth.uid() คือใคร
 *
 * ถ้าต้อง bypass RLS (เขียน queue / เปลี่ยนเพลง) ให้ใช้ lib/supabase/admin.ts แทน
 * และตรวจสิทธิ์เองก่อนเสมอ
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const env = publicEnv()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component เขียน cookie ไม่ได้ — ปล่อยผ่านได้
            // เพราะ proxy.ts รีเฟรช session cookie ให้ทุก request อยู่แล้ว
          }
        },
      },
    },
  )
}

/** คืน user ปัจจุบัน หรือ null ถ้ายังไม่ sign in (รวมกรณี session หมดอายุ) */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

/**
 * ผู้ใช้ที่ "สมัครแล้วจริง" — มี session และมี username ในตาราง profiles
 *
 * ★★★ นี่คือด่านจริงของระบบ ไม่ใช่ ProfileGate ฝั่ง client
 *
 *     ProfileGate ดูจาก localStorage ซึ่งเป็นของที่อยู่บนเครื่องผู้ใช้ —
 *     ใครก็ตั้งค่ามันเองได้ใน devtools แล้วเดินผ่านด่านไปเฉย ๆ
 *     มันจึงเป็นแค่ "การไม่เอาหน้าที่ยังใช้ไม่ได้ไปโชว์" ไม่ใช่การบังคับสิทธิ์
 *
 *     ★ ด่านที่บังคับได้จริงต้องอยู่ฝั่ง server และต้องอ่านจากฐานข้อมูล
 *       ซึ่งคือฟังก์ชันนี้ — ทุกหน้าและทุก API เรียกผ่านที่นี่ที่เดียว
 *
 * ★★ ทำไมเช็ค username ไม่ใช่แค่ "มี session ไหม"
 *
 *    Supabase anonymous sign-in สร้าง auth user จริงให้ใครก็ได้ที่กดปุ่มเดียว
 *    ถ้าเช็คแค่ว่ามี session ระบบจะยอมรับ "ผู้ใช้ที่ไม่เคยสมัคร" ทันที
 *    ซึ่งคือสิ่งที่เราตั้งใจจะห้าม
 *
 *    ★ username ถูกเขียนโดย /api/auth/username เท่านั้น (ฝั่ง server ล้วน)
 *      การมีมันจึงเป็นหลักฐานว่า "คนนี้ผ่านหน้าสมัครมาแล้วจริง"
 */
export async function getRegisteredUser(): Promise<{
  id: string
  displayName: string
  username: string
  nickname: string | null
  avatarUrl: string | null
  appearance: unknown
} | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createSupabaseServerClient()
  const columns = 'display_name, username, nickname, avatar_url'

  /*
   * ★★★ อ่านคอลัมน์ใหม่แบบเผื่อว่ายังไม่มีในฐานข้อมูล
   *
   *     บทเรียนราคาแพงจากครั้งก่อน: deploy โค้ดที่ select คอลัมน์ใหม่
   *     ก่อนที่ migration จะถูกรัน ทำให้ query ทั้งอันพัง แล้วทุกคน
   *     ถูกเด้งออกจากระบบพร้อมกัน เพราะฟังก์ชันนี้คือด่านเข้าของทั้งเว็บ
   *
   *     ★ คอลัมน์ที่ "ขาดแล้วไม่เป็นไร" ต้องถูกอ่านแยก และต้องยอมให้พลาดได้
   *       ช่วงก่อนรัน migration ทุกคนจะได้หน้าตาที่สุ่มจาก id แทน
   *       ซึ่งใช้งานได้ปกติทุกอย่าง
   */
  type ProfileRow = {
    display_name: string
    username: string | null
    nickname: string | null
    avatar_url: string | null
    appearance?: unknown
  }

  const wide = await supabase
    .from('profiles')
    .select(`${columns}, appearance`)
    .eq('id', user.id)
    .maybeSingle()

  const row = (wide.error
    ? (await supabase.from('profiles').select(columns).eq('id', user.id).maybeSingle()).data
    : wide.data) as ProfileRow | null

  if (!row?.username) return null

  return {
    id: user.id,
    displayName: row.display_name,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    appearance: row.appearance ?? null,
  }
}

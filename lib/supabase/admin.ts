import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { publicEnv, supabaseServerEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * ★★★ SERVICE ROLE CLIENT — BYPASS RLS ทั้งหมด ★★★
 *
 * `import 'server-only'` บรรทัดบนสุดคือด่านกันจริง:
 * ถ้ามีไฟล์ไหนที่ลงท้ายด้วย 'use client' เผลอ import ไฟล์นี้เข้าไป
 * `next build` จะ **ล้มเหลว** ไม่ใช่แค่ warning — service role key จึงหลุดไป
 * browser bundle ไม่ได้โดยโครงสร้าง ไม่ใช่โดยวินัยของคนเขียนโค้ด
 *
 * กฎการใช้งาน:
 *   1. ใช้ได้เฉพาะใน Route Handler ที่ **ตรวจสิทธิ์เสร็จแล้ว** เท่านั้น
 *   2. อย่าส่ง user input ดิบ ๆ เข้า query — ผ่าน Zod ก่อนเสมอ
 *   3. mutation ที่มีการแข่งกัน (queue / playback) ให้เรียกผ่าน RPC
 *      ไม่ใช่ .from().update() ตรง ๆ เพราะ RPC มี advisory lock + CAS อยู่ข้างใน
 */

let cached: ReturnType<typeof build> | null = null

function build() {
  const pub = publicEnv()
  const srv = supabaseServerEnv()

  return createClient<Database>(
    pub.NEXT_PUBLIC_SUPABASE_URL,
    srv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // ไม่มี "ผู้ใช้" ใน context นี้ — ห้ามเก็บ/รีเฟรช session ใด ๆ
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      // ไม่เปิด realtime บน client ตัวนี้ — ฝั่ง server ไม่ต้อง subscribe อะไร
      global: { headers: { 'x-application-name': 'music-room-server' } },
    },
  )
}

export function getSupabaseAdminClient() {
  cached ??= build()
  return cached
}

export type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>

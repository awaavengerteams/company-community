'use client'

import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Supabase client สำหรับ browser — ใช้ anon key
 *
 * ขอบเขตของ client ตัวนี้ตาม architecture:
 *   ✅ SELECT ผ่าน RLS
 *   ✅ subscribe Realtime (postgres_changes + presence)
 *   ✅ auth (anonymous sign-in, session)
 *   ❌ INSERT / UPDATE / DELETE — ไม่มี RLS policy รองรับ จะถูกปฏิเสธเสมอ
 *      การเขียนทุกอย่างต้องผ่าน Route Handler ที่ /api/*
 *
 * เป็น singleton ต่อหนึ่ง browser tab เพื่อไม่ให้เกิด Realtime connection ซ้ำซ้อน
 */

let cached: ReturnType<typeof createClient> | null = null

function createClient() {
  const env = publicEnv()
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      realtime: {
        // จำกัดจำนวน event ต่อวินาทีต่อ client กัน UI ถูกถล่มด้วย payload
        params: { eventsPerSecond: 20 },
      },
    },
  )
}

export function getSupabaseBrowserClient() {
  cached ??= createClient()
  return cached
}

export type SupabaseBrowserClient = ReturnType<typeof getSupabaseBrowserClient>

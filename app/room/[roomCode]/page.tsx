import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SignInScreen } from '@/components/SignInScreen'
import { JoinGate } from '@/components/room/JoinGate'
import { RoomClient } from '@/components/room/RoomClient'
import { RoomUnavailable } from '@/components/room/RoomUnavailable'
import { SetupRequired } from '@/components/room/SetupRequired'
import { envStatus } from '@/lib/env'
import { parseRoomCode } from '@/lib/room/code'
import { loadRoomPage } from '@/lib/room/load-room-page'
import { getT } from '@/lib/i18n/server'

/**
 * หน้าห้อง — เป็น Server Component เพื่อให้ผู้ใช้เห็นข้อมูลจริงตั้งแต่ HTML ชุดแรก
 *
 * ★ ทางเลือกที่ไม่เอา: render โครงว่างแล้วให้ client ยิง fetch เอง
 *   จะเกิดช่วงกะพริบที่หน้าจอว่างเปล่าทุกครั้งที่เข้าห้อง และบนมือถือที่เน็ตช้า
 *   ช่วงนั้นยาวพอที่ผู้ใช้จะคิดว่าเว็บค้าง
 *
 *   การดึงข้อมูลฝั่ง server ยังตัด round trip ทิ้งไปหนึ่งรอบเต็ม
 *   ซึ่งสำคัญเป็นพิเศษกับห้องฟังเพลง — ยิ่งเข้าห้องเร็ว ยิ่งเริ่มฟังพร้อมคนอื่นเร็ว
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: PageProps<'/room/[roomCode]'>): Promise<Metadata> {
  const { roomCode } = await params
  const code = parseRoomCode(roomCode)
  const { t } = await getT()
  return { title: code ? t('room.pageTitle', { code }) : t('room.pageNotFound') }
}

export default async function RoomPage({ params }: PageProps<'/room/[roomCode]'>) {
  const { roomCode } = await params

  // รูปแบบรหัสผิดตั้งแต่ต้น → 404 ทันที ไม่ต้องไปรบกวนฐานข้อมูล
  const code = parseRoomCode(roomCode)
  if (!code) notFound()

  // ★ เช็คเฉพาะ Supabase — ห้องเปิดได้แม้ยังไม่มี YouTube API key
  //   (IFrame Player ไม่ได้ใช้ key เลย มีแต่การค้นหาที่ใช้)
  if (!envStatus().supabaseOk) {
    return <SetupRequired code={code} />
  }

  const result = await loadRoomPage(code)

  switch (result.kind) {
    case 'not-found':
      notFound()

    // ★ ฐานข้อมูลล่มไม่ใช่ 404 — ห้องยังอยู่ แค่ตอนนี้อ่านไม่ได้
    case 'unavailable':
      return <RoomUnavailable code={code} />

    /**
     * ★★★ ยังไม่สมัคร → เห็นแค่หน้าเข้าใช้งาน ไม่เห็นแม้แต่ชื่อห้อง
     *
     *     ตัดสินที่ server ก่อน render แปลว่า HTML ที่ส่งออกไปไม่มีข้อมูล
     *     ของห้องอยู่เลย — ต่างจากการซ่อนด้วย overlay ฝั่ง client
     *     ซึ่งข้อมูลยังอยู่ใน DOM ให้เปิด devtools อ่านได้
     */
    case 'needs-signin':
      return <SignInScreen />

    // สมัครแล้วแต่ยังไม่ได้เข้าร่วมห้องนี้ → ยืนยัน + ปลดล็อก autoplay ก่อน
    case 'needs-join':
      return <JoinGate preview={result.preview} />

    case 'ready':
      return (
        <RoomClient bootstrap={result.bootstrap} youtubeConfigured={envStatus().youtubeOk} />
      )
  }
}

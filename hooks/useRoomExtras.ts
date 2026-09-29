'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api/client'
import type { QuizDto } from '@/types/room'

/**
 * กิจกรรมในห้อง — โหวตข้ามเพลง + เกมทายเพลง
 *
 * ★★ ทำไมเปิด channel ใหม่ ไม่ต่อท้าย useRoomChannel ที่มีอยู่
 *
 *    channel เดิมคือเส้นเลือดใหญ่ของห้อง: คิว · การเล่น · แชท · presence
 *    ทุกการแก้ตรงนั้นเสี่ยงกับสิ่งที่ทำงานดีอยู่แล้วทั้งหมด
 *
 *    ★ กิจกรรมเป็นของที่ "ไม่มีก็ยังฟังเพลงได้" การแยก channel จึงแปลว่า
 *      ถ้าตารางเกมมีปัญหาอะไร ห้องยังทำงานครบทุกอย่างเหมือนเดิม
 *      (และ topic คนละชื่อกัน จึงไม่ชนกับ channel เดิม)
 */
export function useRoomExtras({
  roomId,
  roomCode,
  queueItemId,
  listeners,
  enabled,
}: {
  roomId: string
  roomCode: string
  /** เพลงที่กำลังเล่น — โหวตผูกกับเพลง ไม่ใช่ผูกกับห้อง */
  queueItemId: string | null
  /** คนที่กำลังฟังอยู่ตอนนี้ ใช้คำนวณเกณฑ์โหวตให้เห็นตรงกับฝั่งเซิร์ฟเวอร์ */
  listeners: number
  enabled: boolean
}) {
  const [votes, setVotes] = useState(0)
  const [myVote, setMyVote] = useState(false)
  const [quiz, setQuiz] = useState<QuizDto | null>(null)
  const itemRef = useRef(queueItemId)
  // ★ เขียน ref ใน effect ไม่ใช่ตอน render — ตอน render React ยังไม่รับประกัน
  //   ว่าผลของ render นี้จะถูกใช้จริง การเขียนทิ้งไว้จึงอาจเป็นค่าที่ไม่เคยเกิดขึ้น
  useEffect(() => {
    itemRef.current = queueItemId
  }, [queueItemId])

  /*
   * ★ เกณฑ์คำนวณซ้ำฝั่งนี้เพื่อ "แสดงผล" เท่านั้น
   *   ตัวจริงอยู่ใน toggle_skip_vote — ถ้าสองฝั่งคิดไม่ตรงกันชั่วขณะ
   *   (เช่นมีคนเพิ่งเข้าห้อง) สิ่งที่เกิดคือตัวเลขบนปุ่มเพี้ยนไปหนึ่ง
   *   ไม่ใช่การข้ามเพลงผิดพลาด
   */
  const needed = Math.max(2, Math.floor(listeners / 2) + 1)

  const refreshVotes = useCallback(async (only?: string | null) => {
    const item = only === undefined ? itemRef.current : only
    if (!item) {
      setVotes(0)
      setMyVote(false)
      return
    }
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase
      .from('skip_votes')
      .select('user_id')
      .eq('queue_item_id', item)
    const { data: session } = await supabase.auth.getUser()
    setVotes(data?.length ?? 0)
    setMyVote(Boolean(data?.some((v) => v.user_id === session.user?.id)))
  }, [])

  const refreshQuiz = useCallback(async () => {
    try {
      const data = await apiFetch<{ quiz: QuizDto | null }>(`/api/rooms/${roomCode}/quiz`)
      setQuiz(data.quiz)
    } catch {
      /* เกมเป็นของเสริม เงียบไว้ดีกว่าขัดจังหวะการฟังเพลง */
    }
  }, [roomCode])

  // เปลี่ยนเพลง = เริ่มนับโหวตใหม่
  useEffect(() => {
    // ★ อ่านจาก argument ตรง ๆ ไม่พึ่ง ref เพราะ effect ที่เขียน ref
    //   อาจยังไม่ทำงานตอน effect นี้ถูกเรียก (ลำดับ effect ไม่ใช่สิ่งที่ควรพึ่ง)
    void refreshVotes(queueItemId)
  }, [queueItemId, refreshVotes])

  useEffect(() => {
    if (!enabled) return
    // ★ ยิงในไทม์เอาต์ศูนย์ ไม่ใช่กลาง effect — setState ระหว่าง effect
    //   ทำให้ React วาดซ้อนกันสองรอบโดยไม่จำเป็น
    const boot = setTimeout(() => void refreshQuiz(), 0)

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`room-extras:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'skip_votes', filter: `room_id=eq.${roomId}` },
        () => void refreshVotes(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_games', filter: `room_id=eq.${roomId}` },
        () => void refreshQuiz(),
      )
      .on(
        // ★ คะแนนกรองตาม game_id ไม่ได้เพราะเราไม่รู้ id ตอนสมัครสมาชิก channel
        //   ยอมรับ event ของทุกเกมแล้วค่อยดึงสถานะของห้องเรามาทับ
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_scores' },
        () => void refreshQuiz(),
      )
      .subscribe()

    return () => {
      clearTimeout(boot)
      void supabase.removeChannel(channel)
    }
  }, [roomId, enabled, refreshVotes, refreshQuiz])

  const toggleVote = useCallback(async () => {
    const result = await apiFetch<{ votes: number; needed: number; skipped: boolean; voted: boolean }>(
      `/api/rooms/${roomCode}/skip/vote`,
      { method: 'POST', body: {} },
    )
    setVotes(result.votes)
    setMyVote(result.voted)
    return result
  }, [roomCode])

  const quizAction = useCallback(
    async (action: 'start' | 'next' | 'stop') => {
      const data = await apiFetch<{ quiz: QuizDto | null }>(`/api/rooms/${roomCode}/quiz`, {
        method: 'POST',
        body: { action },
      })
      setQuiz(data.quiz)
    },
    [roomCode],
  )

  return { votes, myVote, needed, toggleVote, quiz, quizAction, refreshQuiz }
}

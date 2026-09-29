'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * ค้นหาด้วยเสียง — Web Speech API
 *
 * ★★ ทำไมไม่ส่งเสียงขึ้น server ไปถอดเอง
 *
 *    เบราว์เซอร์มีตัวถอดเสียงให้อยู่แล้วและใช้ได้ฟรี ถ้าทำเองต้องมี:
 *    บริการถอดเสียง + ค่าใช้จ่ายต่อนาที + การส่งเสียงของผู้ใช้ออกนอกเครื่อง
 *    ซึ่งเป็นข้อมูลที่อ่อนไหวกว่าอะไรทั้งหมดในแอปนี้
 *
 *    ★ ใช้ของเบราว์เซอร์ = เสียงไม่เคยผ่านเซิร์ฟเวอร์เรา เราได้แค่ข้อความ
 *
 * ★ Firefox ยังไม่รองรับ (และไม่มีทีท่าว่าจะรองรับ)
 *   จึงต้องเช็คก่อนแล้วซ่อนปุ่มไปเลย — ปุ่มที่กดแล้วไม่เกิดอะไรแย่กว่าไม่มีปุ่ม
 *   (หลักเดียวกับปุ่มแชร์ของเครื่องในกล่องแชร์ห้อง)
 */

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

function getConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ★ นอกคอมโพเนนต์เพื่อให้ reference คงที่ ไม่งั้น React resubscribe ทุก render
const subscribeNoop = () => () => {}
const getSupported = () => getConstructor() !== null
const getSupportedServer = () => false

export type VoiceState = 'idle' | 'listening' | 'denied' | 'error'

export function useVoiceSearch({
  lang = 'th-TH',
  onInterim,
  onResult,
}: {
  lang?: string
  /** ข้อความระหว่างพูด — เอาไปโชว์ในช่องค้นหาให้เห็นว่าระบบได้ยินอะไร */
  onInterim: (text: string) => void
  /** ข้อความสุดท้ายเมื่อพูดจบ — ใช้ค้นหาเลย */
  onResult: (text: string) => void
}) {
  const supported = useSyncExternalStore(subscribeNoop, getSupported, getSupportedServer)
  const [state, setState] = useState<VoiceState>('idle')
  /**
   * ★ ข้อความที่ได้ยินล่าสุด — เก็บไว้ในฮุกเพื่อให้ popup แสดงตัวใหญ่ ๆ ได้
   *   ไม่ยัดลงช่องค้นหาระหว่างพูดเหมือนเดิม เพราะตอนนี้ผู้ใช้กำลังมอง popup
   *   ไม่ได้มองช่องค้นหาที่อยู่ข้างหลัง
   */
  const [transcript, setTranscript] = useState('')
  const recognition = useRef<SpeechRecognitionLike | null>(null)

  const latest = useRef({ onInterim, onResult })
  useEffect(() => {
    latest.current = { onInterim, onResult }
  }, [onInterim, onResult])

  /**
   * ทิ้งตัวที่ฟังอยู่
   *
   * ★★ ต้องถอด handler ออกก่อนค่อย abort — ห้ามสลับลำดับ
   *
   *    abort() ของจริงยิง onend แบบ asynchronous (ไม่ใช่ทันทีเหมือนของปลอม
   *    ในเทสต์) ถ้าปล่อย handler ไว้ onend ของ "ตัวเก่า" จะมาถึงหลังจาก
   *    เราเปิดตัวใหม่ไปแล้ว แล้วมันจะเซ็ต recognition.current = null ทับ
   *    ตัวใหม่ที่กำลังฟังอยู่ — ผลคือไมค์เปิดค้างโดยที่เราไม่มีมือจับมันอีก
   *
   *    ★ ถอด handler = ตัวเก่าตายเงียบ ๆ ไม่มีสิทธิ์พูดถึง state อีกเลย
   */
  const discard = useCallback(() => {
    const previous = recognition.current
    if (!previous) return
    previous.onresult = null
    previous.onerror = null
    previous.onend = null
    recognition.current = null
    previous.abort()
  }, [])

  // เลิกฟังเมื่อออกจากหน้า — ไม่งั้นไมค์ค้างเปิดทิ้งไว้
  useEffect(() => {
    return () => {
      const live = recognition.current
      if (!live) return
      live.onresult = null
      live.onerror = null
      live.onend = null
      recognition.current = null
      live.abort()
    }
  }, [])

  /** ปิดทิ้งทันที ไม่รอผลที่ค้างอยู่ — ใช้ตอนผู้ใช้กดปิดหน้าต่าง */
  const cancel = useCallback(() => {
    discard()
    setTranscript('')
    setState('idle')
  }, [discard])

  const start = useCallback(() => {
    const Ctor = getConstructor()
    if (!Ctor) return

    /**
     * ★★ เริ่มใหม่เสมอ ไม่ใช่ "กดซ้ำ = หยุด"
     *
     *    ตอนยังเป็นปุ่มในแถบบน การกดซ้ำแปลว่า "เลิกฟัง" จึงทำเป็นสวิตช์สลับ
     *    แต่พอย้ายมาเป็นหน้าต่าง start() ถูกเรียกจากสองที่ซึ่งแปลว่า
     *    "เริ่มฟังเดี๋ยวนี้" ทั้งคู่ — กดไมค์เปิดหน้าต่าง · กดลองอีกครั้ง
     *
     *    บั๊กที่เจอจริงตอนยังเป็นสวิตช์: ค้นหาด้วยเสียงเสร็จแล้วกดไมค์ต่อทันที
     *    ตัวเก่ายังไม่ทันยิง onend (ของจริงยิงช้ากว่าผลลัพธ์เสมอ) การกดครั้งนั้น
     *    จึงถูกตีความว่า "สั่งหยุด" — หน้าต่างเด้งขึ้นมาแต่ไม่ได้ฟังอะไรเลย
     *    ผู้ใช้พูดใส่ที่ว่างแล้วสรุปว่าระบบเสีย
     */
    discard()

    const instance = new Ctor()
    instance.lang = lang
    // ★ ไม่ใช่ continuous — หยุดเองเมื่อเงียบ
    //   ค้นหาเพลงคือประโยคสั้น ๆ ประโยคเดียว ไม่ใช่การบอกเล่ายาว ๆ
    instance.continuous = false
    // ★ interim = เห็นข้อความขึ้นระหว่างพูด ทำให้รู้ว่าระบบได้ยินจริง
    //   ถ้ารอจนจบค่อยขึ้น ผู้ใช้จะไม่แน่ใจว่ามันทำงานอยู่ไหมแล้วกดซ้ำ
    instance.interimResults = true
    instance.maxAlternatives = 1

    instance.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result) continue
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) final += text
        else interim += text
      }
      if (interim) {
        setTranscript(interim)
        latest.current.onInterim(interim)
      }
      if (final.trim()) {
        setTranscript(final.trim())
        latest.current.onResult(final.trim())
      }
    }

    instance.onerror = (event) => {
      // ★ แยก "ไม่อนุญาต" ออกจาก error อื่น — ต้องบอกผู้ใช้คนละเรื่องกัน
      //   not-allowed = ต้องไปเปิดสิทธิ์ในเบราว์เซอร์ · อย่างอื่นแค่ลองใหม่
      setState(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'denied'
          : event.error === 'no-speech' || event.error === 'aborted'
            ? 'idle'
            : 'error',
      )
    }

    instance.onend = () => {
      recognition.current = null
      setState((s) => (s === 'listening' ? 'idle' : s))
    }

    try {
      instance.start()
      recognition.current = instance
      setTranscript('')
      setState('listening')
    } catch {
      // start() ซ้อนกันจะโยน — ถือว่าไม่ได้เริ่ม
      recognition.current = null
      setState('idle')
    }
  }, [discard, lang])

  return { supported, state, transcript, listening: state === 'listening', start, cancel }
}

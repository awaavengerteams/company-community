'use client'

import { useEffect, useState } from 'react'
import { PhantomFace, type Variant } from './Phantom'
import { FACES_PER_VARIANT } from '@/lib/home/phantom-face'

/**
 * หน้าจู่โจมแบบสุ่ม
 *
 * ★★★ สุ่มทั้ง "เมื่อไหร่" และ "ตนไหน" — ตายตัวเมื่อไหร่ก็เลิกน่ากลัวเมื่อนั้น
 *
 *     ถ้าตั้งเวลาคงที่ คนจะจับจังหวะได้ภายในสองสามครั้งแล้วรอรับมัน
 *     ★ สุ่มจากห้าค่า (10 วินาที · 30 วินาที · 1 นาที · 2 นาที · 3 นาที)
 *       ทำให้ "รู้ว่าจะมา แต่ไม่รู้เมื่อไหร่" ซึ่งเป็นกลไกที่ทำให้หนังผี
 *       ใช้ได้ผลมากกว่าตัวผีเอง
 *
 *     ★★★ และหน้าที่โผล่มาต้องไม่ซ้ำด้วย — 3 ตน × 30 แบบ = 90 หน้า
 *          ★ ถ้าหน้าเดิมโผล่ครั้งที่สอง ความตกใจจะหายไปทันทีแม้เวลาจะสุ่ม
 *            เพราะสมองจำรูปได้เร็วกว่าจำจังหวะมาก
 *
 * ★★★ สุ่มใน useEffect เท่านั้น ห้ามสุ่มตอน render
 *
 *     ค่าที่ server กับ client สุ่มได้ไม่มีทางตรงกัน แล้ว React จะทิ้งต้นไม้
 *     ทั้งหน้าไปวาดใหม่ ★ บทเรียนเดียวกับ EQ_BARS ของหน้าห้องเพลง
 *
 * ★★ ข้อควรระวังที่จงใจใส่ไว้
 *     1. ไม่เล่นเลยถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว — คนกลุ่มนี้รวมถึงคนที่
 *        มีอาการไวต่อแสงกะพริบ ★ การ์ดใบนี้ไม่ควรแลกมาด้วยสุขภาพของใคร
 *     2. pointer-events ปิด และหายไปเองใน 1 วินาที ★ ไม่มีทางขวางการกดปุ่ม
 *     3. หยุดนับเวลาเมื่อแท็บถูกซ่อน — ไม่ไปโผล่ตอนคนสลับกลับมาพอดี
 *        ★★ อันนั้นไม่ใช่ความน่ากลัว แต่เป็นความรำคาญ
 *     4. ครั้งแรกที่ 3 วินาที ★ เร็วพอให้รู้ว่ามีของแบบนี้ก่อนจะปิดแท็บไป
 *        แต่ยังทันได้เห็นพาดหัวหนึ่งรอบ
 */

const VARIANTS: Variant[] = ['hooded', 'hair', 'gaunt']

/*
 * จังหวะ: ครั้งแรก 3 วินาที จากนั้นทุก 10 วินาทีไปเรื่อย ๆ
 *
 * ★★ เดิมสุ่มช่วงห่าง 10 วิ ถึง 3 นาที เพื่อให้คาดเดาไม่ได้
 *    ★ เจ้าของระบบเลือกจังหวะคงที่แทน เพราะอยากให้หน้าแรก "ตื่นเต้นตลอด"
 *      ไม่ใช่เงียบไปสามนาทีจนเหมือนไม่มีอะไร
 *    ★★ แลกกันตรงที่สมองจะจับจังหวะ 10 วินาทีได้ในสามสี่ครั้ง —
 *       ความตกใจจึงย้ายจาก "เมื่อไหร่" ไปอยู่ที่ "หน้าไหน" แทน
 *       ★ ซึ่งเป็นเหตุผลที่ต้องบังคับไม่ให้หน้าซ้ำกันสองครั้งติด (ดู nextFace)
 */
const FIRST_GAP = 3_000
const LOOP_GAP = 10_000

/** ★ อยู่บนจอสั้นมาก — ยิ่งนานยิ่งกลายเป็นของประดับ ไม่ใช่การจู่โจม */
const ON_SCREEN = 1_000

export function JumpScare() {
  const [shown, setShown] = useState<{ variant: Variant; face: number; at: number } | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let hideTimer = 0
    let nextTimer = 0

    /*
     * ★★★ ห้ามได้หน้าเดิมซ้ำสองครั้งติด
     *
     *     ★ สุ่มอิสระจาก 90 แบบมีโอกาสซ้ำติดกันประมาณ 1 ใน 90 ★★ ฟังดูน้อย
     *       แต่พอผีมาทุก 10 วินาที คนเปิดหน้าทิ้งไว้ครึ่งชั่วโมงจะเจอซ้ำแน่นอน
     *     ★★ และการเจอหน้าเดิมสองครั้งติดคือสิ่งที่ทำลายความรู้สึกว่า
     *        "มันมีหลายแบบ" ทันที — คนจะสรุปว่ามีไม่กี่แบบแล้วเลิกสนใจ
     *
     * ★ จำแค่ครั้งล่าสุดพอ ไม่ต้องจำทั้งหมดที่เคยขึ้น — เป้าหมายคือไม่ให้
     *   "ติดกัน" ไม่ใช่ไม่ให้ซ้ำเลยตลอดกาล ซึ่งจะวนครบ 90 แล้วตันเอง
     */
    let lastKey = ''
    const nextFace = () => {
      for (let tries = 0; tries < 12; tries++) {
        const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]!
        const face = Math.floor(Math.random() * FACES_PER_VARIANT)
        const key = `${variant}:${face}`
        if (key !== lastKey) {
          lastKey = key
          return { variant, face }
        }
      }
      /* ★ ไม่มีทางถึงตรงนี้ในทางปฏิบัติ แต่ต้องมีทางออกเสมอ ไม่วนไม่จบ */
      const variant = VARIANTS[0]!
      return { variant, face: 0 }
    }

    /* ★ รอบแรกเร็วกว่าเพื่อให้คนรู้ว่ามีของแบบนี้ จากนั้นคงที่ */
    let first = true
    const gap = () => {
      if (first) {
        first = false
        return FIRST_GAP
      }
      return LOOP_GAP
    }

    const schedule = () => {
      nextTimer = window.setTimeout(() => {
        /* ★ แท็บที่ไม่ได้มองอยู่ไม่ต้องโดน — ตั้งเวลาใหม่แทน */
        if (document.visibilityState !== 'visible') {
          schedule()
          return
        }

        /* ★ สุ่มทั้งตนและแบบหน้า — 3 × 30 = 90 หน้าที่เป็นไปได้ */
        setShown({ ...nextFace(), at: Date.now() })
        playStinger()

        hideTimer = window.setTimeout(() => {
          setShown(null)
          schedule()
        }, ON_SCREEN)
      }, gap())
    }

    schedule()

    return () => {
      window.clearTimeout(nextTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  if (!shown) return null

  return (
    <div
      aria-hidden="true"
      /* ★ key เปลี่ยนทุกครั้ง เพื่อให้ React สร้าง element ใหม่และอนิเมชันเริ่มใหม่
         ★★ ถ้าใช้ element เดิม อนิเมชันที่เล่นจบแล้วจะไม่เล่นซ้ำ */
      key={shown.at}
      className="scare-layer"
    >
      <div className="scare-veil" />
      <div className="scare-figure">
        <PhantomFace variant={shown.variant} index={shown.face} />
      </div>
      <BloodSplatter />
    </div>
  )
}

/**
 * เลือดที่สาดและไหลลงบนจอ
 *
 * ★★★ สองจังหวะคนละแบบ — สาดเร็ว แล้วไหลช้า
 *
 *     เลือดจริงกระเด็นในเสี้ยววินาที แล้วค่อย ๆ ไหลลงตามแรงโน้มถ่วง
 *     ★ ถ้าทั้งสองอย่างเคลื่อนที่ด้วยความเร็วเดียวกัน สมองจะอ่านว่าเป็นภาพวาด
 *       ที่ถูกเลื่อน ไม่ใช่ของเหลวที่มีน้ำหนัก
 *
 * ★ อยู่บนสุดของชั้นจู่โจม (เหนือหน้าผี) เพราะมันคือสิ่งที่เปื้อน "จอ"
 *   ไม่ใช่สิ่งที่อยู่บนตัวผี
 */
function BloodSplatter() {
  return (
    <svg
      className="scare-blood"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="scare-blood-grad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#3d0205" stopOpacity="0.98" />
          <stop offset="45%" stopColor="#9c0d13" stopOpacity="0.96" />
          <stop offset="100%" stopColor="#d81922" stopOpacity="0.9" />
        </linearGradient>
        {/* ★ ขอบหยักด้วย turbulence — ขอบเลือดที่เรียบคือขอบที่วาดด้วยปากกา */}
        <filter id="scare-blood-edge" x="-20%" y="-10%" width="140%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={23} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={1.6} />
        </filter>
      </defs>

      <g filter="url(#scare-blood-edge)" fill="url(#scare-blood-grad)">
        {/* คราบที่ขอบบน — เหมือนเลือดที่กระเด็นมาโดนจอแล้วไหลลง */}
        <path d="M0 0h100v6c-8 2-12 8-20 8s-10-6-18-6-12 7-20 7-10-8-18-8-14 4-24 2z" opacity="0.95" />

        {/* ★ สายที่ไหลลง ยาวไม่เท่ากันและไหลคนละความเร็ว */}
        {[
          { x: 9, w: 1.6, to: 46, dur: '0.9s', delay: '0.05s' },
          { x: 23, w: 1.1, to: 30, dur: '1s', delay: '0.12s' },
          { x: 38, w: 2.1, to: 64, dur: '0.85s', delay: '0s' },
          { x: 52, w: 1.3, to: 38, dur: '1s', delay: '0.18s' },
          { x: 67, w: 1.8, to: 56, dur: '0.9s', delay: '0.08s' },
          { x: 81, w: 1.2, to: 28, dur: '1s', delay: '0.22s' },
          { x: 93, w: 1.7, to: 50, dur: '0.88s', delay: '0.1s' },
        ].map((run) => (
          <rect key={run.x} x={run.x} y={0} width={run.w} height={0} rx={run.w / 2}>
            <animate
              attributeName="height"
              dur={run.dur}
              begin={run.delay}
              values={`0; ${run.to}`}
              fill="freeze"
            />
          </rect>
        ))}

        {/* หยดที่ปลายสาย — ตกต่อหลังสายหยุด */}
        {[
          { x: 9.8, dur: '0.7s', delay: '0.55s', to: 72 },
          { x: 38.9, dur: '0.6s', delay: '0.5s', to: 88 },
          { x: 67.9, dur: '0.65s', delay: '0.6s', to: 80 },
        ].map((dp) => (
          <ellipse key={dp.x} cx={dp.x} cy={0} rx={1.1} ry={1.7} opacity="0">
            <animate attributeName="cy" dur={dp.dur} begin={dp.delay} values={`20; ${dp.to}`} fill="freeze" />
            <animate attributeName="opacity" dur={dp.dur} begin={dp.delay} values="0; 1; 1" fill="freeze" />
          </ellipse>
        ))}

        {/* สะเก็ดที่กระเด็นไปทั่วจอ */}
        {[
          [18, 34, 1.4], [29, 61, 0.9], [44, 22, 1.1], [58, 70, 1.5],
          [72, 38, 0.8], [86, 63, 1.2], [12, 78, 1], [64, 15, 0.7],
        ].map(([cx, cy, r], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={r} ry={(r as number) * 1.25} opacity="0.85" />
        ))}
      </g>
    </svg>
  )
}

/**
 * เสียงกระแทกสั้น ๆ
 *
 * ★★ สังเคราะห์ด้วย Web Audio ไม่มีไฟล์เสียง — ไม่มีอะไรให้โหลด
 *    และไม่มีทางที่เสียงจะมาช้ากว่าภาพ ซึ่งจะทำให้การจู่โจมเสียจังหวะทันที
 *
 * ★★★ เบราว์เซอร์บล็อกเสียงจนกว่าผู้ใช้จะแตะหน้าเว็บก่อน
 *      ★ ไม่ใช่ข้อจำกัดที่ต้องหลบ แต่เป็นสิ่งที่ถูกแล้ว — เสียงดังจากเว็บที่
 *        เพิ่งเปิดในออฟฟิศเงียบ ๆ คือฝันร้าย ไม่ใช่ความสนุก
 *      ★★ ถ้ายังไม่เคยแตะ จะได้แต่ภาพ ซึ่งก็ยังน่าตกใจอยู่
 */
function playStinger() {
  try {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return

    const ctx = new Ctx()
    if (ctx.state === 'suspended') {
      void ctx.close()
      return
    }

    const now = ctx.currentTime
    const master = ctx.createGain()
    /* ★ ดังพอให้สะดุ้ง ไม่ดังจนคนทั้งห้องหันมามอง */
    master.gain.value = 0.16
    master.connect(ctx.destination)

    /* เสียงทุ้มที่ตกลงเร็ว — แรงกระแทกที่รู้สึกได้มากกว่าได้ยิน */
    const thump = ctx.createOscillator()
    const thumpGain = ctx.createGain()
    thump.frequency.setValueAtTime(140, now)
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.42)
    thumpGain.gain.setValueAtTime(1, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    thump.connect(thumpGain).connect(master)
    thump.start(now)
    thump.stop(now + 0.52)

    /* เสียงซ่าแหลมสั้น ๆ ทับด้านบน — ตัวที่ทำให้สะดุ้ง */
    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }
    noise.buffer = buffer

    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2400
    band.Q.value = 0.8

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.8, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)

    noise.connect(band).connect(noiseGain).connect(master)
    noise.start(now)

    window.setTimeout(() => void ctx.close(), 1200)
  } catch {
    /* ★ เสียงเล่นไม่ได้ไม่ใช่เรื่องที่ต้องทำให้หน้าเว็บพัง */
  }
}

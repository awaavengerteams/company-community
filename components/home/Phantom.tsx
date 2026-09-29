/**
 * ร่างที่เดินผ่านหัวหน้าแรก — สามตน หน้าตาคนละแบบ
 *
 * ★★★ วาดด้วย SVG filter ไม่ใช่รูปทรงเรียบ ๆ
 *
 *     ผีที่วาดด้วยวงกลมกับเส้นโค้งเรียบ ๆ อ่านเป็นการ์ตูนทันทีไม่ว่าจะใส่สีอะไร
 *     ★ เพราะของจริงในธรรมชาติไม่มีขอบที่เรียบสม่ำเสมอ
 *
 *     ★★ feTurbulence + feDisplacementMap บิดขอบทุกเส้นด้วยสัญญาณรบกวนแบบ
 *        fractal ซึ่งเป็นวิธีเดียวกับที่ใช้ทำควันและหมอกในงานกราฟิกจริง
 *        ★ ชายผ้าจึงพลิ้วไม่ซ้ำรูปเดิม และขอบหน้าไม่คมเป็นเส้นวาด
 *
 *     ★★★ ใบหน้าสร้างจาก "เงา" ไม่ใช่ "เส้น"
 *          ตาคือเบ้าตาที่มืดลึก ไม่ใช่วงกลมสองวง · ปากคือโพรงที่เปิดอยู่
 *          ★ สมองอ่านเงาเป็นโครงหน้าสามมิติ แต่อ่านเส้นเป็นภาพวาด
 *
 * ★★ สามตนต้องต่างกันจริง ไม่ใช่ตัวเดียวย่อ-ขยาย
 *
 *    ถ้าใช้รูปเดียวกันสามครั้ง คนดูจะจับได้ภายในรอบเดียวว่าเป็นของก๊อป
 *    ★ จึงต่างกันทั้งสัดส่วนหน้า · สิ่งที่คลุมหัว · ความเร็ว · ทิศทางเดิน
 *      ★★ ตนที่สองเดินสวนทาง และถูกกลับด้านด้วย scaleX(-1) ให้หันหน้าไป
 *         ทางที่เดิน — ของที่เดินถอยหลังคือสิ่งที่ตาจับผิดได้ทันที
 *
 * ★ SMIL (<animate>) ทำให้หมอกไหลโดยไม่ใช้ JS สักบรรทัด
 *   และหยุดเมื่อผู้ใช้ขอลดการเคลื่อนไหว (จัดการที่ globals.css)
 */

export type Variant = 'hooded' | 'hair' | 'gaunt'

/**
 * ★★ id ของ filter/gradient ต้องไม่ซ้ำทั้งหน้า
 *
 *    ไม่ใช่แค่ "ไม่ซ้ำระหว่างสามตน" — หน้าจู่โจม (JumpScare) ใช้หน้าเดียวกัน
 *    ซ้ำอีกชุด ★ ถ้า id ชนกัน ตัวที่วาดทีหลังจะไปใช้ filter ของตัวแรก
 *    แล้วอันหนึ่งจะหายไปเฉย ๆ โดยไม่มี error ให้เห็น
 */
const ids = (v: Variant, scope = 'walk') => ({
  mist: `ph-${scope}-${v}-mist`,
  face: `ph-${scope}-${v}-face`,
  body: `ph-${scope}-${v}-body`,
  skin: `ph-${scope}-${v}-skin`,
  socket: `ph-${scope}-${v}-socket`,
  iris: `ph-${scope}-${v}-iris`,
  shroud: `ph-${scope}-${v}-shroud`,
  hair: `ph-${scope}-${v}-hair`,
  blood: `ph-${scope}-${v}-blood`,
  void: `ph-${scope}-${v}-void`,
})

export function Phantoms() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Phantom variant="hooded" />
      <Phantom variant="hair" />
      <Phantom variant="gaunt" />
    </div>
  )
}

function Phantom({ variant }: { variant: Variant }) {
  const id = ids(variant)

  return (
    <div className={`phantom phantom--${variant}`}>
      <div className="phantom-gait">
        {/* ★ ชั้นบิดแสงข้างหลัง อยู่ใต้ตัวร่าง ทำให้พื้นหลังหักเหตามตัวที่เดินผ่าน */}
        <span className="phantom-warp" />

        <svg viewBox="0 0 220 420" className="phantom-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id={id.mist} x="-35%" y="-20%" width="170%" height="150%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.013 0.022"
                numOctaves={3}
                seed={variant === 'hooded' ? 7 : variant === 'hair' ? 19 : 41}
                result="noise"
              >
                {/*
                 * ★ ขยับความถี่ช้ามาก — เร็วกว่านี้จะกลายเป็นน้ำเดือด ไม่ใช่หมอกลอย
                 *   ★★ แต่ละตนใช้คาบไม่เท่ากัน ไม่งั้นสามตนจะพลิ้วพร้อมกันเป๊ะ
                 *      ซึ่งเป็นจังหวะที่ไม่มีทางเกิดในธรรมชาติ
                 */}
                <animate
                  attributeName="baseFrequency"
                  dur={variant === 'hooded' ? '18s' : variant === 'hair' ? '23s' : '15s'}
                  values="0.013 0.022; 0.017 0.016; 0.013 0.022"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={variant === 'gaunt' ? 20 : 16}
                xChannelSelector="R"
                yChannelSelector="G"
              />
              <feGaussianBlur stdDeviation="1.6" />
            </filter>

            {/* ★ ใบหน้าใช้หมอกอ่อนกว่ามาก — บิดแรงเท่าชายผ้าแล้วหน้าจะละลาย */}
            <filter id={id.face} x="-25%" y="-25%" width="150%" height="150%">
              <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={3} result="fn">
                <animate
                  attributeName="baseFrequency"
                  dur="14s"
                  values="0.02; 0.026; 0.02"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="fn" scale={4} />
              <feGaussianBlur stdDeviation="0.9" />
            </filter>

            <radialGradient id={id.body} cx="50%" cy="30%" r="72%">
              <stop offset="0%" stopColor="#dfe7f2" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#c3cfe0" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#8fa0b8" stopOpacity="0" />
            </radialGradient>

            {/* ★ แสงที่หน้าผาก-โหนกแก้ม ทำให้หน้ามีปริมาตร ไม่แบนเป็นสติกเกอร์ */}
            <radialGradient id={id.skin} cx="50%" cy="36%" r="58%">
              <stop offset="0%" stopColor="#f2f6fb" stopOpacity="0.80" />
              <stop offset="60%" stopColor="#cdd8e8" stopOpacity="0.44" />
              <stop offset="100%" stopColor="#9aa9bd" stopOpacity="0.06" />
            </radialGradient>

            <radialGradient id={id.socket} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#05070c" stopOpacity="0.93" />
              <stop offset="55%" stopColor="#0a0f18" stopOpacity="0.62" />
              <stop offset="100%" stopColor="#0a0f18" stopOpacity="0" />
            </radialGradient>

            <radialGradient id={id.iris} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#eaf2ff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#9fc4ff" stopOpacity="0" />
            </radialGradient>

            <linearGradient id={id.shroud} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#cfd9e8" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#aebbcf" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#8fa0b8" stopOpacity="0" />
            </linearGradient>

            <linearGradient id={id.hair} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#0c1017" stopOpacity="0.72" />
              <stop offset="60%" stopColor="#0c1017" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#0c1017" stopOpacity="0" />
            </linearGradient>

            {/* ★ ความมืดในฮู้ด — ไม่ใช่สีดำทึบ แต่เป็นความลึกที่ไล่ระดับ */}
            <radialGradient id={id.void} cx="50%" cy="46%" r="58%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.96" />
              <stop offset="70%" stopColor="#03060b" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#060a12" stopOpacity="0" />
            </radialGradient>

            <linearGradient id={id.blood} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#4a0407" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#8d0d12" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#c2161d" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          <Body variant={variant} id={id} />
          <Face variant={variant} id={id} />
        </svg>
      </div>
    </div>
  )
}

type Ids = ReturnType<typeof ids>

/**
 * เลือดที่ไหลจากเบ้าตาและมุมปาก
 *
 * ★★★ "ไหล" ไม่ใช่ "มีคราบ"
 *
 *     คราบเลือดที่วาดไว้นิ่ง ๆ อ่านเป็นเมกอัพ ★ สิ่งที่ทำให้สยองคือการเห็นมัน
 *     ยาวขึ้นต่อหน้า — สมองตีความว่าแผลยังเปิดอยู่ ไม่ใช่รอยเก่า
 *
 *     ★★ ใช้ stroke-dashoffset วิ่งจากความยาวเต็มไปหา 0 ซึ่งเป็นวิธี "ลากเส้น"
 *        ที่เบราว์เซอร์วาดได้ลื่นที่สุด (ไม่แตะเลย์เอาต์เลย)
 *        ★ ทางเลือกคือ animate ความสูงของ mask ซึ่งบังคับให้คำนวณ filter ใหม่
 *          ทุกเฟรม — แพงกว่ามากเมื่ออยู่ใต้ feTurbulence
 *
 * ★ หยดที่ร่วงลงมาเป็นก้อนแยก ตกไม่พร้อมกัน — ของเหลวจริงไม่หยดเป็นจังหวะเครื่องจักร
 */
function Blood({
  id,
  streaks,
  dur = '6s',
  drops = [],
}: {
  id: Ids
  streaks: { d: string; w: number; delay?: string }[]
  dur?: string
  drops?: { cx: number; from: number; to: number; r: number; dur: string; delay: string }[]
}) {
  return (
    <g>
      {streaks.map((st, i) => (
        <path
          key={i}
          d={st.d}
          stroke={`url(#${id.blood})`}
          strokeWidth={st.w}
          strokeLinecap="round"
          fill="none"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            dur={dur}
            begin={st.delay ?? '0s'}
            values="100; 0; 0"
            keyTimes="0; 0.55; 1"
            repeatCount="indefinite"
          />
        </path>
      ))}

      {drops.map((dp, i) => (
        <ellipse key={i} cx={dp.cx} cy={dp.from} rx={dp.r} ry={dp.r * 1.35} fill={`url(#${id.blood})`} opacity="0">
          <animate
            attributeName="cy"
            dur={dp.dur}
            begin={dp.delay}
            values={`${dp.from}; ${dp.to}`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            dur={dp.dur}
            begin={dp.delay}
            values="0; 0.95; 0.95; 0"
            keyTimes="0; 0.12; 0.75; 1"
            repeatCount="indefinite"
          />
        </ellipse>
      ))}
    </g>
  )
}


/**
 * เฉพาะใบหน้า ขยายเต็มกรอบ — ใช้ในหน้าจู่โจม
 *
 * ★ ครอบ viewBox ให้แคบลงเหลือแค่หัว จึงได้ภาพระยะประชิดโดยไม่ต้องวาดใหม่
 *   ★★ ถ้าวาดหน้าชุดที่สองแยกต่างหาก วันที่แก้หน้าตนใดตนหนึ่งจะลืมแก้อีกที่
 *      แล้วผีที่เดินผ่านกับผีที่โผล่มาจะเป็นคนละตัวกันโดยไม่มีใครตั้งใจ
 */
export function PhantomFace({ variant }: { variant: Variant }) {
  const id = ids(variant, 'scare')

  return (
    <svg viewBox="55 30 110 140" className="size-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id={id.mist} x="-35%" y="-20%" width="170%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.013 0.022" numOctaves={3} seed={11} result="noise" />
          {/* ★ บิดน้อยกว่าตอนเดินผ่านมาก — ขยายใหญ่แล้วบิดแรงเท่าเดิมจะละลายหมด */}
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={7} xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <filter id={id.face} x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={5} result="fn" />
          <feDisplacementMap in="SourceGraphic" in2="fn" scale={2} />
          <feGaussianBlur stdDeviation="0.35" />
        </filter>
        {/* ★ หน้าจู่โจมสว่างกว่ามาก — มันต้อง "พุ่งเข้ามา" ไม่ใช่ลอยอยู่ไกล ๆ */}
        <radialGradient id={id.skin} cx="50%" cy="36%" r="58%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="60%" stopColor="#d8e2f0" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#93a2b6" stopOpacity="0.10" />
        </radialGradient>
        <radialGradient id={id.socket} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="1" />
          <stop offset="60%" stopColor="#04060a" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#04060a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id.iris} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#cfe2ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id.shroud} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#dbe4f0" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#8fa0b8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id.hair} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#05070b" stopOpacity="0.92" />
          <stop offset="70%" stopColor="#05070b" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#05070b" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id.void} cx="50%" cy="46%" r="58%">
          <stop offset="0%" stopColor="#000000" stopOpacity="1" />
          <stop offset="70%" stopColor="#02040a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#05080f" stopOpacity="0" />
        </radialGradient>

        {/* ★ เลือดในหน้าจู่โจมสดกว่า — มันเพิ่งไหล ไม่ใช่คราบเก่า */}
        <linearGradient id={id.blood} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#5c0508" stopOpacity="1" />
          <stop offset="30%" stopColor="#a60f16" stopOpacity="1" />
          <stop offset="100%" stopColor="#e01e26" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      <Face variant={variant} id={id} />
    </svg>
  )
}

/** ลำตัว — ผ้าคลุมยาว · ชุดขาวบาง · ร่างผอมขาดวิ่น */
function Body({ variant, id }: { variant: Variant; id: Ids }) {
  if (variant === 'hooded') {
    return (
      <g filter={`url(#${id.mist})`}>
        <path
          d="M110 52c33 0 58 26 58 60 0 26-9 44-9 70 0 34 14 52 14 88 0 42-27 66-63 66s-63-24-63-66c0-36 14-54 14-88 0-26-9-44-9-70 0-34 25-60 58-60z"
          fill={`url(#${id.shroud})`}
        />
        {/* ★ ชายผ้าเป็นคลื่นไม่เท่ากัน — ผ้าจริงไม่ตกเป็นขอบตรง */}
        <path
          d="M47 300c10 18 6 40 14 58 7 16 24 22 24 40-14 6-30 2-41-10-14-15-18-40-14-62 2-12 8-20 17-26z"
          fill={`url(#${id.shroud})`}
          opacity="0.75"
        />
        <path
          d="M173 300c-10 18-6 40-14 58-7 16-24 22-24 40 14 6 30 2 41-10 14-15 18-40 14-62-2-12-8-20-17-26z"
          fill={`url(#${id.shroud})`}
          opacity="0.75"
        />
        <ellipse cx="110" cy="150" rx="66" ry="86" fill={`url(#${id.body})`} />
      </g>
    )
  }

  if (variant === 'hair') {
    return (
      <g filter={`url(#${id.mist})`}>
        {/* ชุดยาวบาง ลอยพลิ้วมากกว่าผ้าคลุมหนา */}
        <path
          d="M110 96c28 0 46 20 50 48 5 34-6 60-6 96 0 44-18 74-44 74s-44-30-44-74c0-36-11-62-6-96 4-28 22-48 50-48z"
          fill={`url(#${id.shroud})`}
        />
        <ellipse cx="110" cy="190" rx="52" ry="92" fill={`url(#${id.body})`} opacity="0.8" />
        {/* ★ ผมยาวสยายลงมาถึงกลางลำตัว — เส้นผมเป็นก้อนเงา ไม่ใช่เส้นเดี่ยว ๆ
            ★★ ผมที่วาดเป็นเส้น ๆ จะอ่านเป็นลายเส้นการ์ตูนทันที */}
        <path
          d="M72 86c-10 34-14 70-10 108 3 26 8 44 14 58-14-8-24-26-30-52-8-36-4-84 8-108 4-8 10-8 18-6z"
          fill={`url(#${id.hair})`}
        />
        <path
          d="M148 86c10 34 14 70 10 108-3 26-8 44-14 58 14-8 24-26 30-52 8-36 4-84-8-108-4-8-10-8-18-6z"
          fill={`url(#${id.hair})`}
        />
      </g>
    )
  }

  return (
    <g filter={`url(#${id.mist})`}>
      {/* ร่างผอม เศษผ้าขาดเป็นริ้ว */}
      <path
        d="M110 74c22 0 36 16 38 40 3 30-8 48-8 78 0 40 16 60 16 100 0 36-20 58-46 58s-46-22-46-58c0-40 16-60 16-100 0-30-11-48-8-78 2-24 16-40 38-40z"
        fill={`url(#${id.shroud})`}
        opacity="0.85"
      />
      <path d="M64 320c6 28 2 56 10 76-16-10-24-34-24-56 0-10 6-18 14-20z" fill={`url(#${id.shroud})`} opacity="0.6" />
      <path d="M156 320c-6 28-2 56-10 76 16-10 24-34 24-56 0-10-6-18-14-20z" fill={`url(#${id.shroud})`} opacity="0.6" />
      <ellipse cx="110" cy="170" rx="46" ry="80" fill={`url(#${id.body})`} opacity="0.7" />
    </g>
  )
}

/**
 * ใบหน้า
 *
 * ★★★ สัดส่วนคือสิ่งที่แยก "หน้าคน" ออกจาก "หน้าการ์ตูนสัตว์"
 *
 *     รอบแรกทำหัวกว้าง เบ้าตากลมโต แล้วใส่สันคิ้วเป็นเส้นหนา
 *     ★ ผลที่ได้อ่านเป็นลิงใส่แว่น ไม่ใช่คน — เพราะหัวคนยาวกว่ากว้าง
 *       ตาคนเป็นวงรีเอียง ไม่ใช่วงกลม และสันคิ้วเป็น "เงา" ไม่ใช่เส้น
 */
function Face({ variant, id }: { variant: Variant; id: Ids }) {
  const eyeGlow = (cx: number, cy: number, r: number, dur: string) => (
    <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.88} fill={`url(#${id.iris})`}>
      <animate attributeName="opacity" dur={dur} values="0.95; 0.35; 0.95" repeatCount="indefinite" />
    </ellipse>
  )

  /* ═══ ตนที่ 1 · ไร้หน้าในฮู้ด ═══════════════════════════════════════
   * ★★★ ความน่ากลัวของตนนี้คือ "ไม่มีหน้าให้เห็น"
   *
   *     สมองพยายามหาใบหน้าในทุกรูปทรงโดยอัตโนมัติ ★ พอมันหาไม่เจอในที่ที่
   *     ควรจะมี ความรู้สึกไม่สบายจะเกิดขึ้นเองโดยไม่ต้องวาดอะไรน่ากลัวเลย
   *     ★★ ต่างจากอีกสองตนที่ "เห็นหน้าชัด" — สามตนจึงเล่นคนละกลไก
   */
  if (variant === 'hooded') {
    return (
      <>
        <g filter={`url(#${id.mist})`}>
          {/* ฮู้ดทรงแหลม คลุมลงมาถึงไหล่ */}
          <path
            d="M110 30c36 0 62 30 62 68 0 26-10 46-22 62-6-42-18-66-40-66s-34 24-40 66c-12-16-22-36-22-62 0-38 26-68 62-68z"
            fill={`url(#${id.shroud})`}
          />
          {/* ★ ช่องว่างในฮู้ด — ดำลึก ไม่มีผิวหน้าสักส่วน */}
          <ellipse cx="110" cy="98" rx="33" ry="44" fill={`url(#${id.void})`} />
        </g>

        <g filter={`url(#${id.face})`}>
          {/* จุดแสงสองจุดลึกในความมืด — สิ่งเดียวที่บอกว่ามันหันมาทางเรา */}
          {eyeGlow(99, 96, 3.4, '5s')}
          {eyeGlow(121, 96, 3.4, '5s')}

          {/* ★ เส้นกรามจาง ๆ ที่ขอบล่าง บอกว่ามีอะไรอยู่ในนั้นจริง */}
          <path
            d="M88 126c6 10 14 15 22 15s16-5 22-15"
            stroke="#c9d6e8"
            strokeOpacity="0.16"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />

          {/* เลือดหยดจากในฮู้ด — มองไม่เห็นว่าออกมาจากตรงไหน */}
          <Blood
            id={id}
            dur="6.5s"
            streaks={[
              { d: 'M104 132c-2 12-2 22 0 32', w: 3 },
              { d: 'M118 134c2 10 2 18 1 26', w: 2.4, delay: '1.6s' },
            ]}
            drops={[
              { cx: 104, from: 168, to: 214, r: 2.4, dur: '5s', delay: '2.4s' },
              { cx: 118, from: 162, to: 206, r: 1.9, dur: '6.2s', delay: '4.3s' },
            ]}
          />
        </g>
      </>
    )
  }

  /* ═══ ตนที่ 2 · ผมยาวปิดครึ่งหน้า ═══════════════════════════════════
   * ★★★ ความไม่สมมาตรคือหัวใจ
   *
   *     ตาข้างเดียวที่โผล่ออกมาจากผม น่ากลัวกว่าสองข้างที่เปิดเท่ากัน
   *     ★ เพราะหน้าที่สมมาตรเป๊ะอ่านเป็นหน้ากาก ส่วนหน้าที่ถูกบังครึ่งหนึ่ง
   *       บังคับให้สมองเติมส่วนที่เหลือเอง — แล้วมันเติมของที่แย่กว่าเสมอ
   */
  if (variant === 'hair') {
    return (
      <>
        <g filter={`url(#${id.face})`}>
          {/* หน้ายาวเรียว คางแหลม */}
          <path
            d="M110 48c22 0 34 16 34 40 0 16-2 28-6 40-4 14-14 26-28 26s-24-12-28-26c-4-12-6-24-6-40 0-24 12-40 34-40z"
            fill={`url(#${id.skin})`}
          />

          {/* ★ ตาซ้ายเบิกกว้าง — ใหญ่กว่าสัดส่วนปกติเล็กน้อยจนรู้สึกผิดปกติ */}
          <ellipse cx="97" cy="90" rx="12" ry="10" fill={`url(#${id.socket})`} />
          {eyeGlow(97, 90, 3.6, '3.4s')}

          {/* ตาขวาเหลือแค่เงาที่ลอดออกมาจากผม */}
          <ellipse cx="124" cy="90" rx="10" ry="8" fill={`url(#${id.socket})`} opacity="0.55" />

          <path
            d="M110 92c-1 11-2 16-5 20 3 2 6 2 9 1"
            stroke="#0b1119"
            strokeOpacity="0.22"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />

          {/* ★★ ปากอ้ากว้างแนวตั้ง — ท่ากรีดร้องค้างไว้ ไม่ใช่ปากกลมเล็ก ๆ */}
          <ellipse cx="110" cy="130" rx="8" ry="16" fill={`url(#${id.socket})`}>
            <animate attributeName="ry" dur="7s" values="16; 11; 18; 16" repeatCount="indefinite" />
          </ellipse>

          <Blood
            id={id}
            dur="5.2s"
            streaks={[
              { d: 'M96 99c-2 16 0 28 2 42', w: 3.8 },
              { d: 'M104 146c-2 10-2 18-1 26', w: 3, delay: '1.4s' },
              { d: 'M117 146c2 8 3 16 2 22', w: 2.6, delay: '2.6s' },
            ]}
            drops={[
              { cx: 98, from: 146, to: 200, r: 2.6, dur: '4.4s', delay: '1.6s' },
              { cx: 105, from: 175, to: 226, r: 2.2, dur: '5.6s', delay: '3.3s' },
            ]}
          />
        </g>

        {/* ★ ผมคลุมทั้งด้านขวาและหน้าผาก วาดทับหน้าเพื่อให้บังจริง */}
        <g filter={`url(#${id.mist})`}>
          <path
            d="M110 40c28 0 46 20 48 48 2 26-2 48-8 66-2-26-4-44-8-56-6 10-16 16-26 16-4 0-8-1-12-3 10 26 12 56 8 84-10-22-16-48-18-74-2-20 0-38 4-52-4 6-8 18-10 34-4-16-6-30-4-42 4-14 14-21 26-21z"
            fill={`url(#${id.hair})`}
          />
          <path
            d="M128 62c10 18 14 44 12 70-2 24-8 44-16 58 4-28 6-54 4-76-2-20-6-38-12-48 4-4 8-5 12-4z"
            fill={`url(#${id.hair})`}
            opacity="0.92"
          />
        </g>
      </>
    )
  }

  /* ═══ ตนที่ 3 · กะโหลก ═══════════════════════════════════════════════
   * ★★★ ฟันคือสิ่งที่ทำให้แยกออกจากสองตนแรกทันทีแม้เห็นแค่เสี้ยววินาที
   *
   *     สองตนแรกมี "ปากเป็นโพรง" เหมือนกัน ★ ตนนี้มีฟันเรียงให้เห็น
   *     ซึ่งเป็นรูปทรงที่ตาจับได้เร็วที่สุดในบรรดารายละเอียดบนใบหน้า
   *     ★★ และไม่มีจมูก มีแต่โพรง — อีกจุดที่สมองสะดุดทันทีว่า "ไม่ใช่คน"
   */
  return (
    <g filter={`url(#${id.face})`}>
      {/* กะโหลก: หน้าผากกว้าง โหนกแก้มเหลี่ยม คางแคบ */}
      <path
        d="M110 50c26 0 42 18 42 44 0 16-4 28-10 36-2 12-6 20-10 26-4 6-12 10-22 10s-18-4-22-10c-4-6-8-14-10-26-6-8-10-20-10-36 0-26 16-44 42-44z"
        fill={`url(#${id.skin})`}
      />

      {/* ★ เบ้าตาเหลี่ยมลึก ไม่ใช่วงรี — กะโหลกไม่มีเนื้อมาทำให้ขอบมน */}
      <path d="M84 84c10-4 20-4 26 2 2 10-4 18-12 20-10 2-16-6-16-14 0-4 1-7 2-8z" fill={`url(#${id.socket})`} />
      <path d="M136 84c-10-4-20-4-26 2-2 10 4 18 12 20 10 2 16-6 16-14 0-4-1-7-2-8z" fill={`url(#${id.socket})`} />
      {eyeGlow(96, 96, 2.4, '9s')}
      {eyeGlow(124, 96, 2.4, '9s')}

      {/* โพรงจมูกทรงหัวใจกลับหัว */}
      <path d="M110 108c4 6 7 12 7 17 0 4-3 7-7 7s-7-3-7-7c0-5 3-11 7-17z" fill={`url(#${id.socket})`} />

      {/* ★★ ฟัน: ช่องมืดกว้างแล้ววางซี่สว่างทับ — ไม่ใช่วาดเส้นขีดคั่น */}
      <rect x="88" y="136" width="44" height="16" rx="3" fill={`url(#${id.socket})`} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={90 + i * 7}
          y={137}
          width={5.4}
          height={i === 0 || i === 5 ? 12 : 14}
          rx={1.6}
          fill="#e8eefb"
          opacity={0.72}
        />
      ))}
      {/* เงาใต้แนวฟันบน ทำให้ปากดูลึกไม่ใช่แปะทับ */}
      <rect x="88" y="150" width="44" height="4" rx="2" fill="#05070c" opacity="0.6" />

      <Blood
        id={id}
        dur="7s"
        streaks={[
          { d: 'M99 154c-2 12-2 20-1 28', w: 3.2 },
          { d: 'M110 156c0 10 0 18-1 24', w: 2.6, delay: '1.2s' },
          { d: 'M121 154c2 10 2 18 1 26', w: 3, delay: '2.4s' },
        ]}
        drops={[
          { cx: 99, from: 182, to: 228, r: 2.4, dur: '5.4s', delay: '2.6s' },
          { cx: 121, from: 180, to: 224, r: 2, dur: '6.6s', delay: '4.4s' },
        ]}
      />
    </g>
  )
}

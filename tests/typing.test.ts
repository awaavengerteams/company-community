import {
  accuracy,
  applyInput,
  codePoints,
  emptyTracker,
  isDone,
  judgeRun,
  MAX_ERRORS,
  wpm,
  type Tracker,
} from '@/lib/games/typing/score'
import { passageCount, passageOf, randomPassage } from '@/lib/games/typing/passages'

let pass = 0, fail = 0
function eq(l: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) {
    pass++
    console.log(`  \x1b[32m✓\x1b[0m ${l}`)
  } else {
    fail++
    console.log(`  \x1b[31m✗\x1b[0m ${l}\n      ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(e)}`)
  }
}

/** พิมพ์ทีละ code point เหมือนคีย์บอร์ดจริง — คืน tracker สุดท้าย */
function typeEach(target: string[], text: string, from: Tracker = emptyTracker()): Tracker {
  let t = from
  let value = t.typed.join('')
  for (const ch of codePoints(text)) {
    value += ch
    t = applyInput(t, target, value)
    value = t.typed.join('')
  }
  return t
}
const backspace = (t: Tracker, target: string[], n = 1) => applyInput(t, target, t.typed.slice(0, -n).join(''))

console.log('\n\x1b[1mนับภาษาไทยทีละ code point\x1b[0m')
{
  eq('"ที่" = 3 ตัว (ท ◌ี ◌่)', codePoints('ที่').length, 3)
  eq('"น้ำ" = 3 ตัว (น ◌้ ◌ำ)', codePoints('น้ำ').length, 3)
  eq('"กิน" = 3 ตัว', codePoints('กิน').length, 3)
  const target = codePoints('ที่นี่')
  const t = typeEach(target, 'ที่นี่')
  eq('พิมพ์ "ที่นี่" ครบ = 6 ตัวถูก', t.correct, 6)
  eq('จบข้อความ', isDone(t, target), true)
  eq('แม่นยำ 100%', accuracy(t.firstTry, t.keystrokes), 100)
}

console.log('\n\x1b[1mพิมพ์ผิดแล้วลบแก้ → ความแม่นยำลดลงตามสูตร\x1b[0m')
{
  const target = codePoints('cat')
  let t = typeEach(target, 'cx')
  eq('พิมพ์ผิดตำแหน่งที่ 2 → ถูกต่อเนื่องแค่ 1', t.correct, 1)
  t = backspace(t, target)
  t = typeEach(target, 'at', t)
  eq('แก้แล้วครบ', isDone(t, target), true)
  eq('กดทั้งหมด 4 ครั้ง (c x a t) — ลบไม่นับ', t.keystrokes, 4)
  eq('ถูกครั้งแรก 2 (c, t) — "a" ไม่นับเพราะตำแหน่งนั้นเคยพิมพ์ผิดแล้ว', t.firstTry, 2)
  eq('แม่นยำ 50%', accuracy(t.firstTry, t.keystrokes), 50)
}
{
  /* ไทย: พิมพ์วรรณยุกต์ผิด แล้วแก้ */
  const target = codePoints('ไก่')
  let t = typeEach(target, 'ไก้')
  eq('วรรณยุกต์ผิด → ถูก 2 ตัว', t.correct, 2)
  t = typeEach(target, '่', backspace(t, target))
  eq('แก้วรรณยุกต์แล้วครบ', isDone(t, target), true)
  eq('แม่นยำ 2/4 = 50%', accuracy(t.firstTry, t.keystrokes), 50)
}

console.log('\n\x1b[1mต้องแก้ตัวผิดก่อนถึงจะไปต่อได้\x1b[0m')
{
  const target = codePoints('abcdefghijklmnop')
  const t = typeEach(target, 'zzzzzzzzzzzzzzz')
  eq(`ตัวผิดค้างได้มากสุด ${MAX_ERRORS} ตัว`, t.typed.length, MAX_ERRORS)
  eq('ถูกต่อเนื่อง 0 — ไม่คืบหน้าเลย', t.correct, 0)
  eq('พิมพ์เกินความยาวข้อความไม่ได้', applyInput(emptyTracker(), codePoints('ab'), 'abcd').typed.length, 2)
}

console.log('\n\x1b[1mIME / คีย์บอร์ดมือถือแทนที่ทั้งคำ\x1b[0m')
{
  const target = codePoints('hello world')
  let t = applyInput(emptyTracker(), target, 'helo')
  /* ★ คีย์บอร์ดแก้คำให้ทีเดียว "helo" → "hello " */
  t = applyInput(t, target, 'hello ')
  eq('ค่าใหม่ถูกต่อเนื่อง 6', t.correct, 6)
  eq('นับเฉพาะส่วนที่เปลี่ยน (h e l o + l o space = 7)', t.keystrokes, 7)
  const big = applyInput(emptyTracker(), target, 'hello world')
  eq('ใส่ทีเดียวทั้งข้อความ (ถ้าหลุดด่าน paste มาได้) ก็นับกดเท่าจำนวนตัว', big.keystrokes, 11)
}

console.log('\n\x1b[1mสูตร WPM\x1b[0m')
{
  eq('300 ตัวใน 1 นาที = 60 WPM', wpm(300, 60_000), 60)
  eq('100 ตัวใน 30 วินาที = 40 WPM', wpm(100, 30_000), 40)
  eq('เวลา 0 = 0 WPM (ไม่หารศูนย์)', wpm(100, 0), 0)
}

console.log('\n\x1b[1mตรวจผลที่ server\x1b[0m')
{
  const ok = judgeRun(100, { elapsedMs: 30_000, keystrokes: 105, firstTry: 98 }, 30_400)
  eq('ผลปกติ: ใช้เวลาที่มากกว่า (server 30.4 วิ)', [ok.elapsedMs, ok.valid], [30_400, true])
  const liar = judgeRun(100, { elapsedMs: 2_000, keystrokes: 100, firstTry: 100 }, 40_000)
  eq('หน้าจออ้างว่าเร็วกว่าที่ server เห็น → ใช้เวลาของ server', liar.elapsedMs, 40_000)
  eq('… WPM จึงเป็น 30 ไม่ใช่ 600', liar.wpm, 30)
  const bot = judgeRun(500, { elapsedMs: 10_000, keystrokes: 500, firstTry: 500 }, 10_000)
  eq('600 WPM → บันทึกได้แต่ไม่นับเข้ากระดานอันดับ', [bot.valid, bot.reason], [false, 'TOO_FAST'])
  const fake = judgeRun(100, { elapsedMs: 60_000, keystrokes: 20, firstTry: 50 }, 60_000)
  eq('กดน้อยกว่าความยาวข้อความ → ตัวเลขขัดกัน ไม่นับ', [fake.valid, fake.reason], [false, 'BAD_COUNTS'])
  const slowNet = judgeRun(100, { elapsedMs: 31_000, keystrokes: 100, firstTry: 100 }, 30_000)
  eq('เน็ตช้า (หน้าจอวัดนานกว่า) → ใช้เวลาของหน้าจอ ไม่เสียเปรียบ', slowNet.elapsedMs, 31_000)
}

console.log('\n\x1b[1mคลังข้อความ\x1b[0m')
{
  for (const lang of ['th', 'en'] as const) {
    const total = passageCount(lang, 'short') + passageCount(lang, 'medium')
    eq(`${lang}: อย่างน้อย 50 ข้อความ (มี ${total})`, total >= 50, true)
  }
  const prev = 3
  eq('สุ่มข้อความใหม่ไม่ซ้ำข้อความเดิม (ลอง 200 ครั้ง)', Array.from({ length: 200 }, () => randomPassage('en', 'short', prev)).every((i) => i !== prev), true)
  eq('ลำดับนอกช่วงไม่พัง', typeof passageOf('th', 'short', 9999), 'string')
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน\n`)
if (fail > 0) process.exit(1)

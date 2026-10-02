/**
 * รูปปกให้ประกาศในตลาดนัดและร้านอาหาร
 *
 * ★★★ ทำไมเป็นปกตัวหนังสือ ไม่ใช่รูปถ่ายจริง
 *
 *     ★ รูปถ่ายของจริงปลอมขึ้นมาไม่ได้ และการไปดึงรูปจากเว็บอื่นมาใส่
 *       ★★ จะทำให้ฐานข้อมูลตัวอย่างผูกกับเซิร์ฟเวอร์ที่เราไม่ได้คุม —
 *          วันที่ลิงก์ตาย ตลาดนัดทั้งหน้าจะกลายเป็นรูปแตก
 *     ★ ปกที่พิมพ์ชื่อของลงไปตรง ๆ ตอบโจทย์ที่แท้จริงของการ seed:
 *       ให้เห็นว่า "หน้าจอที่มีรูปทุกใบ" หน้าตาเป็นยังไง — ระยะห่าง ·
 *       สัดส่วน · ชื่อที่ยาวเกินกรอบ ★★ ซึ่งรูปถ่ายสวย ๆ ก็ไม่ได้บอกดีกว่านี้
 *
 * ★★ อัปขึ้นถัง listings ของเราเอง ไม่ใช่ลิงก์ภายนอก
 *    ★ listing_images.url มี constraint ว่าต้องขึ้นต้นด้วย https:// อยู่แล้ว
 *      และถังนี้เป็น public — URL จึงเปิดได้ตรง ๆ โดยไม่ต้องเซ็น
 *
 * ใช้: node scripts/seed-images.mjs --yes
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function loadEnv() {
  let raw = ''
  for (const f of ['.env.local', '.env']) {
    try {
      raw = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      break
    } catch {
      /* ไฟล์ถัดไป */
    }
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (URL_.includes('vackilhpblpkfzonlodl')) {
  console.error('✗ หยุด — โปรเจกต์เก่า ห้ามแตะ')
  process.exit(1)
}
const APPLY = process.argv.includes('--yes')
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

/*
 * ★ วาดด้วย Python/PIL เพราะ Node ไม่มีตัววาดตัวหนังสือในตัว
 *   ★★ และฟอนต์ไทยของเครื่องต้องใช้จริงเพื่อให้สระบนล่างวางถูกที่ —
 *      ปกที่สระลอยผิดตำแหน่งจะดูปลอมยิ่งกว่าไม่มีรูป
 */
const PY = `
import sys, json, math
from PIL import Image, ImageDraw, ImageFont

FONTS = ['/System/Library/Fonts/Supplemental/ThonburiUI.ttc',
         '/System/Library/Fonts/Supplemental/Ayuthaya.ttf',
         '/System/Library/Fonts/Helvetica.ttc']

def font(size):
    for f in FONTS:
        try: return ImageFont.truetype(f, size)
        except Exception: pass
    return ImageFont.load_default()

def wrap(draw, text, fnt, maxw):
    words, lines, cur = list(text), [], ''
    for ch in words:
        t = cur + ch
        if draw.textlength(t, font=fnt) > maxw and cur:
            lines.append(cur); cur = ch
        else:
            cur = t
    if cur: lines.append(cur)
    return lines[:3]

jobs = json.loads(sys.argv[1])
for j in jobs:
    W, H = 900, 675
    a = tuple(j['a']); b = tuple(j['b'])
    img = Image.new('RGB', (W, H), a)
    d = ImageDraw.Draw(img)
    # ★ ไล่สีแนวทแยง — พื้นสีเดียวแบน ๆ อ่านเป็น "รูปหาย" ไม่ใช่ "ปก"
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3)))
    # ★ วงกลมจาง ๆ ให้พื้นไม่เรียบจนดูเหมือน error page
    for i, (cx, cy, r) in enumerate([(W*0.82, H*0.22, 190), (W*0.15, H*0.82, 150)]):
        d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=tuple(min(255, c + 16) for c in b))
    f1 = font(58); f2 = font(30)
    lines = wrap(d, j['title'], f1, W - 150)
    y = H / 2 - len(lines) * 36 - 18
    for ln in lines:
        d.text((75, y), ln, font=f1, fill=(255, 255, 255)); y += 74
    if j.get('sub'):
        d.text((75, y + 10), j['sub'], font=f2, fill=(255, 255, 255, 220))
    img.save(j['out'], 'JPEG', quality=86)
print('ok')
`

/** จานสีที่ไม่ซ้ำกันเกินไป — ของแต่ละชิ้นในตารางต้องแยกออกจากกันด้วยตา */
const PALETTE = [
  [[37, 99, 235], [59, 130, 246]],
  [[190, 24, 93], [236, 72, 153]],
  [[5, 150, 105], [16, 185, 129]],
  [[217, 119, 6], [245, 158, 11]],
  [[109, 40, 217], [139, 92, 246]],
  [[190, 18, 60], [244, 63, 94]],
  [[13, 148, 136], [20, 184, 166]],
  [[71, 85, 105], [100, 116, 139]],
]

const money = (n) =>
  n > 0 ? `฿${new Intl.NumberFormat('en').format(n)}` : 'ฟรี'

async function main() {
  console.log(APPLY ? 'โหมด: เขียนจริง' : 'โหมด: ซ้อม')

  const { data: listings } = await db
    .from('listings')
    .select('id, title, price, kind, created_at')
    .order('created_at', { ascending: false })
    .limit(40)

  const { data: already } = await db.from('listing_images').select('listing_id')
  const has = new Set((already ?? []).map((r) => r.listing_id))
  const todo = (listings ?? []).filter((l) => !has.has(l.id))

  console.log(`ประกาศที่ยังไม่มีรูป: ${todo.length} / ${listings?.length ?? 0}`)
  if (!todo.length || !APPLY) return

  const dir = mkdtempSync(join(tmpdir(), 'seedimg-'))
  const jobs = todo.map((l, i) => ({
    title: l.title,
    sub: l.kind === 'WANTED' ? 'ตามหา' : money(Number(l.price)),
    a: PALETTE[i % PALETTE.length][0],
    b: PALETTE[i % PALETTE.length][1],
    out: join(dir, `${i}.jpg`),
  }))

  execFileSync('python3', ['-c', PY, JSON.stringify(jobs)], { stdio: 'inherit' })

  const rows = []
  for (const [i, l] of todo.entries()) {
    const bytes = readFileSync(jobs[i].out)
    const path = `seed/${l.id}.jpg`
    const { error } = await db.storage
      .from('listings')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
    if (error) {
      console.error(`  ✗ อัป ${l.title}:`, error.message)
      continue
    }
    const { data: pub } = db.storage.from('listings').getPublicUrl(path)
    rows.push({ listing_id: l.id, url: pub.publicUrl, sort: 0 })
  }

  const { error } = await db.from('listing_images').insert(rows)
  if (error) console.error('✗ listing_images:', error.message)
  else console.log(`listing_images ← ${rows.length} แถว`)

  /*
   * ★★ ไม่ทำรูปให้ร้านอาหาร ทั้งที่ตาราง restaurants มีคอลัมน์ image_path
   *
   *    ★ /api/office/food/restaurants คืน imagePath ออกมาก็จริง ★★ แต่ไม่มี
   *      คอมโพเนนต์ไหนในหน้าอาหารเอาไปวาดเลยสักที่ (เช็กแล้วด้วย grep)
   *    ★ ใส่ข้อมูลที่ไม่มีหน้าไหนแสดง = ข้อมูลที่ไม่มีใครรู้ว่าถูกหรือผิด
   *      ★★ และทำให้คนอ่านโค้ดวันหลังเข้าใจผิดว่าฟีเจอร์นี้ทำเสร็จแล้ว
   */
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})

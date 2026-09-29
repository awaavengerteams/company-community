/**
 * ออฟฟิศของลอบบี้ — สร้างแผนที่จากรายชื่อห้องจริง
 *
 * ★★★ ทำไมสร้างด้วยโค้ด ไม่วาดแผนที่ตายตัวไว้
 *
 *     ห้องในระบบเกิดและหายทุกวัน แผนที่ที่วาดตายตัวจะมีโซนว่างเปล่า
 *     ของห้องที่ปิดไปแล้ว และไม่มีที่ให้ห้องใหม่ทันทีที่มีคนเปิด
 *
 *     ★ สร้างจากลำดับห้อง = ห้องเดิมได้ที่เดิมเสมอ (คนจำทางได้)
 *       และห้องใหม่ได้โซนใหม่ต่อท้ายโดยไม่ต้องแตะโค้ดเลย
 *
 * ★★ ทำไมพื้น/กำแพง/เฟอร์นิเจอร์อยู่บน canvas แต่ "คน" อยู่บน DOM
 *
 *    พื้นออฟฟิศมีหลายพันชิ้น วาดเป็น DOM แปลว่าหลายพัน element ที่
 *    เบราว์เซอร์ต้องคิด layout ใหม่ทุกครั้งที่กล้องขยับ — กระตุกแน่นอน
 *    ★ แต่ canvas วาดครั้งเดียวจบ เพราะออฟฟิศไม่เคยขยับ มีแต่กล้องที่ขยับ
 *
 *    ส่วน "คน" มีไม่เกินหลักสิบ และต้องการรูปโปรไฟล์ · ชื่อไทยที่ตัดคำถูก ·
 *    ฟองแชท ซึ่ง DOM ให้ฟรีหมด ★ จึงแบ่งกันตามจุดแข็ง ไม่ใช่เลือกอย่างเดียว
 */

export const TILE = 32

/** ขนาดโซนหนึ่งห้อง (หน่วยเป็นช่อง) */
const ZW = 12
const ZH = 10
/** ทางเดินระหว่างโซน */
const GAP = 4
/** ขอบนอกสุดของแผนที่ */
const PAD = 3
const PER_ROW = 3
/**
 * ขนาดแผนที่ขั้นต่ำ (ช่อง)
 *
 * ★ ตอนมีอยู่ห้องเดียว แผนที่จะเล็กกว่าจอ แล้วขอบจอกลายเป็นพื้นที่ดำ ๆ
 *   ซึ่งดูเหมือนหน้าเว็บโหลดไม่เสร็จมากกว่าดูเหมือน "ออฟฟิศเล็ก"
 *   ★ ปูพื้นให้เต็มจอไว้ก่อนเสมอ แล้วค่อยวางโซนไว้ตรงกลาง
 */
const MIN_COLS = 30
const MIN_ROWS = 24

export type RoomRow = {
  code: string
  name: string
  isLocked: boolean
  listeners: number
  nowPlaying: { title: string; thumbnailUrl: string | null } | null
}

export type Zone = RoomRow & {
  /** กรอบโซนเป็นช่อง (รวมกำแพง) */
  tx: number
  ty: number
  tw: number
  th: number
  /** สีพรมประจำห้อง */
  tint: number
}

export type World = {
  cols: number
  rows: number
  width: number
  height: number
  zones: Zone[]
  /** 1 = เดินทะลุไม่ได้ */
  solid: Uint8Array
  /** จุดเกิด (พิกเซล, อ้างที่เท้า) */
  spawn: { x: number; y: number }
}

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function buildWorld(input: RoomRow[]): World {
  /*
   * ★★★ เรียงตามรหัสห้อง ไม่ใช่ตามลำดับที่ API ส่งมา
   *
   *     /api/rooms/list เรียงตาม "ห้องไหนน่าเข้าที่สุด" ซึ่งถูกต้องสำหรับลิสต์
   *     แต่ลำดับนั้นเปลี่ยนได้ตลอดเวลา — มีคนกดเล่นเพลงห้องหนึ่ง ลำดับก็สลับ
   *
   *     ★ ถ้าแผนที่ใช้ลำดับนั้น ห้องทั้งออฟฟิศจะสลับที่กันเองทุกครั้งที่รีเฟรช
   *       คนที่กำลังยืนอยู่ในห้องจะพบว่าตัวเองไปโผล่กลางทางเดินหรือในกำแพง
   *       (จับได้ตอนทดสอบบนโปรดักชันจริง ปุ่มเข้าห้องหายไปเองทั้งที่ไม่ได้ขยับ)
   *
   *     รหัสห้องไม่มีวันเปลี่ยน ห้องเดิมจึงได้ที่เดิมเสมอ และคนจำทางได้จริง
   */
  const rooms = [...input].sort((a, b) => a.code.localeCompare(b.code))

  // ★ อย่างน้อยหนึ่งแถวเสมอ แผนที่สูงศูนย์ทำให้ canvas ขนาด 0 แล้วจอดำ
  const count = Math.max(rooms.length, 1)
  const rowCount = Math.ceil(count / PER_ROW)
  const colCount = Math.min(count, PER_ROW)

  const contentW = colCount * ZW + (colCount - 1) * GAP
  const contentH = rowCount * ZH + (rowCount - 1) * GAP
  const cols = Math.max(MIN_COLS, PAD * 2 + contentW)
  const rows = Math.max(MIN_ROWS, PAD * 2 + contentH)

  // เหลือที่ว่างเท่าไหร่ก็แบ่งครึ่งซ้าย/ขวา บน/ล่าง ให้โซนอยู่กลางแผนที่
  const originX = Math.floor((cols - contentW) / 2)
  const originY = Math.floor((rows - contentH) / 2)

  const solid = new Uint8Array(cols * rows)
  const mark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return
    solid[y * cols + x] = 1
  }

  const zones: Zone[] = rooms.map((room, index) => {
    const col = index % PER_ROW
    const row = Math.floor(index / PER_ROW)
    return {
      ...room,
      tx: originX + col * (ZW + GAP),
      ty: originY + row * (ZH + GAP),
      tw: ZW,
      th: ZH,
      tint: hash(room.code) % 6,
    }
  })

  for (const zone of zones) {
    /*
     * กำแพงสามด้าน เปิดด้านล่าง
     *
     * ★ เปิดด้านล่างเสมอ ไม่สุ่มด้าน — ทุกโซนมีทางเดินอยู่ใต้ตัวเองแน่นอน
     *   ประตูที่หันไปทางกำแพงแผนที่คือห้องที่เข้าไม่ได้ ซึ่งเป็นบั๊กที่
     *   จะโผล่เฉพาะกับห้องแถวสุดท้ายเท่านั้น — หายากมากถ้าไม่ตั้งใจกัน
     */
    for (let x = 0; x < zone.tw; x++) mark(zone.tx + x, zone.ty)
    for (let y = 0; y < zone.th; y++) {
      mark(zone.tx, zone.ty + y)
      mark(zone.tx + zone.tw - 1, zone.ty + y)
    }
    // มุมล่างสองข้างกันไม่ให้โซนดูเหมือนรั้วครึ่งท่อน
    mark(zone.tx, zone.ty + zone.th - 1)
    mark(zone.tx + zone.tw - 1, zone.ty + zone.th - 1)

    for (const item of zoneItems(zone)) {
      if (item.solid) {
        for (let x = 0; x < item.w; x++) {
          for (let y = 0; y < item.h; y++) mark(zone.tx + item.c + x, zone.ty + item.r + y)
        }
      }
    }
  }

  for (const item of corridorItems(cols, rows, zones)) {
    // ★ ของที่เป็นพื้น (พรมทางเดิน) ต้องเดินผ่านได้
    //   รอบแรกลืมเช็คตรงนี้ พรมเลยกลายเป็นกำแพงล่องหนกลางทางเดิน
    if (item.floor) continue
    for (let x = 0; x < item.w; x++) {
      for (let y = 0; y < item.h; y++) mark(item.c + x, item.r + y)
    }
  }

  /*
   * ★ เกิดที่ทางเดินใต้โซนแรก ไม่ใช่กลางแผนที่
   *   คนเปิดครั้งแรกต้องเห็นห้องอยู่ตรงหน้าทันที ไม่ใช่เห็นพื้นว่าง
   *   แล้วต้องเดินหาว่าห้องอยู่ทางไหน
   */
  const start = spawnTile(cols, rows, zones)
  const spawn = { x: start.c * TILE, y: start.r * TILE }

  /*
   * ★★★ เคลียร์พื้นที่รอบจุดเกิดให้โล่งเสมอ
   *
   *     ของตามทางเดินถูกวางด้วยสูตรจากพิกัด ซึ่งไม่รู้จักจุดเกิดเลย
   *     ★ วันไหนสูตรบังเอิญวางม้านั่งทับจุดเกิดพอดี ทุกคนที่เข้าลอบบี้
   *       จะเกิดมาในของแข็งแล้วขยับไม่ได้เลยสักก้าว — พังเงียบ ๆ
   *       และจะโผล่เฉพาะตอนจำนวนห้องเป็นเลขใดเลขหนึ่งเท่านั้น
   *
   *     กันด้วยการลบ ไม่ใช่ด้วยการหวังว่าสูตรจะไม่ชน
   */
  for (let r = start.r - 1; r <= start.r + 1; r++) {
    for (let c = start.c - 1; c <= start.c + 1; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue
      solid[r * cols + c] = 0
    }
  }

  return { cols, rows, width: cols * TILE, height: rows * TILE, zones, solid, spawn }
}

/* ── ของในโซน ─────────────────────────────────────────────────────── */

export type Item = {
  /** ตำแหน่งเทียบมุมบนซ้ายของโซน (ช่อง) */
  c: number
  r: number
  w: number
  h: number
  kind: string
  solid?: boolean
  /** ของที่ "เป็นพื้น" เช่นพรม ต้องวาดก่อนเฟอร์นิเจอร์เสมอ */
  floor?: boolean
}

/**
 * ผังห้อง
 *
 * ★★★ สามแบบ ไม่ใช่แบบเดียว — นี่คือสิ่งที่ทำให้แผนที่ดูเป็น "ที่จริง"
 *
 *     ตอนแรกทุกห้องจัดโต๊ะเหมือนกันเป๊ะ เหตุผลตอนนั้นคือ "ออฟฟิศจริงก็จัด
 *     เหมือนกันทุกชั้น" ซึ่งฟังดูมีเหตุผลแต่ผลลัพธ์บนจอคือสเปรดชีต:
 *     สายตากวาดผ่านแล้วไม่มีอะไรให้จำ ทุกห้องกลายเป็นห้องเดียวกันหมด
 *
 *     ★ ออฟฟิศจริงมี "ห้องทำงาน" "ห้องประชุม" "มุมนั่งเล่น" ปนกัน
 *       และนั่นคือสิ่งที่ทำให้คนบอกทางกันได้ว่า "ห้องที่มีโซฟาน่ะ"
 *
 *     เลือกแบบจากรหัสห้อง ★ ไม่สุ่ม — ห้องเดิมต้องหน้าตาเดิมทุกครั้งที่เปิด
 */
export function zoneItems(zone: Zone): Item[] {
  const items: Item[] = []
  const add = (c: number, r: number, w: number, h: number, kind: string, opts: Partial<Item> = {}) =>
    items.push({ c, r, w, h, kind, ...opts })

  switch (zone.tint % 3) {
    /* ── ห้องทำงาน ──────────────────────────────────────────── */
    case 0: {
      for (const r of [1, 5]) {
        for (const c of [1, 4, 7]) {
          add(c, r, 3, 1, 'desk', { solid: true })
          add(c + 1, r + 1, 1, 1, 'chair')
        }
      }
      add(4, 0, 3, 1, 'poster')
      add(1, 8, 3, 1, 'sofa', { solid: true })
      add(5, 8, 1, 1, 'table', { solid: true })
      add(7, 8, 1, 1, 'cooler', { solid: true })
      add(10, 1, 1, 1, 'plant', { solid: true })
      add(10, 8, 1, 1, 'plant', { solid: true })
      break
    }

    /* ── ห้องประชุม ─────────────────────────────────────────── */
    case 1: {
      add(1, 2, 8, 5, 'rug', { floor: true })
      add(2, 3, 6, 2, 'mtable', { solid: true })
      for (const c of [2, 4, 6]) {
        add(c, 2, 1, 1, 'chair')
        add(c + 1, 5, 1, 1, 'chair')
      }
      add(3, 0, 4, 1, 'board')
      add(1, 7, 2, 1, 'shelf', { solid: true })
      add(9, 1, 1, 1, 'plant', { solid: true })
      add(9, 7, 1, 1, 'plant', { solid: true })
      add(6, 7, 1, 1, 'cooler', { solid: true })
      break
    }

    /* ── มุมนั่งเล่น ────────────────────────────────────────── */
    default: {
      add(1, 1, 7, 5, 'rug', { floor: true })
      add(2, 1, 3, 1, 'sofa', { solid: true })
      add(2, 5, 3, 1, 'sofa', { solid: true })
      add(6, 2, 1, 1, 'armchair', { solid: true })
      add(6, 4, 1, 1, 'armchair', { solid: true })
      add(3, 3, 2, 1, 'table', { solid: true })
      add(4, 0, 3, 1, 'tv')
      add(9, 1, 1, 2, 'shelf', { solid: true })
      add(1, 8, 1, 1, 'plant', { solid: true })
      add(9, 8, 1, 1, 'plant', { solid: true })
      add(5, 8, 1, 1, 'copier', { solid: true })
      break
    }
  }

  return items
}

/**
 * ตำแหน่งไฟเพดานในห้อง (เทียบมุมบนซ้ายของโซน)
 *
 * ★ แสงคือสิ่งเดียวที่ทำให้ภาพมุมบนดูมี "ที่ว่าง" จริง ๆ
 *   พื้นที่สว่างสม่ำเสมอทั้งแผ่นอ่านได้แค่ว่าเป็นสีพื้น ไม่ใช่ห้อง
 */
export const ZONE_LAMPS: ReadonlyArray<readonly [number, number]> = [
  [3, 2],
  [8, 2],
  [3, 6],
  [8, 6],
]

/**
 * ของตามทางเดิน
 *
 * ★★ ทางเดินที่โล่งคือที่ที่แผนที่ดูเหมือนยังทำไม่เสร็จ
 *
 *    รอบแรกวางของห่าง ๆ (ทุก 4–5 ช่อง แถมสุ่มข้ามอีก) ผลคือพื้นไม้ผืนใหญ่
 *    ที่ไม่มีอะไรเลยคั่นระหว่างห้อง ★ ซึ่งแย่กว่า "ว่าง" — มันอ่านเป็น
 *      "ยังไม่ได้ใส่ของ" เพราะห้องข้าง ๆ แน่นไปหมด
 *
 *    ★ พรมทางเดินยาว ๆ ช่วยได้มากกว่าการเพิ่มของกระจุกกระจิก
 *      เพราะมันบอก "ทางเดิน" ซึ่งเป็นข้อมูลที่ใช้เดินจริง ไม่ใช่แค่ของประดับ
 */
export function corridorItems(cols: number, rows: number, zones: Zone[]): Item[] {
  const items: Item[] = []
  /*
   * ★★ คิดจุดเกิดตรงนี้ด้วย แทนที่จะรับมาเป็นพารามิเตอร์
   *
   *    ฟังก์ชันนี้ถูกเรียกสองที่: ตอนสร้างตารางการชน และตอนวาดภาพ
   *    ★ ถ้าสองที่ได้รายการของไม่เหมือนกันเมื่อไหร่ จะเกิดของที่ "เห็นแต่
   *      เดินทะลุได้" หรือ "เดินไม่ได้แต่มองไม่เห็น" ซึ่งหาสาเหตุยากมาก
   *    การคำนวณจากข้อมูลชุดเดียวกันข้างในจึงปลอดภัยกว่าการส่งค่าเข้ามา
   */
  const start = spawnTile(cols, rows, zones)
  const nearZone = (c: number, r: number, pad = 1) =>
    zones.some(
      (z) =>
        c >= z.tx - pad && c < z.tx + z.tw + pad && r >= z.ty - pad && r < z.ty + z.th + pad,
    )

  /* ── พรมทางเดินใต้แต่ละแถวห้อง ─────────────────────────────── */
  const bands = new Set<number>()
  for (const z of zones) bands.add(z.ty + z.th + Math.floor(GAP / 2))
  for (const r of bands) {
    if (r >= rows - 1) continue
    items.push({ c: 2, r: r - 1, w: cols - 4, h: 2, kind: 'runner', floor: true })
  }

  /* ── ของประดับ ────────────────────────────────────────────── */
  const KINDS = ['plant', 'bench', 'vending', 'cooler', 'copier', 'bigplant', 'shelf', 'bench']
  for (let r = 2; r < rows - 2; r += 2) {
    for (let c = 2; c < cols - 2; c += 3) {
      if (nearZone(c, r)) continue
      // ★ เว้นแถวพรมไว้ให้เดินได้โล่ง ๆ ไม่งั้นทางเดินจะกลายเป็นเขาวงกต
      if (bands.has(r)) continue
      const seed = hash(`${c}:${r}`)
      const pick = seed % 10
      if (pick >= KINDS.length) continue
      /*
       * ★ ขยับตำแหน่งเล็กน้อยตามค่าประจำจุด
       *   วางบนตารางเป๊ะ ๆ ทำให้ของทุกชิ้นเรียงเป็นแถวเหมือนโกดังสินค้า
       *   ไม่ใช่ออฟฟิศที่มีคนใช้งานจริง
       */
      const jc = c + ((seed >> 3) % 2)
      const jr = r + ((seed >> 5) % 2)
      if (nearZone(jc, jr) || bands.has(jr) || bands.has(jr - 1)) continue
      // ★ ห้ามวางของทับจุดเกิด ไม่งั้นทุกคนจะเกิดมายืนคร่อมม้านั่ง
      if (Math.abs(jc - start.c) <= 1 && Math.abs(jr - start.r) <= 1) continue
      items.push({ c: jc, r: jr, w: 1, h: 1, kind: KINDS[pick] ?? 'plant' })
    }
  }
  return items
}

/** ช่องที่ทุกคนเกิด — ★ คำนวณจากผังห้องล้วน ๆ ทุกที่ที่ต้องรู้จึงได้ค่าเดียวกัน */
export function spawnTile(cols: number, rows: number, zones: Zone[]) {
  const first = zones[0]
  if (!first) return { c: Math.floor(cols / 2), r: Math.floor(rows / 2) }
  return { c: first.tx + 4, r: first.ty + first.th + 2 }
}

/* ── ตรวจการชน ────────────────────────────────────────────────────── */

/** ครึ่งความกว้างของตัวละครที่ใช้ชน (แคบกว่าภาพ เพื่อให้เดินผ่านช่องแคบได้) */
const BODY_W = 9
const BODY_H = 7

export function blockedAt(world: World, x: number, y: number) {
  const left = Math.floor((x - BODY_W) / TILE)
  const right = Math.floor((x + BODY_W) / TILE)
  const top = Math.floor((y - BODY_H) / TILE)
  const bottom = Math.floor((y - 1) / TILE)

  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (tx < 0 || ty < 0 || tx >= world.cols || ty >= world.rows) return true
      if (world.solid[ty * world.cols + tx]) return true
    }
  }
  return false
}

/** ยืนอยู่ในโซนไหน — ใช้กรอบโซนตรง ๆ ไม่ใช่ระยะห่างจากจุดกลาง */
export function zoneAt(world: World, x: number, y: number): Zone | null {
  const c = x / TILE
  const r = y / TILE
  for (const zone of world.zones) {
    if (c >= zone.tx && c < zone.tx + zone.tw && r >= zone.ty && r < zone.ty + zone.th) return zone
  }
  return null
}

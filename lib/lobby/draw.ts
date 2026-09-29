import {
  TILE,
  ZONE_LAMPS,
  corridorItems,
  zoneItems,
  type Item,
  type World,
  type Zone,
} from './world'

/**
 * วาดออฟฟิศลง canvas
 *
 * ★★ วาดครั้งเดียวต่อการเปลี่ยนแผนที่/ธีม ไม่ใช่ทุกเฟรม
 *    ออฟฟิศไม่เคยขยับ มีแต่กล้อง ★ การเลื่อนกล้องจึงเป็นแค่ CSS transform
 *    บน canvas ใบเดิม ซึ่งเบราว์เซอร์ทำบน GPU ให้ฟรี
 *
 *    ★ ผลพลอยได้ที่สำคัญ: เมื่อวาดครั้งเดียว เราจ่ายค่าเงา แสง และลายไม้
 *      แบบไล่สีได้เต็มที่โดยไม่กระทบความลื่นของการเดินเลยแม้แต่นิด
 *      — งานที่ถ้าวาดทุกเฟรมจะต้องตัดทิ้งทั้งหมด
 */

type Palette = {
  wood: string
  woodAlt: string
  woodSeam: string
  wall: string
  wallTop: string
  wallBase: string
  glass: string
  glassEdge: string
  desk: string
  deskDark: string
  metal: string
  metalDark: string
  screen: string
  fabric: string
  fabricDark: string
  fabricLight: string
  light: string
  lightMid: string
  paper: string
}

export function paletteFor(dark: boolean): Palette {
  return dark
    ? {
        wood: '#453a33',
        woodAlt: '#493e36',
        woodSeam: 'rgba(0,0,0,0.13)',
        wall: '#4a4763',
        wallTop: '#5d5a7c',
        wallBase: '#343149',
        glass: 'rgba(160,205,235,0.13)',
        glassEdge: 'rgba(200,230,250,0.3)',
        desk: '#6f5137',
        deskDark: '#4f3926',
        metal: '#666c7d',
        metalDark: '#42465a',
        screen: '#79cfe0',
        fabric: '#5b6b83',
        fabricDark: '#44536a',
        fabricLight: '#77899f',
        light: 'rgba(255,236,196,0.16)',
        lightMid: 'rgba(255,236,196,0.06)',
        paper: '#d7d2c6',
      }
    : {
        wood: '#ddc7a8',
        woodAlt: '#e1cdaf',
        woodSeam: 'rgba(120,85,45,0.16)',
        wall: '#c3b7a8',
        wallTop: '#e3dbcf',
        wallBase: '#a2957f',
        glass: 'rgba(150,200,225,0.28)',
        glassEdge: 'rgba(255,255,255,0.8)',
        desk: '#b98d5f',
        deskDark: '#8f6941',
        metal: '#b9bec9',
        metalDark: '#8d93a0',
        screen: '#a8e6f2',
        fabric: '#8fa3bd',
        fabricDark: '#6f85a3',
        fabricLight: '#b3c3d6',
        light: 'rgba(255,246,214,0.62)',
        lightMid: 'rgba(255,246,214,0.24)',
        paper: '#fbf8f2',
      }
}

/** สีพรมประจำห้อง — เลือกจากเลขประจำโซน ★ ไม่สุ่ม ห้องเดิมสีเดิมเสมอ */
const CARPETS_DARK = ['#3b3556', '#2f4256', '#33443c', '#4a3648', '#403c2e', '#2e3e4f']
const CARPETS_LIGHT = ['#cfc4e6', '#c3d8e8', '#c8ddc9', '#e8cdd9', '#e2d7bb', '#c3d5e0']

export function carpetFor(tint: number, dark: boolean) {
  const list = dark ? CARPETS_DARK : CARPETS_LIGHT
  return list[tint % list.length] ?? '#333'
}

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c
  ctx.fillRect(x, y, w, h)
}

/** เงานุ่ม ๆ ใต้ของ — ★ ใช้ไล่สีไม่ใช่วงรีทึบ ขอบคมทำให้ของดูเหมือนสติกเกอร์แปะ */
function softShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strength: number,
) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx)
  g.addColorStop(0, `rgba(0,0,0,${strength})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / rx)
  ctx.translate(-cx, -cy)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function paintWorld(ctx: CanvasRenderingContext2D, world: World, dark: boolean) {
  const p = paletteFor(dark)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, world.width, world.height)

  paintWood(ctx, 0, 0, world.width, world.height, p)
  for (const zone of world.zones) paintCarpet(ctx, zone, dark)
  paintLights(ctx, world, p)
  for (const zone of world.zones) paintZoneWalls(ctx, zone, p)

  /*
   * ★ พรมย่อยต้องวาดก่อนเฟอร์นิเจอร์เสมอ ไม่ใช่ตามลำดับที่ประกาศไว้
   *   ถ้าเรียงตามลำดับเดียว พรมที่ประกาศทีหลังจะไปทับโซฟาที่วางอยู่บนมัน
   */
  for (const zone of world.zones) {
    const items = zoneItems(zone)
    const x0 = zone.tx * TILE
    const y0 = zone.ty * TILE
    for (const item of items) {
      if (item.floor) paintItem(ctx, x0 + item.c * TILE, y0 + item.r * TILE, item, p, dark)
    }
    for (const item of items) {
      if (!item.floor) paintItem(ctx, x0 + item.c * TILE, y0 + item.r * TILE, item, p, dark)
    }
  }

  for (const item of corridorItems(world.cols, world.rows, world.zones)) {
    paintItem(ctx, item.c * TILE, item.r * TILE, item, p, dark)
  }

  paintEdges(ctx, world, dark)
}

/* ══ พื้น ═══════════════════════════════════════════════════════════ */

/**
 * พื้นไม้
 *
 * ★★ ทำไมไม่ใช้ลายหมากรุกแบบเดิม
 *
 *    ลายหมากรุกอ่านง่ายก็จริง แต่มันประกาศตัวเองว่าเป็น "ตาราง" ตลอดเวลา
 *    สายตาเลยเห็นแต่ช่อง ไม่เห็นห้อง ★ และที่แย่กว่าคือมันซ้ำเป๊ะทุกช่อง
 *      จนพื้นที่ว่าง ๆ กลายเป็นวอลเปเปอร์ผืนเดียวยืดออกไป
 *
 *    ★ ไม้แผ่นยาวสลับความยาวและสลับโทนทีละแผ่น ให้ทิศทางกับพื้นที่
 *      และไม่มีจุดไหนซ้ำกันพอจะสังเกตได้ ทั้งที่คำนวณจากตำแหน่งล้วน ๆ
 *      (ต้องคำนวณจากตำแหน่ง ห้ามสุ่ม — พื้นต้องเหมือนเดิมทุกครั้งที่วาดใหม่
 *       ไม่งั้นแค่สลับธีมพื้นทั้งชั้นก็เปลี่ยนลายไปเลย)
 */
function paintWood(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  p: Palette,
) {
  /*
   * ★★ แผ่นแคบและโทนใกล้กันมาก ไม่ใช่แผ่นใหญ่ตัดกันชัด
   *
   *    รอบแรกทำไว้แผ่นสูง 16 ยาว 64–160 แล้วสลับโทนชัด ๆ ผลคือพื้นอ่านเป็น
   *    "กำแพงอิฐที่นอนราบ" ไม่ใช่พื้นไม้ — เพราะสิ่งที่ตาจับได้ก่อนคือ
   *    ★ ขนาดของบล็อก ไม่ใช่สีของมัน บล็อกใหญ่เท่าไหร่ยิ่งอ่านเป็นอิฐ
   *
   *    ★ พื้นเป็นฉากหลัง หน้าที่ของมันคือไม่แย่งสายตาจากคนกับเฟอร์นิเจอร์
   *      ความต่างระดับ 3% ก็พอให้รู้ว่าเป็นไม้แล้ว
   */
  const ROW = 10
  px(ctx, x0, y0, w, h, p.wood)

  for (let y = y0; y < y0 + h; y += ROW) {
    // ★ เลื่อนหัวแถวไม่ให้รอยต่อเรียงตรงกันเป็นเส้นยาว ซึ่งไม้จริงไม่เคยเป็น
    let x = x0 - (hash(`row${y}`) % 6) * 40
    while (x < x0 + w) {
      // ★ แผ่นยาว 160–352 ไม่ใช่ 72–168
      //   ยิ่งรอยต่อถี่ ยิ่งอ่านเป็นอิฐ — ไม้ปาร์เก้จริงคือแผ่นยาวทั้งเส้น
      const len = 160 + (hash(`${x}|${y}`) % 4) * 64
      const tone = hash(`${x}~${y}`) % 7
      if (tone === 0) px(ctx, x, y, len, ROW, p.woodAlt)
      else if (tone === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.018)'
        ctx.fillRect(x, y, len, ROW)
      } else if (tone === 3) {
        ctx.fillStyle = 'rgba(255,255,255,0.014)'
        ctx.fillRect(x + 10, y + 4, len - 22, 1)
      }
      px(ctx, x, y, 1, ROW, p.woodSeam)
      x += len
    }
    px(ctx, x0, y, w, 1, p.woodSeam)
  }
}

function paintCarpet(ctx: CanvasRenderingContext2D, zone: Zone, dark: boolean) {
  const x0 = zone.tx * TILE
  const y0 = zone.ty * TILE
  const w = zone.tw * TILE
  const h = zone.th * TILE

  px(ctx, x0, y0, w, h, carpetFor(zone.tint, dark))

  /*
   * ★ ขนพรม = จุดจาง ๆ กระจายแบบคำนวณจากพิกัด
   *   สีเรียบสนิทอ่านเป็น "แผ่นสี" ไม่ใช่ "พรม" และบนจอ 8 บิตยังเกิด
   *   banding ให้เห็นเป็นแถบ ๆ อีกต่างหาก
   */
  for (let y = y0; y < y0 + h; y += 4) {
    for (let x = x0; x < x0 + w; x += 4) {
      const n = hash(`${x},${y}`) % 7
      if (n === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(x, y, 2, 2)
      } else if (n === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.055)'
        ctx.fillRect(x + 2, y + 1, 2, 2)
      }
    }
  }

  // ขอบพรม — บอกว่าโซนจบตรงไหนแม้ด้านล่างจะไม่มีกำแพง
  ctx.fillStyle = 'rgba(0,0,0,0.14)'
  ctx.fillRect(x0 + 6, y0 + 6, w - 12, 2)
  ctx.fillRect(x0 + 6, y0 + h - 8, w - 12, 2)
  ctx.fillRect(x0 + 6, y0 + 6, 2, h - 12)
  ctx.fillRect(x0 + w - 8, y0 + 6, 2, h - 12)
}

/**
 * ไฟเพดาน
 *
 * ★★★ นี่คือชั้นที่ทำให้ภาพ "ดูมีจริง" มากที่สุดต่อโค้ดหนึ่งบรรทัด
 *
 *     ภาพมุมบนที่สว่างเท่ากันทุกตารางนิ้วไม่มีทางดูเป็นสถานที่ได้
 *     เพราะในโลกจริงไม่มีห้องไหนสว่างเท่ากันหมด
 *
 *     ★ วงแสงนุ่ม ๆ เป็นระยะ + ตัวโคมเล็ก ๆ ตรงกลาง ทำให้สมองเติมเพดาน
 *       ให้เองทันที ทั้งที่เราไม่เคยวาดเพดานสักเส้น
 */
function paintLights(ctx: CanvasRenderingContext2D, world: World, p: Palette) {
  /*
   * ★★★ วาด "แสง" อย่างเดียว ห้ามวาด "ตัวโคม"
   *
   *     รอบแรกวาดสี่เหลี่ยมขาวเล็ก ๆ ไว้กลางวงแสงเพื่อแทนหลอดไฟ
   *     ★ แต่ในภาพมุมบน ทุกอย่างที่วาดลงไปจะถูกอ่านว่า "วางอยู่บนพื้น"
   *       หลอดไฟบนเพดานจึงกลายเป็นเศษกระดาษหล่นอยู่กลางทางเดิน
   *
   *     วงแสงล้วน ๆ สื่อว่ามีไฟอยู่ข้างบนได้ดีกว่า โดยไม่มีอะไรให้เข้าใจผิด
   */
  const pool = (cx: number, cy: number, radius: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    g.addColorStop(0, p.light)
    g.addColorStop(0.45, p.lightMid)
    g.addColorStop(1, 'rgba(255,244,214,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const inZone = (c: number, r: number) =>
    world.zones.some((z) => c >= z.tx && c < z.tx + z.tw && r >= z.ty && r < z.ty + z.th)

  for (let r = 2; r < world.rows; r += 5) {
    for (let c = 2; c < world.cols; c += 5) {
      if (inZone(c, r)) continue
      const cx = c * TILE + TILE / 2
      const cy = r * TILE + TILE / 2
      pool(cx, cy, 96)
    }
  }

  for (const zone of world.zones) {
    for (const [c, r] of ZONE_LAMPS) {
      const cx = (zone.tx + c) * TILE + TILE / 2
      const cy = (zone.ty + r) * TILE + TILE / 2
      pool(cx, cy, 84)
    }
  }
}

/* ══ กำแพง ══════════════════════════════════════════════════════════ */

function paintZoneWalls(ctx: CanvasRenderingContext2D, zone: Zone, p: Palette) {
  const x0 = zone.tx * TILE
  const y0 = zone.ty * TILE
  const w = zone.tw * TILE
  const h = zone.th * TILE

  /*
   * ★ เงาที่กำแพงทอดลงพื้น ต้องวาดก่อนตัวกำแพง
   *   ถ้าวาดทีหลังมันจะไปคลุมตัวกำแพงเองจนกำแพงดูสกปรก
   *   และนี่คือสิ่งเดียวที่ทำให้กำแพงดู "ตั้งอยู่บนพื้น" ไม่ใช่ "แปะบนพื้น"
   */
  const band = (x: number, y: number, bw: number, bh: number, dir: 'y' | 'x', flip = false) => {
    const g =
      dir === 'y'
        ? ctx.createLinearGradient(0, y, 0, y + bh)
        : ctx.createLinearGradient(flip ? x + bw : x, 0, flip ? x : x + bw, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.3)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, bw, bh)
  }
  band(x0, y0 + TILE, w, 34, 'y')
  band(x0 + TILE, y0, 26, h, 'x')
  band(x0 + w - TILE - 26, y0, 26, h, 'x', true)

  for (let c = 0; c < zone.tw; c++) paintWall(ctx, x0 + c * TILE, y0, p, true)
  for (let r = 1; r < zone.th; r++) {
    paintWall(ctx, x0, y0 + r * TILE, p, false)
    paintWall(ctx, x0 + w - TILE, y0 + r * TILE, p, false)
  }
}

/**
 * กำแพงกระจกสูงจากพื้น
 *
 * ★ สูงล้นขึ้นไปกว่าหนึ่งช่องโดยตั้งใจ (16px)
 *   กำแพงที่สูงเท่าพื้นจะดูเหมือนเส้นบนพื้น ไม่ใช่สิ่งกีดขวาง
 *   การล้นขึ้นด้านบนคือวิธีที่เกมมุมบนใช้บอก "นี่คือของที่สูงกว่าคน"
 */
function paintWall(ctx: CanvasRenderingContext2D, x: number, y: number, p: Palette, top: boolean) {
  const RISE = 16
  px(ctx, x, y - RISE, TILE, TILE + RISE, p.wall)
  px(ctx, x, y - RISE, TILE, 5, p.wallTop)
  px(ctx, x, y - RISE + 5, TILE, 1, 'rgba(0,0,0,0.18)')

  const gx = x + 4
  const gy = y - RISE + 8
  const gw = TILE - 8
  const gh = RISE + 10
  px(ctx, gx - 1, gy - 1, gw + 2, gh + 2, p.wallBase)
  px(ctx, gx, gy, gw, gh, p.glass)
  px(ctx, gx, gy, gw, 1, p.glassEdge)
  px(ctx, gx, gy, 1, gh, p.glassEdge)

  // แสงสะท้อนเฉียงบนกระจก
  ctx.save()
  ctx.beginPath()
  ctx.rect(gx, gy, gw, gh)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.09)'
  ctx.beginPath()
  ctx.moveTo(gx + 3, gy + gh)
  ctx.lineTo(gx + 11, gy)
  ctx.lineTo(gx + 16, gy)
  ctx.lineTo(gx + 8, gy + gh)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // บัวเชิงผนัง
  px(ctx, x, y + TILE - 7, TILE, 7, p.wallBase)
  px(ctx, x, y + TILE - 7, TILE, 1, 'rgba(255,255,255,0.12)')
  if (top) px(ctx, x, y + TILE - 1, TILE, 1, 'rgba(0,0,0,0.3)')
}

function paintEdges(ctx: CanvasRenderingContext2D, world: World, dark: boolean) {
  // ★ ขอบแผนที่ต้องมืดลง ไม่งั้นพื้นไม้จะถูกตัดกลางคันเหมือนภาพถูกครอบ
  const depth = 72
  const dim = dark ? 0.38 : 0.22
  const sides: [number, number, number, number, number, number, number, number][] = [
    [0, 0, world.width, depth, 0, 0, 0, depth],
    [0, world.height - depth, world.width, depth, 0, world.height, 0, world.height - depth],
    [0, 0, depth, world.height, 0, 0, depth, 0],
    [world.width - depth, 0, depth, world.height, world.width, 0, world.width - depth, 0],
  ]
  for (const [x, y, w, h, gx1, gy1, gx2, gy2] of sides) {
    const g = ctx.createLinearGradient(gx1, gy1, gx2, gy2)
    g.addColorStop(0, `rgba(0,0,0,${dim})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  }
}

/* ══ เฟอร์นิเจอร์ ═══════════════════════════════════════════════════ */

const SCREENS = ['#79cfe0', '#8fd39a', '#e6b877', '#c79ae8', '#8fb6ef']
const BOOK_COLORS = ['#c0392b', '#2980b9', '#e0a02b', '#27ae60', '#8e44ad', '#16a085']

function paintItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  item: Item,
  p: Palette,
  dark: boolean,
) {
  const w = item.w * TILE
  const h = item.h * TILE
  const seed = hash(`${x}.${y}`)

  switch (item.kind) {
    case 'desk': {
      softShadow(ctx, x + w / 2, y + TILE - 2, w / 2 + 4, 8, 0.3)
      px(ctx, x + 1, y + 5, w - 2, TILE - 9, p.desk)
      px(ctx, x + 1, y + 5, w - 2, 2, 'rgba(255,255,255,0.18)')
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 3, y + 10 + i * 4, w - 6, 1)
      px(ctx, x + 1, y + TILE - 6, w - 2, 2, p.deskDark)
      px(ctx, x + 3, y + TILE - 4, 3, 4, p.metalDark)
      px(ctx, x + w - 6, y + TILE - 4, 3, 4, p.metalDark)

      // แผ่นรองเมาส์ · คีย์บอร์ด · เมาส์
      px(ctx, x + 8, y + 15, 22, 8, dark ? '#2f3340' : '#5c6470')
      px(ctx, x + 10, y + 17, 18, 4, p.metal)
      px(ctx, x + 31, y + 17, 4, 4, p.metalDark)

      paintMonitor(ctx, x + 7, y - 8, p, SCREENS[seed % SCREENS.length] ?? p.screen)
      if (item.w >= 3) {
        paintMonitor(ctx, x + w - 26, y - 5, p, SCREENS[(seed >> 3) % SCREENS.length] ?? p.screen)
        px(ctx, x + w - 12, y + 13, 6, 9, p.paper)
        px(ctx, x + w - 12, y + 13, 6, 2, '#b07a46')
        px(ctx, x + w - 42, y + 16, 10, 7, p.paper)
        px(ctx, x + w - 41, y + 18, 8, 1, 'rgba(0,0,0,0.25)')
      }
      break
    }

    case 'chair': {
      softShadow(ctx, x + 16, y + 24, 12, 5, 0.3)
      px(ctx, x + 7, y + 4, 18, 13, p.metalDark)
      px(ctx, x + 7, y + 4, 18, 3, p.metal)
      px(ctx, x + 9, y + 7, 14, 8, 'rgba(255,255,255,0.06)')
      px(ctx, x + 4, y + 12, 3, 8, p.metalDark)
      px(ctx, x + 25, y + 12, 3, 8, p.metalDark)
      px(ctx, x + 9, y + 15, 14, 8, p.metal)
      px(ctx, x + 9, y + 15, 14, 2, 'rgba(255,255,255,0.14)')
      px(ctx, x + 14, y + 22, 4, 4, p.metalDark)
      px(ctx, x + 10, y + 25, 12, 2, p.metalDark)
      break
    }

    case 'mtable': {
      softShadow(ctx, x + w / 2, y + h - 4, w / 2, 12, 0.32)
      ctx.fillStyle = p.desk
      ctx.beginPath()
      ctx.roundRect(x + 4, y + 4, w - 8, h - 10, 12)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      ctx.beginPath()
      ctx.roundRect(x + 4, y + 4, w - 8, 5, 12)
      ctx.fill()
      px(ctx, x + 4, y + h - 10, w - 8, 3, p.deskDark)
      px(ctx, x + w / 2 - 10, y + h / 2 - 6, 20, 11, p.metalDark)
      px(ctx, x + w / 2 - 8, y + h / 2 - 4, 16, 7, p.screen)
      for (const dx of [-46, 32]) px(ctx, x + w / 2 + dx, y + h / 2 - 4, 10, 7, p.paper)
      px(ctx, x + 20, y + h / 2 + 3, 5, 8, p.paper)
      break
    }

    case 'sofa': {
      softShadow(ctx, x + w / 2, y + TILE - 2, w / 2 + 2, 8, 0.3)
      ctx.fillStyle = p.fabricDark
      ctx.beginPath()
      ctx.roundRect(x + 2, y + 2, w - 4, TILE - 6, 7)
      ctx.fill()
      px(ctx, x + 3, y + 3, w - 6, 8, p.fabricLight)
      const seats = Math.max(1, Math.round((w - 20) / 26))
      for (let i = 0; i < seats; i++) {
        ctx.fillStyle = p.fabric
        ctx.beginPath()
        ctx.roundRect(x + 11 + i * 26, y + 12, 23, 13, 4)
        ctx.fill()
        px(ctx, x + 13 + i * 26, y + 13, 19, 2, 'rgba(255,255,255,0.1)')
      }
      ctx.fillStyle = p.fabricDark
      ctx.beginPath()
      ctx.roundRect(x + 2, y + 8, 8, TILE - 12, 4)
      ctx.fill()
      ctx.beginPath()
      ctx.roundRect(x + w - 10, y + 8, 8, TILE - 12, 4)
      ctx.fill()
      break
    }

    case 'armchair': {
      softShadow(ctx, x + 16, y + 26, 13, 6, 0.3)
      ctx.fillStyle = p.fabricDark
      ctx.beginPath()
      ctx.roundRect(x + 4, y + 4, 24, 24, 7)
      ctx.fill()
      px(ctx, x + 5, y + 5, 22, 6, p.fabricLight)
      ctx.fillStyle = p.fabric
      ctx.beginPath()
      ctx.roundRect(x + 9, y + 13, 14, 12, 4)
      ctx.fill()
      break
    }

    case 'table': {
      softShadow(ctx, x + w / 2, y + 26, w / 2 + 2, 7, 0.3)
      ctx.fillStyle = p.desk
      ctx.beginPath()
      ctx.roundRect(x + 4, y + 8, w - 8, 17, 5)
      ctx.fill()
      px(ctx, x + 5, y + 9, w - 10, 3, 'rgba(255,255,255,0.2)')
      px(ctx, x + 10, y + 25, 4, 5, p.deskDark)
      px(ctx, x + w - 14, y + 25, 4, 5, p.deskDark)
      px(ctx, x + 8, y + 13, 11, 7, seed % 2 ? '#c0392b' : '#2980b9')
      px(ctx, x + 9, y + 15, 9, 1, 'rgba(255,255,255,0.4)')
      px(ctx, x + w - 16, y + 12, 6, 9, p.paper)
      px(ctx, x + w - 16, y + 12, 6, 2, '#b07a46')
      break
    }

    /* ── พรมทางเดิน ───────────────────────────────────────────── */
    case 'runner': {
      ctx.fillStyle = dark ? 'rgba(96,74,118,0.5)' : 'rgba(158,124,178,0.26)'
      ctx.beginPath()
      ctx.roundRect(x + 4, y + 6, w - 8, h - 12, 14)
      ctx.fill()
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(x + 14, y + 14, w - 28, h - 28, 9)
      ctx.stroke()
      break
    }

    case 'rug': {
      const tone = seed % 3
      const base = dark
        ? ['#4b3f5e', '#3f4f5e', '#4e4436'][tone]
        : ['#e6dcf2', '#dfeaf2', '#f2e8d8'][tone]
      ctx.fillStyle = base ?? '#888'
      ctx.beginPath()
      ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 12)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(x + 14, y + 14, w - 28, h - 28, 8)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x + 22, y + 22, w - 44, h - 44, 5)
      ctx.stroke()
      break
    }

    case 'plant':
    case 'bigplant': {
      const s = item.kind === 'bigplant' ? 1.25 : 1
      softShadow(ctx, x + 16, y + 28, 12 * s, 5 * s, 0.32)
      ctx.fillStyle = dark ? '#8b5335' : '#b9703f'
      ctx.beginPath()
      ctx.moveTo(x + 16 - 8 * s, y + 19)
      ctx.lineTo(x + 16 + 8 * s, y + 19)
      ctx.lineTo(x + 16 + 6 * s, y + 30)
      ctx.lineTo(x + 16 - 6 * s, y + 30)
      ctx.closePath()
      ctx.fill()
      px(ctx, x + 16 - 9 * s, y + 18, 18 * s, 3, dark ? '#a0623f' : '#cd8250')
      const leaves: [number, number, number, string][] = [
        [16, s > 1 ? 2 : 6, 8 * s, '#3b8a4c'],
        [16 - 7 * s, 12, 7 * s, '#4fa860'],
        [16 + 7 * s, 12, 7 * s, '#2f7a41'],
        [16, 14, 6 * s, '#58bb6c'],
      ]
      for (const [dx, dy, rr, col] of leaves) {
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.ellipse(x + dx, y + dy, rr, rr - 1, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.beginPath()
        ctx.ellipse(x + dx - rr / 3, y + dy - rr / 3, rr / 2.4, rr / 3, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'bench': {
      softShadow(ctx, x + 16, y + 25, 15, 5, 0.26)
      px(ctx, x + 2, y + 11, 28, 10, p.desk)
      px(ctx, x + 2, y + 11, 28, 2, 'rgba(255,255,255,0.18)')
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(x + 2, y + 15, 28, 1)
      ctx.fillRect(x + 2, y + 18, 28, 1)
      px(ctx, x + 4, y + 21, 3, 6, p.metalDark)
      px(ctx, x + 25, y + 21, 3, 6, p.metalDark)
      break
    }

    case 'shelf': {
      softShadow(ctx, x + w / 2, y + h - 3, w / 2, 6, 0.3)
      px(ctx, x + 2, y - 10, w - 4, h + 6, p.deskDark)
      px(ctx, x + 2, y - 10, w - 4, 3, 'rgba(255,255,255,0.14)')
      const rows = Math.max(1, Math.floor((h + 4) / 12))
      for (let i = 0; i < rows; i++) {
        const sy = y - 6 + i * 12
        px(ctx, x + 4, sy, w - 8, 9, p.desk)
        const books = Math.floor((w - 12) / 5)
        for (let b = 0; b < books; b++) {
          const pick = BOOK_COLORS[hash(`${x}${sy}${b}`) % BOOK_COLORS.length] ?? '#888'
          const bh = 6 + (hash(`h${x}${sy}${b}`) % 3)
          px(ctx, x + 5 + b * 5, sy + 9 - bh, 4, bh, pick)
        }
        px(ctx, x + 4, sy + 9, w - 8, 2, p.deskDark)
      }
      break
    }

    case 'board': {
      px(ctx, x + 2, y + 2, w - 4, 24, p.metalDark)
      px(ctx, x + 4, y + 4, w - 8, 20, '#f4f6f9')
      px(ctx, x + 8, y + 8, Math.round((w - 16) * 0.5), 2, '#3b82f6')
      px(ctx, x + 8, y + 13, Math.round((w - 16) * 0.7), 2, '#ef4444')
      px(ctx, x + 8, y + 18, Math.round((w - 16) * 0.35), 2, '#22c55e')
      px(ctx, x + w - 16, y + 24, 10, 2, p.metal)
      break
    }

    case 'poster': {
      const cols = ['#e63946', '#2a9d8f', '#457b9d', '#e9c46a']
      const each = Math.round((w - 12) / 3)
      for (let i = 0; i < 3; i++) {
        const fx = x + 6 + i * each
        const fw = each - 6
        px(ctx, fx, y + 4, fw, 20, p.metalDark)
        px(ctx, fx + 2, y + 6, fw - 4, 16, cols[(seed + i) % cols.length] ?? '#888')
        px(ctx, fx + 3, y + 7, fw - 6, 4, 'rgba(255,255,255,0.25)')
      }
      break
    }

    case 'tv': {
      px(ctx, x + 6, y + 2, w - 12, 24, '#1b1d22')
      px(ctx, x + 9, y + 5, w - 18, 18, dark ? '#2b3b4a' : '#3d566e')
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 9, y + 5, w - 18, 18)
      ctx.clip()
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.beginPath()
      ctx.moveTo(x + 10, y + 23)
      ctx.lineTo(x + 26, y + 5)
      ctx.lineTo(x + 34, y + 5)
      ctx.lineTo(x + 18, y + 23)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      px(ctx, x + w / 2 - 8, y + 26, 16, 3, '#2b2f36')
      break
    }

    case 'copier': {
      softShadow(ctx, x + 16, y + 28, 14, 6, 0.3)
      px(ctx, x + 4, y - 2, 24, 30, p.metal)
      px(ctx, x + 4, y - 2, 24, 6, p.metalDark)
      px(ctx, x + 7, y + 8, 18, 9, p.metalDark)
      px(ctx, x + 9, y + 18, 14, 4, p.paper)
      px(ctx, x + 22, y + 2, 3, 3, '#22c55e')
      px(ctx, x + 7, y + 2, 10, 2, 'rgba(255,255,255,0.2)')
      break
    }

    case 'cooler': {
      softShadow(ctx, x + 16, y + 28, 10, 5, 0.3)
      px(ctx, x + 10, y + 12, 12, 17, p.metal)
      px(ctx, x + 10, y + 12, 12, 2, 'rgba(255,255,255,0.25)')
      px(ctx, x + 11, y + 1, 10, 12, '#8ecae6')
      px(ctx, x + 11, y + 1, 10, 3, '#c2e9f8')
      px(ctx, x + 12, y + 5, 3, 6, 'rgba(255,255,255,0.45)')
      px(ctx, x + 13, y + 17, 6, 3, p.metalDark)
      px(ctx, x + 14, y + 22, 4, 4, '#3b82f6')
      break
    }

    case 'vending': {
      softShadow(ctx, x + 16, y + 28, 13, 6, 0.32)
      px(ctx, x + 4, y - 6, 24, 34, '#c0392b')
      px(ctx, x + 4, y - 6, 24, 4, '#e05244')
      px(ctx, x + 7, y - 2, 13, 20, dark ? '#1c2430' : '#2c3e50')
      const snack = ['#e9c46a', '#2a9d8f', '#f4a261', '#8ecae6']
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          px(ctx, x + 8 + c * 4, y + r * 6, 3, 4, snack[(seed + r + c) % snack.length] ?? '#888')
        }
      }
      px(ctx, x + 22, y - 2, 4, 10, p.metalDark)
      px(ctx, x + 7, y + 20, 13, 5, p.metalDark)
      break
    }
  }
}

function paintMonitor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: Palette,
  screen: string,
) {
  softShadow(ctx, x + 10, y + 22, 12, 4, 0.22)
  px(ctx, x, y + 2, 20, 15, p.metalDark)
  px(ctx, x + 2, y + 4, 16, 11, screen)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(x + 3, y + 5, 7, 1)
  ctx.fillRect(x + 3, y + 8, 11, 1)
  ctx.fillRect(x + 3, y + 11, 5, 1)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 2, y + 4, 16, 11)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.moveTo(x + 3, y + 15)
  ctx.lineTo(x + 11, y + 4)
  ctx.lineTo(x + 15, y + 4)
  ctx.lineTo(x + 7, y + 15)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  px(ctx, x + 8, y + 17, 4, 3, p.metal)
  px(ctx, x + 5, y + 20, 10, 2, p.metalDark)
}

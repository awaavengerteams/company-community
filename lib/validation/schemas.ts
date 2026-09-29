import { z } from 'zod'
import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from '@/lib/room/code'

/*
 * ★★ ข้อความของ zod ในไฟล์นี้เก็บเป็น "กุญแจแปล" ไม่ใช่ข้อความจริง
 *
 *    schema ถูกใช้ทั้งฝั่ง route handler และฝั่งฟอร์มใน browser
 *    ★ ตัวที่ได้ issue มาเป็นคนแปล — respond.ts สำหรับ API,
 *      และคอมโพเนนต์ฟอร์มสำหรับหน้าเว็บ
 */
/**
 * Zod schema ทั้งหมดของระบบ รวมไว้ที่เดียวเพื่อให้ client กับ server
 * ใช้กฎชุดเดียวกัน — ถ้าแยกกันเขียน จะมีวันที่ client ปล่อยผ่านแต่ server ปฏิเสธ
 * แล้วผู้ใช้เจอ error ที่อธิบายไม่ได้
 *
 * ★ ฝั่ง client validate เพื่อ UX (บอกทันทีว่าผิดตรงไหน)
 *   ฝั่ง server validate เพื่อความปลอดภัย (ไม่เคยเชื่อ client)
 */

export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(ROOM_CODE_PATTERN, 'valid.badRoomCode')

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'valid.needName')
  .max(40, 'valid.nameTooLong')

/*
 * ★★★ ต้องใส่ข้อความให้ "ไม่ได้ส่งมาเลย" ด้วย ไม่ใช่แค่ "ส่งมาเป็นค่าว่าง"
 *
 *     .min(1, key) ครอบเฉพาะกรณีส่งสตริงว่างมา ★ ถ้าไม่ส่ง field นี้มาเลย
 *       zod จะออก error คนละชนิด (invalid_type) แล้วใช้ข้อความอังกฤษของมันเอง
 *       "Invalid input: expected string, received undefined"
 *
 *     ★★ ข้อความนั้นหลุดไปถึงผู้ใช้ได้จริง เพราะชั้น API เอา message ของ zod
 *        ไปใช้เป็นกุญแจแปล — พอไม่ใช่กุญแจที่รู้จัก t() ก็คืนค่าเดิมกลับมา
 *        กลายเป็นภาษาอังกฤษดิบโผล่กลางเว็บที่ตั้งเป็นภาษาเกาหลีอยู่
 *
 *     ★ `error` ของ zod v4 ครอบทุกชนิดที่ไม่ได้ระบุเจาะจงไว้
 */
export const roomNameSchema = z
  .string({ error: 'home.create.nameRequired' })
  .trim()
  .min(1, 'home.create.nameRequired')
  .max(60, 'valid.roomNameTooLong')

/**
 * POST /api/rooms
 *
 * ★★ ชื่อห้องเป็นค่าบังคับ ไม่ใช่ตัวเลือก
 *
 *    เดิมใส่หรือไม่ใส่ก็ได้ แล้วเติมชื่อเริ่มต้นให้ ★ ผลคือห้องเกือบทั้งระบบ
 *      ชื่อ "ห้องฟังเพลง" เหมือนกันหมด — พอเพื่อนบอกว่า "เข้าห้องฟังเพลงสิ"
 *      ก็ไม่รู้ว่าห้องไหน และรายการห้องก็อ่านไม่ออกว่าอันไหนของใคร
 *
 *    ★ บังคับที่ชั้นนี้ด้วย ไม่ใช่แค่ที่ปุ่มในหน้าเว็บ — ปุ่มกันคนที่กดผ่าน UI
 *      ส่วนชั้นนี้กันทุกอย่างที่ยิงเข้ามา
 */
export const createRoomBodySchema = z.object({
  name: roomNameSchema,
})

/** PATCH /api/rooms/[roomCode] — เปลี่ยนชื่อห้อง */
export const updateRoomBodySchema = z.object({
  name: roomNameSchema,
})

/** POST /api/rooms/[roomCode]/join */
export const joinRoomBodySchema = z.object({
  displayName: displayNameSchema.optional(),
})

/** path param ของทุก route ใต้ /api/rooms/[roomCode] */
export const roomCodeParamSchema = z.object({
  roomCode: roomCodeSchema,
})

/**
 * GET /api/youtube/search
 *
 * ★ min 2 ตัวอักษร — คำค้นตัวเดียวคืนผลที่ไม่มีประโยชน์แต่จ่าย 100 units เท่ากัน
 *   และเป็นด่านแรกที่กันการยิงรัวจากการพิมพ์ทีละตัว
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'valid.queryTooShort').max(100, 'valid.queryTooLong'),
  pageToken: z.string().max(200).optional().default(''),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>

/* ── Queue ──────────────────────────────────────────────────────────────── */

/** YouTube video id: base64url 11 ตัวเสมอ */
export const videoIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, 'valid.badVideoId')

/**
 * POST /queue — ★ ส่งมาแค่ videoId เท่านั้น
 *
 * ไม่รับ title / duration / thumbnail จาก client เด็ดขาด
 * เพราะ client แก้ค่าพวกนั้นได้ตามใจ เช่นส่ง duration=1 เพื่อให้เพลง
 * "จบ" ทันทีแล้วข้ามคิวของคนอื่นรัว ๆ หรือส่ง title เป็นข้อความหลอกลวง
 *
 * server ไปดึงข้อมูลจริงจาก cache/YouTube เองเสมอ
 */
export const addToQueueBodySchema = z.object({
  videoId: videoIdSchema,
  /**
   * ขอเพลงนี้ให้ใคร
   *
   * ★ ส่งมาได้แค่ uuid กับข้อความ — RPC เป็นคนตรวจว่า uuid นั้นอยู่ในห้องจริงไหม
   *   ถ้าไม่อยู่มันจะทิ้งเป็น null ให้เอง ไม่ใช่ปฏิเสธทั้ง request
   *   เพราะคนขออาจกดตอนเพื่อนเพิ่งออกจากห้องพอดี ซึ่งไม่ใช่ความผิดของเขา
   */
  dedicatedTo: z.uuid().nullish(),
  dedication: z.string().trim().max(120).nullish(),
})

/** POST /next — ต้องบอกว่า client คิดว่าเพลงไหนกำลังเล่น (compare-and-swap) */
export const advanceBodySchema = z.object({
  expectedQueueItemId: z.uuid().nullable(),
  /** ตำแหน่งที่ player รายงาน — ใช้เป็นหลักฐานประกอบ ไม่ได้เอาไปเขียน DB */
  reportedPosition: z.number().min(0).max(36_000).optional(),
})

/** POST /playback */
export const playbackBodySchema = z.object({
  action: z.enum(['PLAY', 'PAUSE', 'SEEK']),
  position: z.number().int().min(0).max(36_000).optional(),
})

export const queueIdParamSchema = z.uuid()

/**
 * ย้ายเพลงในคิว — ระบุ "ให้ไปต่อหลังเพลงไหน"
 *
 * ★★ ทำไมส่ง afterId ไม่ใช่ index ตัวเลข
 *
 *    ตัวเลขลำดับมีความหมายก็ต่อเมื่อคิวที่ client เห็นตรงกับที่ server ถืออยู่เป๊ะ
 *    แต่ระหว่างที่นิ้วยังลากอยู่ เพลงอาจเล่นจบไปหนึ่งเพลงหรือมีคนแทรกเพิ่ม —
 *    "เอาไปไว้ตำแหน่งที่ 3" จึงกลายเป็นคนละที่กับที่ผู้ใช้เห็นตอนปล่อยนิ้ว
 *
 *    ★ อ้างถึง "เพลงที่อยู่ข้างหน้า" เป็นการบอกเจตนา ไม่ใช่บอกพิกัด
 *      เจตนายังถูกต้องแม้คิวขยับ และถ้าเพลงหมุดนั้นหายไปจริง ๆ server
 *      ตอบ QUEUE_ITEM_NOT_FOUND ได้ตรงไปตรงมาแทนที่จะเดาใจแล้ววางผิดที่
 */
export const reorderQueueBodySchema = z.object({
  /** null = ขึ้นไปเป็นเพลงแรกของคิว */
  afterId: z.uuid().nullable(),
})

export type AddToQueueBody = z.infer<typeof addToQueueBodySchema>
export type AdvanceBody = z.infer<typeof advanceBodySchema>
export type PlaybackBody = z.infer<typeof playbackBodySchema>

export type CreateRoomBody = z.infer<typeof createRoomBodySchema>
export type JoinRoomBody = z.infer<typeof joinRoomBodySchema>

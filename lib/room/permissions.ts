import type { MemberRole } from '@/types/database'
import type { RoomDto } from '@/types/room'

/**
 * Permission matrix ฝั่ง TypeScript
 *
 * ★★ อ่านให้ชัด: ไฟล์นี้ใช้ตัดสินใจ "แสดงปุ่มไหม" เท่านั้น
 *    ไม่ใช่ที่ที่บังคับสิทธิ์จริง
 *
 *    สิทธิ์จริงบังคับใน RPC ของ Postgres (perm_can_* ใน 0004_functions_rpc.sql)
 *    ซึ่ง client แก้ไม่ได้ ต่อให้เปิด devtools แล้วปลดปุ่มที่ disabled
 *    หรือยิง fetch ตรง ๆ ก็ยังโดน RPC ปฏิเสธอยู่ดี
 *
 *    ที่ต้องเขียนซ้ำตรงนี้เพราะการแสดงปุ่มที่กดแล้วขึ้น "คุณไม่มีสิทธิ์"
 *    เป็น UX ที่แย่ — ผู้ใช้ควรเห็นตั้งแต่แรกว่าทำอะไรได้บ้าง
 *
 *    ★ ถ้าแก้กฎที่นี่ ต้องแก้ใน SQL ด้วย และกลับกัน
 *      db-test.sh ครอบคลุมฝั่ง SQL ไว้แล้ว
 */

type PermissionConfig = Pick<
  RoomDto,
  'isLocked' | 'allowGuestAdd' | 'allowMemberSkip' | 'allowMemberControl'
>

/**
 * ★★ นโยบายปัจจุบัน: ทุกคน "ในห้อง" ทำได้เท่ากันหมด (ดู migration 0012)
 *
 *    การอยู่ในห้องคือเส้นแบ่งเดียวที่เหลือ — คนที่ยังไม่ได้กดเข้าห้อง
 *    ทำอะไรไม่ได้สักอย่าง (RPC เช็ค role เป็น null เป็นด่านแรกเสมอ)
 *
 *    ฟังก์ชันพวกนี้ยังรับ role กับ room ไว้เหมือนเดิมทั้งที่แทบไม่ได้ใช้
 *    เพราะเป็นจุดเดียวที่ต้องแก้ถ้าวันหนึ่งอยากกลับไปแยกสิทธิ์อีก
 *    — ลบพารามิเตอร์ทิ้งวันนี้ = ต้องไล่แก้ทุกจุดที่เรียกในวันนั้น
 */

/** เพิ่มเพลงเข้าคิว — ตรงกับ perm_can_add() */
export function canAddToQueue(_role: MemberRole, room: PermissionConfig): boolean {
  // ★ is_locked ยังทำงาน — เป็น "สถานะของห้อง" ไม่ใช่ "สิทธิ์ของคน"
  return !room.isLocked
}

/**
 * ลัดคิว / ข้ามเพลง — ตรงกับ member_can_skip() ใน 0014
 *
 * ★★ อันเดียวที่ไม่ได้เปิดให้ทุกคนแล้ว
 *
 *    ที่เหลือในไฟล์นี้ยังเป็น "อยู่ในห้อง = ทำได้" ตามนโยบายของ 0012
 *    แต่สองการกระทำนี้ทำลายสิ่งที่ทุกคนกำลังฟังอยู่ทันทีและกู้คืนไม่ได้
 *    ต่างจากการเพิ่มเพลงหรือสลับลำดับซึ่งกระทบแค่อนาคตและแก้กลับได้ทัน
 *
 * ★ รับค่าที่ "ตัดสินแล้ว" มาตรง ๆ ไม่รับ role
 *   กฎ "เจ้าของห้องได้เสมอ" ถูกรวมไว้ใน toMemberDto/requireMembership แล้ว
 *   ถ้าที่นี่รับ role แล้วเช็คซ้ำ จะมีกฎเดียวกันอยู่สองที่ให้หลุดกันได้
 */
export function canSkip(me: { canSkip: boolean }): boolean {
  return me.canSkip
}

/**
 * Play / Pause / Seek — ★ ใช้ด่านเดียวกับการลัดคิว (member_can_skip ใน 0016)
 *
 * ★★ ทำไมรวมเป็นสิทธิ์เดียว
 *
 *    การกดหยุดเพลงกลางวงเปลี่ยนสิ่งที่ทุกคนได้ยินทันทีและย้อนไม่ได้ ไม่ต่าง
 *    จากการลัดคิว — คนที่ก่อกวนด้วยอย่างหนึ่งได้ ก็ก่อกวนด้วยอีกอย่างได้
 *
 *    ★ สองสิทธิ์ที่ต้องแจกแยกกันแต่มีผลเหมือนกัน คือภาระของเจ้าของห้อง
 *      โดยไม่ได้อะไรกลับมา
 */
export function canControlPlayback(me: { canSkip: boolean }): boolean {
  return me.canSkip
}

/** ตั้งค่าห้อง / ล้างคิว — ตรงกับ perm_can_manage() */
export function canManageRoom(_role: MemberRole): boolean {
  return true
}

/** ลบเพลงออกจากคิว — ทุกคนในห้องลบได้ทุกเพลงที่ยังไม่ได้เล่น */
export function canRemoveQueueItem(
  _role: MemberRole,
  _userId: string,
  _addedByUserId: string | null,
): boolean {
  return true
}

/**
 * ป้ายบทบาท
 *
 * ★ คืน "กุญแจ" ไม่ใช่ข้อความ เพราะไฟล์นี้ถูกเรียกทั้งจาก client และ server
 *   การให้มันไปรู้จักภาษาปัจจุบันเองแปลว่าต้องรับ locale เข้ามาทุกจุดที่เรียก
 *   ★ ปล่อยให้คนเรียกซึ่งมี t อยู่แล้วเป็นคนแปล ง่ายกว่าและไม่มีทางลืม
 */
export function roleLabelKey(role: MemberRole): 'role.owner' | 'role.member' | 'role.guest' {
  switch (role) {
    case 'OWNER':
      return 'role.owner'
    case 'MEMBER':
      return 'role.member'
    case 'GUEST':
      return 'role.guest'
  }
}

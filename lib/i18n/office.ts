/**
 * ข้อความของโมดูลกิจกรรมออฟฟิศ — ภาษาไทยอย่างเดียว
 *
 * ★★★ ทำไมแยกไฟล์ ไม่ไปรวมกับ dict 16 ภาษาของห้องเพลง
 *
 *     dict เดิมบังคับ `Record<Locale, Record<DictKey, string>>` ครบทั้ง 16 ภาษา
 *     ซึ่งเป็นการออกแบบที่ถูกสำหรับห้องเพลง (ผู้ใช้เป็นใครก็ได้ทั่วโลก)
 *     ★ แต่ผิดสำหรับโมดูลนี้ ซึ่งใช้กันเฉพาะพนักงานในบริษัทเดียว
 *       และมีข้อความหลายร้อยตัว — การบังคับแปล 16 ภาษาจะทำให้การเพิ่ม
 *       ปุ่มหนึ่งปุ่มกลายเป็นการแก้ 16 ไฟล์ โดยที่ไม่มีใครได้ใช้ 14 ภาษานั้นเลย
 *
 *     ★★ แยกไฟล์แล้ว "ห้องเพลงยังเปลี่ยนภาษาได้ครบ 16 ภาษาเหมือนเดิม"
 *        ซึ่งเป็นข้อกำหนดที่เจ้าของระบบย้ำ — ไฟล์นี้ไม่ได้แตะระบบนั้นเลยสักบรรทัด
 *
 * ★★ วันที่อยากได้อังกฤษเพิ่ม (NFR-09) แก้ที่เดียว
 *
 *    เพิ่ม OFFICE_EN แล้วให้ ot() เลือกตาราง — จุดที่เรียกใช้ทั้งหมด
 *    ไม่ต้องแก้สักบรรทัด เพราะทุกที่เรียกผ่าน ot('key') อยู่แล้ว
 *    ★ นี่คือเหตุผลที่ต้องเรียกผ่านฟังก์ชันตั้งแต่วันแรก ไม่ใช่เขียนไทยลงใน JSX ตรง ๆ
 *      การไล่แกะข้อความไทยออกจาก JSX ทีหลังคืองานที่ไม่มีใครอยากทำ
 */

export const OFFICE_TH = {
  /* ── เมนูหลัก (FR-X07 · หัวข้อ 8) ─────────────────────────────── */
  'nav.home': 'หน้าแรก',
  'nav.food': 'กินอะไรดี',
  'nav.food.random': 'สุ่มอาหาร',
  'nav.food.picks': 'ร้านเด็ด',
  'nav.wallet': 'กระเป๋าเงิน',
  'nav.wallet.owed': 'ยอดค้างของฉัน',
  'nav.wallet.create': 'สร้างรายการเงิน',
  'nav.wallet.summary': 'สรุปค่าข้าว',
  'nav.fun': 'สุ่มและเกม',
  'nav.fun.name': 'วงล้อสุ่มชื่อ',
  'nav.fun.team': 'สุ่มทีม',
  'nav.fun.lottery': 'สุ่มเลขเด็ด',
  'nav.market': 'ตลาดนัด',
  'nav.market.all': 'ประกาศทั้งหมด',
  'nav.market.post': 'ลงประกาศ',
  'nav.market.mine': 'ของฉัน',
  'nav.admin': 'ผู้ดูแลระบบ',
  'nav.admin.codes': 'รายชื่อรหัสพนักงาน',
  'nav.admin.users': 'ผู้ใช้งาน',
  'nav.admin.settings': 'ตั้งค่าระบบ',
  'nav.music': 'ห้องฟังเพลง',

  /* ── แถบบน / โปรไฟล์ ─────────────────────────────────────────── */
  'top.notifications': 'การแจ้งเตือน',
  'top.profile': 'โปรไฟล์ของฉัน',
  'top.qr': 'QR รับเงินของฉัน',
  'top.notifySettings': 'ตั้งค่าการแจ้งเตือน',
  'top.password': 'เปลี่ยนรหัสผ่าน',
  'top.signOut': 'ออกจากระบบ',

  /* ── ผูกรหัสพนักงาน (FR-X02) ─────────────────────────────────── */
  'link.title': 'ผูกรหัสพนักงาน',
  'link.lead':
    'เมนูกิจกรรมออฟฟิศใช้ได้เฉพาะพนักงาน กรอกรหัสพนักงานของคุณเพื่อเปิดใช้งาน บัญชีและประวัติในห้องเพลงยังเป็นของเดิมทั้งหมด',
  'link.code': 'รหัสพนักงาน',
  'link.codeHint': 'ตัวอักษร A-Z ตัวเลข และ . _ - ยาว 2–32 ตัว',
  'link.displayName': 'ชื่อ',
  'link.nickname': 'ชื่อเล่น',
  'link.department': 'ฝ่าย',
  'link.optional': 'ไม่บังคับ',
  'link.submit': 'ผูกรหัสและเริ่มใช้งาน',
  'link.working': 'กำลังตรวจสอบ…',
  'link.done': 'ผูกรหัสเรียบร้อย เปิดใช้งานเมนูออฟฟิศแล้ว',
  'link.gateTitle': 'เมนูนี้สำหรับพนักงาน',
  'link.gateBody': 'ผูกรหัสพนักงานก่อนจึงจะเข้าใช้งานเมนูนี้ได้',
  'link.gateCta': 'ไปผูกรหัสพนักงาน',

  /* ── สถานะบัญชี ──────────────────────────────────────────────── */
  'account.suspended': 'บัญชีถูกระงับ',
  'account.suspendedBody':
    'บัญชีนี้ถูกระงับการใช้งาน หากคิดว่าผิดพลาดกรุณาติดต่อผู้ดูแลระบบ',

  /* ── แจ้งเตือน (FR-X04) ──────────────────────────────────────── */
  'notify.title': 'การแจ้งเตือน',
  'notify.empty': 'ยังไม่มีการแจ้งเตือน',
  'notify.markAll': 'อ่านทั้งหมด',
  'notify.unreadCount': 'ยังไม่อ่าน {count} รายการ',
  // ชนิดแจ้งเตือน — ตรงกับ notifications.type ในฐานข้อมูล
  'notify.type.debtCreated': 'มีคนสร้างรายการค้างจ่ายถึงคุณ',
  'notify.type.debtReminder': 'ถูกทวงเงิน',
  'notify.type.debtPaidPending': 'มีคนกดโอนแล้ว รอคุณยืนยัน',
  'notify.type.marketQueueTurn': 'ถึงคิวจองสินค้าของคุณแล้ว',
  'notify.type.marketReserved': 'มีคนจองสินค้าของคุณ',
  'notify.type.contentHidden': 'เนื้อหาของคุณถูกซ่อนจากการรายงาน',
  'notify.type.drawInvite': 'คุณถูกเชิญเข้าห้องสุ่ม',

  /* ── รายงานเนื้อหา (FR-X08) ──────────────────────────────────── */
  'report.action': 'รายงาน',
  'report.done': 'รับรายงานแล้ว ขอบคุณที่ช่วยดูแล',
  'report.progress': 'รายงานแล้ว {reports} จาก {threshold} คน',
  'report.hidden': 'เนื้อหานี้ถูกซ่อนจากการรายงาน',

  /* ── หน้า Admin (FR-X09) ─────────────────────────────────────── */
  'admin.codes.title': 'รายชื่อรหัสพนักงาน',
  'admin.codes.add': 'เพิ่มรหัส',
  'admin.codes.import': 'นำเข้าจาก CSV',
  'admin.codes.template': 'ดาวน์โหลดไฟล์ตัวอย่าง',
  'admin.codes.code': 'รหัสพนักงาน',
  'admin.codes.user': 'ผู้สมัคร',
  'admin.codes.status': 'สถานะรหัส',
  'admin.codes.claimed': 'สถานะการสมัคร',
  'admin.codes.unclaimed': 'ยังไม่สมัคร',
  'admin.codes.claimedYes': 'สมัครแล้ว',
  'admin.codes.active': 'ใช้งาน',
  'admin.codes.resigned': 'ลาออก',
  'admin.users.title': 'ผู้ใช้งาน',
  'admin.users.suspend': 'ระงับบัญชี',
  'admin.users.restore': 'คืนสถานะ',
  'admin.users.resetPassword': 'รีเซ็ตรหัสผ่าน',
  'admin.users.makeAdmin': 'ให้สิทธิ์ผู้ดูแล',
  'admin.users.removeAdmin': 'ถอนสิทธิ์ผู้ดูแล',
  'admin.settings.title': 'ตั้งค่าระบบ',
  'admin.settings.reportThreshold': 'จำนวนผู้รายงานที่ทำให้ซ่อนอัตโนมัติ',
  'admin.settings.noRepeatDays': 'ระยะเวลาไม่สุ่มร้านซ้ำ (วัน)',
  'admin.settings.reminderDays': 'รอบทวงอัตโนมัติ (วัน)',
  'admin.settings.lotteryDate': 'วันออกรางวัลงวดถัดไป',

  /* ── โมดูล A · กินอะไรดี ─────────────────────────────────────── */
  'food.picks.title': 'ร้านเด็ดห้ามพลาด',
  'food.picks.count': '{n} ร้าน',
  'food.picks.add': 'เพิ่มร้าน',
  'food.picks.empty': 'ยังไม่มีใครแนะนำร้าน — เป็นคนแรกเลยไหม',
  'food.picks.mine': 'ร้านของฉัน',
  'food.picks.recommendedBy': 'แนะนำโดย {name}',
  'food.picks.agree': 'เห็นด้วย',
  'food.picks.agreed': 'เห็นด้วยแล้ว',
  'food.picks.votes': '{n} คนเห็นด้วย',
  'food.picks.maybeClosed': 'อาจปิดแล้ว',
  'food.picks.reportClosed': 'ร้านปิด/ย้ายแล้ว',
  'food.picks.reported': 'แจ้งแล้ว {reports}/{threshold} คน',
  'food.picks.stillOpen': 'ยืนยันว่ายังเปิดอยู่',
  'food.picks.openMap': 'เปิดแผนที่',
  'food.picks.sortVotes': 'คนเห็นด้วยมากสุด',
  'food.picks.sortNew': 'เพิ่มล่าสุด',
  'food.picks.allCuisines': 'ทุกประเภท',
  'food.picks.allPrices': 'ทุกช่วงราคา',
  'food.picks.searchPlaceholder': 'ค้นหาชื่อร้าน',

  'food.form.name': 'ชื่อร้าน',
  'food.form.dish': 'เมนูเด็ด',
  'food.form.cuisine': 'ประเภทอาหาร',
  'food.form.price': 'ช่วงราคา',
  'food.form.distance': 'ระยะทาง',
  'food.form.mapUrl': 'ลิงก์แผนที่',
  'food.form.note': 'คำแนะนำ',
  'food.form.submit': 'บันทึกร้าน',
  'food.form.similarWarning': 'มีร้านชื่อคล้ายกันอยู่แล้ว — ตรวจสอบก่อนเพิ่มซ้ำ',

  'food.distance.WALK': 'เดินได้',
  'food.distance.DRIVE': 'ขับรถ',
  'food.distance.DELIVERY': 'เดลิเวอรี',

  'food.random.title': 'สุ่มอาหาร',
  'food.random.inWheel': 'อยู่ในวงล้อ {n} ร้าน',
  'food.random.spin': 'หมุนเลย',
  'food.random.onlyPicks': 'เฉพาะร้านเด็ด',
  'food.random.onlyPicksHint': 'ร้านที่มีคนเห็นด้วยตั้งแต่ 3 คนขึ้นไป',
  'food.random.needMore': 'ต้องมีร้านอย่างน้อย 2 ร้านถึงจะสุ่มได้ — ปรับตัวกรองหรือเพิ่มร้านก่อน',
  'food.random.goThere': 'ไปร้านนี้',
  'food.random.logged': 'บันทึกแล้ว',

  /* ── โมดูล B · กระเป๋าเงิน ───────────────────────────────────── */
  'wallet.owed.title': 'ยอดค้างของฉัน',
  'wallet.owed.iOwe': 'ฉันค้างคนอื่น',
  'wallet.owed.owedToMe': 'คนอื่นค้างฉัน',
  'wallet.owed.pendingConfirm': 'รอฉันยืนยัน {n} รายการ',
  'wallet.owed.empty': 'ไม่มีรายการค้าง',
  'wallet.owed.days': 'ค้างมา {n} วัน',
  'wallet.owed.today': 'วันนี้',
  'wallet.owed.create': 'สร้างรายการเงิน',

  'wallet.status.PENDING': 'ค้างจ่าย',
  'wallet.status.PAID_PENDING': 'รอยืนยัน',
  'wallet.status.SETTLED': 'ชำระแล้ว',
  'wallet.status.CANCELLED': 'ยกเลิกแล้ว',

  'wallet.action.pay': 'จ่ายเงิน',
  'wallet.action.markPaid': 'โอนแล้ว',
  'wallet.action.confirm': 'ยืนยันรับเงิน',
  'wallet.action.cancel': 'ยกเลิกหนี้',
  'wallet.action.remind': 'ทวง',
  'wallet.action.remindedToday': 'ทวงไปแล้ววันนี้',
  'wallet.action.viewQr': 'ดู QR รับเงิน',
  'wallet.action.noQr': 'ผู้รับยังไม่ได้อัปโหลด QR — ติดต่อโดยตรง',
  'wallet.tone.POLITE': 'แบบสุภาพ',
  'wallet.tone.FUNNY': 'แบบขำ',

  'wallet.create.title': 'สร้างรายการเงิน',
  'wallet.create.billTitle': 'ชื่อรายการ',
  'wallet.create.total': 'ยอดรวม',
  'wallet.create.category': 'ประเภท',
  'wallet.create.date': 'วันที่',
  'wallet.create.people': 'ผู้ร่วมจ่าย',
  'wallet.create.includeSelf': 'ฉันร่วมจ่ายด้วย',
  'wallet.create.includeSelfHint': 'ติ๊กไว้ = หารรวมฉัน · ไม่ติ๊ก = ฉันออกให้ก่อนแล้วเก็บคืนเต็ม',
  'wallet.create.splitEqual': 'หารเท่ากัน',
  'wallet.create.splitCustom': 'ระบุยอดรายคน',
  'wallet.create.preview': 'แต่ละคนจ่าย',
  'wallet.create.myShare': 'ส่วนของฉัน',
  'wallet.create.submit': 'บันทึกและแจ้งทุกคน',
  'wallet.create.noPeople': 'เลือกผู้ร่วมจ่ายอย่างน้อย 1 คน',
  'wallet.create.done': 'สร้างรายการแล้ว แจ้งเตือนทุกคนเรียบร้อย',

  'wallet.category.FOOD': 'ค่าข้าว',
  'wallet.category.COFFEE': 'กาแฟ',
  'wallet.category.OTHER': 'อื่น ๆ',

  'wallet.qr.title': 'QR รับเงินของฉัน',
  'wallet.qr.none': 'ยังไม่ได้อัปโหลด',
  'wallet.qr.upload': 'อัปโหลด QR',
  'wallet.qr.replace': 'เปลี่ยนรูป',
  'wallet.qr.remove': 'ลบรูป',
  'wallet.qr.hint': 'ไฟล์ JPG หรือ PNG เช่น QR พร้อมเพย์ที่บันทึกจากแอปธนาคาร',
  'wallet.qr.privacy': 'รูปนี้แสดงเฉพาะคนที่มีรายการเงินกับคุณเท่านั้น',

  /* ── ทั่วไป ──────────────────────────────────────────────────── */
  'common.save': 'บันทึก',
  'common.cancel': 'ยกเลิก',
  'common.close': 'ปิด',
  'common.delete': 'ลบ',
  'common.edit': 'แก้ไข',
  'common.search': 'ค้นหา',
  'common.loading': 'กำลังโหลด…',
  'common.empty': 'ยังไม่มีข้อมูล',
  'common.required': 'จำเป็นต้องกรอก',
  'common.error': 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง',
} as const

export type OfficeKey = keyof typeof OFFICE_TH

/**
 * แปลข้อความของโมดูลออฟฟิศ
 *
 * ★ ตัวแปรใช้ {ชื่อ} เหมือน dict เดิม ไม่ใช่การต่อสตริง
 *   เหตุผลเดียวกับที่เขียนไว้ใน th.ts — ลำดับคำของแต่ละภาษาไม่เหมือนกัน
 *   และวันที่เพิ่มอังกฤษ การต่อสตริงจะแปลไม่ได้จริง
 */
export function ot(
  key: OfficeKey,
  params?: Record<string, string | number>,
): string {
  const raw = OFFICE_TH[key]
  if (!params) return raw

  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

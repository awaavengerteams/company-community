/**
 * ย่อรูปในเครื่องก่อนอัป
 *
 * ★★ ทำไมย่อฝั่ง client ไม่ใช่ฝั่ง server
 *
 *    ถ้าย่อฝั่ง server ไฟล์ 8MB จากกล้องมือถือต้องเดินทางผ่านเน็ตของผู้ใช้
 *    ไปจนครบก่อน แล้วค่อยถูกย่อทิ้ง — ผู้ใช้จ่ายค่าเน็ตและรอเป็นสิบวินาที
 *    เพื่อพิกเซลที่ถูกโยนทิ้งทั้งหมด
 *
 *    ★ ย่อก่อนส่ง = อัปโหลดเหลือหลักสิบ KB เสร็จแทบจะทันที
 *      และเซิร์ฟเวอร์ไม่ต้องมีไลบรารีประมวลผลรูปเลยสักตัว
 *
 * ★ ใช้ createImageBitmap + canvas ไม่ใช่ <img onload>
 *   createImageBitmap ถอดรหัสรูปนอก main thread จึงไม่ทำให้จอค้างระหว่างย่อ
 *   และมันเคารพ EXIF orientation ให้ด้วย — รูปจากมือถือที่ถ่ายแนวตั้ง
 *   จึงไม่กลายเป็นรูปนอนตะแคงเหมือนตอนวาดจาก <img> ตรง ๆ
 */
export async function shrinkImage(
  file: File,
  maxSide: number,
  /**
   * ★ สติกเกอร์ต้องคงพื้นหลังโปร่งใส — JPEG ทำไม่ได้
   *   ถ้าแปลงเป็น JPEG พื้นโปร่งจะกลายเป็นสีดำ ซึ่งทำลายสิ่งที่ทำให้มัน
   *   เป็นสติกเกอร์ตั้งแต่แรก (รูปโปรไฟล์ไม่มีปัญหานี้เพราะเป็นวงกลมทึบอยู่แล้ว)
   */
  keepAlpha = false,
): Promise<File> {
  // GIF ย่อไม่ได้โดยไม่เสียการเคลื่อนไหว — ส่งต้นฉบับไป ให้ฝั่ง server ปฏิเสธเอง
  if (file.type === 'image/gif') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // ★ ถอดรหัสไม่ได้ = ส่งต้นฉบับไป ปล่อยให้ server เป็นคนบอกว่าไฟล์ใช้ไม่ได้
    //   ดีกว่าขึ้น error คนละแบบจากสองที่สำหรับสาเหตุเดียวกัน
    return file
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= 512 * 1024) {
    bitmap.close()
    return file
  }

  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // ★ PNG เมื่อต้องเก็บความโปร่งใส · JPEG เมื่อเป็นภาพถ่าย (เล็กกว่ามาก)
  const type = keepAlpha ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), type, keepAlpha ? undefined : 0.85),
  )

  if (!blob) return file
  return new File([blob], keepAlpha ? 'sticker.png' : 'avatar.jpg', { type })
}

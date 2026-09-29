/**
 * สคริปต์ที่รันตอนเบราว์เซอร์แปล HTML — ก่อนหน้าจอถูกวาดครั้งแรก
 *
 * ★★ ทำไม type ต้องสลับระหว่าง server กับ client
 *
 *    React เตือนใน dev ทุกครั้งที่เจอ <script> ในต้นไม้คอมโพเนนต์ เพราะตอน
 *    render ฝั่ง client มันจะไม่ถูกรันอยู่ดี (เบราว์เซอร์ไม่รันสคริปต์ที่ถูก
 *    ใส่เข้า DOM ทีหลัง) — คำเตือนนี้ถูกต้องสำหรับกรณีทั่วไป
 *
 *    ★ แต่กรณีเราคือสคริปต์ที่ตั้งใจให้รันเฉพาะตอน "โหลดหน้าจริง" เท่านั้น
 *      ให้ฝั่ง server ออกเป็น text/javascript (เบราว์เซอร์รันตอนแปล HTML)
 *      ส่วนฝั่ง client ออกเป็น text/plain (เป็นแค่ข้อความ ไม่มีใครรัน)
 *      suppressHydrationWarning รับผิดชอบความต่างของ type ที่ตั้งใจให้ต่าง
 *
 *    วิธีนี้มาจากคู่มือของ Next เอง (docs/01-app/02-guides/preventing-flash-before-hydration)
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

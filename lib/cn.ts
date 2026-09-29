/**
 * ต่อ className แบบเล็กที่สุดเท่าที่จำเป็น — ไม่ดึง clsx/tailwind-merge เข้ามา
 * เพื่อคุมจำนวน dependency ตาม architecture
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

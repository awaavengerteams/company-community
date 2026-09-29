# Security

## หลักการ

**Client อ่านผ่าน RLS / เขียนผ่าน Route Handler เท่านั้น**

ทุกตารางเปิด RLS และ *ไม่มี policy สำหรับ INSERT/UPDATE/DELETE เลย* → Postgres default-deny
ต่อให้ publishable key รั่วทั้งก้อนหรือเว็บโดน XSS ผู้โจมตีก็แก้ฐานข้อมูลไม่ได้แม้แต่แถวเดียว

## ชั้นป้องกันที่วางไว้

| ชั้น | ที่ | กันอะไร |
|------|-----|---------|
| `import 'server-only'` | `lib/supabase/admin.ts`, `lib/youtube/api.ts` | secret หลุดไป browser bundle — **build fail** ไม่ใช่แค่ warning |
| RLS default-deny | migration 0005 | client เขียน DB ตรง ๆ |
| `revoke execute … from anon, authenticated` | migration 0004, 0007 | client เรียก RPC ตรง ๆ เพื่อสวมรอยคนอื่น (RPC รับ `p_actor` เป็นพารามิเตอร์) |
| `Sec-Fetch-Site` + `Origin` + บังคับ JSON | `lib/http/guard.ts` | CSRF (HTML form ส่ง `application/json` ไม่ได้) |
| `resolveVideoForQueue` | `lib/youtube/resolve-video.ts` | client ปลอม `duration` เพื่อข้ามคิวคนอื่น |
| CAS + `PREMATURE_END` | `advance_queue()` | ยิง `/next` รัวเพื่อข้ามเพลงชาวบ้าน |
| `consume_rate_limit` | migration 0007 | ถล่มคิว / เผา YouTube quota ของทั้งเว็บ |
| CSP + `frame-ancestors none` | `next.config.ts` | XSS ส่งข้อมูลออก, clickjacking |
| ห้าม `dangerouslySetInnerHTML` | ทั้งโปรเจกต์ | XSS จากชื่อวิดีโอของ YouTube |
| Crockford Base32 6 หลัก | `lib/room/code.ts` | เดารหัสห้อง (1.07e9 + rate limit) |

## ตรวจซ้ำได้ด้วย

```bash
npm run db:test   # 52 assertion รวม RLS/permission/rate limit
```

## YouTube ToS

- เล่นผ่าน **IFrame Player API** เท่านั้น
- ไม่ดาวน์โหลด ไม่ proxy ไม่ re-stream ไม่ดึง direct media URL
- ไม่แตะโฆษณาของ YouTube ไม่ว่ากรณีใด
- ไม่ซ่อน ย่อ หรือวางอะไรทับตัว player
- เว็บนี้ไม่มีโฆษณาของตัวเอง ไม่มี ad network ไม่มี tracking script

**ห้ามเพิ่ม dependency** ที่ดึง media จาก YouTube (`ytdl-core`, `yt-dlp`, ฯลฯ) เด็ดขาด

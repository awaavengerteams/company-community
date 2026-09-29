# 🎵 Music Room

ห้องฟังเพลงออนไลน์ — เพิ่มเพลงจาก YouTube เข้าคิวร่วมกัน แล้วฟังพร้อมกันแบบเรียลไทม์

> **สถานะ: Phase 1–10 เสร็จและทดสอบกับฐานข้อมูลจริงแล้ว** — 133 assertion ผ่านทั้งหมด
>
> ดู [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DEPLOY.md](docs/DEPLOY.md) · [docs/SECURITY.md](docs/SECURITY.md)

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres + Realtime + Auth) · YouTube Data API v3 · YouTube IFrame Player API · Vercel

ไม่มี backend server แยก — ใช้ Next.js Route Handlers ทั้งหมด

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env.local   # แล้วเติมค่าให้ครบ
npm run dev                  # http://localhost:3000
```

หน้าแรกจะแจ้งเองถ้ายังตั้งค่า environment ไม่ครบ (แสดงเฉพาะตอน dev)

| Variable | ฝั่ง | ใช้ทำอะไร |
|----------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | เชื่อมต่อ Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | อ่านข้อมูลผ่าน RLS + Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | **server เท่านั้น** | เขียน DB หลังตรวจสิทธิ์แล้ว (bypass RLS) |
| `YOUTUBE_API_KEY` | **server เท่านั้น** | ค้นหาเพลงผ่าน YouTube Data API |

## ตั้งค่าฐานข้อมูล

### แบบ Cloud (Supabase.com)

```bash
npx supabase login                              # เปิด browser ให้ยืนยันตัวตน
npx supabase link --project-ref <project-ref>   # ref อยู่ใน URL ของ dashboard
npx supabase db push                            # รัน migration 0001–0007
npx supabase gen types typescript --linked > types/database.ts
```

จากนั้นเปิด **Dashboard → Authentication → Providers → Anonymous sign-ins** ให้เป็น enabled
(local ตั้งไว้ใน `supabase/config.toml` แล้ว แต่ cloud ต้องเปิดเองในหน้าเว็บ)

ทดสอบ (ใช้กับ project เปล่าเท่านั้น — สคริปต์สร้างและลบข้อมูลจริง):

```bash
npm run db:test:rest   # ยิงผ่าน PostgREST ไม่ต้องมี psql
```

### แบบ Local (ต้องมี Docker)

```bash
npm run db:start    # ครั้งแรกจะดึง image สักพัก
npm run db:reset    # รัน migration ทั้งหมด + seed
npm run db:test     # ชุดทดสอบ race condition
npm run db:types    # generate types/database.ts จาก schema จริง
```

## คำสั่ง

```bash
npm run dev       # dev server
npm run build     # production build (typecheck รวมอยู่ในนี้)
npm run start     # รัน production build
npm run lint      # ESLint
npm test            # unit test 76 assertion (ไม่ต้องมี DB)
npm run db:test:rest # ทดสอบฐานข้อมูลจริง 40 assertion (race condition, RLS, rate limit)
npm run test:e2e     # end-to-end 2 เบราว์เซอร์ 17 assertion (realtime, player)
npm run db:setup     # push migration ขึ้น cloud ในคำสั่งเดียว
```

## หลักการที่โค้ดทั้งหมดยึด

1. **Database คือ source of truth เดียว** — ไม่มี state ค้างบน server
2. **เวลาของ server เท่านั้นที่เชื่อได้** — client วัด offset ของนาฬิกาตัวเองผ่าน `/api/time`
3. **Client อ่านอย่างเดียว เขียนผ่าน `/api/*`** — ไม่มี RLS policy สำหรับ INSERT/UPDATE/DELETE เลย
4. **Mutation ที่แข่งกันต้อง atomic ใน Postgres** — advisory lock + CAS ไม่ใช่ logic ใน JS
5. **Realtime คือสัญญาณ ไม่ใช่ข้อมูล** — ไม่เคยสมมติว่าได้ event ครบ มี resync เสมอ

## ข้อกำหนดการใช้งาน YouTube

เล่นเพลงผ่าน **YouTube IFrame Player API** เท่านั้น — ไม่ดาวน์โหลด ไม่ proxy ไม่ re-stream
ไม่ดึง direct media URL และไม่แตะโฆษณาของ YouTube ไม่ว่ากรณีใด

เว็บไซต์นี้ไม่มีโฆษณาของตัวเอง ไม่มี ad network ไม่มี tracking script

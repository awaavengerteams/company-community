# Janitor — ตัวเก็บกวาดห้องที่ค้าง

`/api/cron/reconcile` เดินหน้าคิวให้ห้องที่เพลงจบแล้วแต่ไม่มีใครรายงาน
(ทุกคนปิด tab พร้อมกัน / คนสุดท้ายเน็ตหลุด)

## ทำไมตั้งไว้วันละครั้ง

`vercel.json` ตั้ง `0 3 * * *` (ตี 3 ทุกวัน) เพราะ **Vercel Hobby จำกัด cron ที่วันละครั้ง**
ถ้าตั้งถี่กว่านั้น deployment จะถูกปฏิเสธตั้งแต่ตอน build

**ความถี่ต่ำไม่ได้ทำให้ผู้ใช้เจอปัญหา** เพราะ client ซ่อมตัวเองอยู่แล้ว:
พอมีคนเปิดห้อง `usePlaybackSync` คำนวณว่าเพลงควรจบไปแล้ว → ยิง `/next` ทันที
janitor จึงจำเป็นเฉพาะกรณีที่ **ไม่มีใครเข้าห้องนั้นอีกเลย** ซึ่งไม่มีใครเดือดร้อน

## ถ้าอยู่บน Pro — ปรับเป็นทุกนาที

```json
{ "path": "/api/cron/reconcile", "schedule": "* * * * *" }
```

## ทางเลือกที่ดีกว่า: pg_cron ใน Supabase

`reconcile_stale_playback()` เป็นฟังก์ชัน SQL ล้วน — ให้ Postgres เรียกเองได้เลย
ไม่ต้องผ่าน HTTP ไม่ติดข้อจำกัดของแพลน Vercel

```sql
-- Dashboard → Database → Extensions → เปิด pg_cron ก่อน
select cron.schedule(
  'music-room-reconcile',
  '* * * * *',
  $$ select public.reconcile_stale_playback(20) $$
);

-- เก็บกวาด cache วันละครั้ง
select cron.schedule(
  'music-room-prune',
  '0 4 * * *',
  $$ select public.prune_ephemeral(24, 30) $$
);
```

ถ้าใช้ pg_cron แล้ว ลบ `crons` ออกจาก `vercel.json` ได้เลย

## ความปลอดภัย

ตั้ง `CRON_SECRET` บน Vercel — endpoint จะตรวจ `Authorization: Bearer <secret>`
ถ้าไม่ตั้ง ใครก็ยิง endpoint นี้รัว ๆ เพื่อเร่งข้ามเพลงของห้องอื่นได้

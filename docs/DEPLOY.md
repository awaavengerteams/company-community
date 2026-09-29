# Deploy

## ลำดับที่ต้องทำ

### 1 · ฐานข้อมูล

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

หรือถ้า login ไม่ได้: วาง [`supabase/apply-all.sql`](../supabase/apply-all.sql) ใน **SQL Editor** ของ dashboard

### 2 · ตั้งค่าที่ต้องกดใน Dashboard (API ทำแทนไม่ได้)

| ที่ | ทำอะไร | ทำไมจำเป็น |
|-----|--------|------------|
| Authentication → Sign In / Providers | เปิด **Anonymous Sign-Ins** | ทั้งระบบ guest identity พึ่งข้อนี้ — ถ้าไม่เปิดไม่มีใครเข้าห้องได้ |
| Authentication → URL Configuration | ใส่ Site URL ของ production | กัน redirect ไปเว็บอื่น |

### 3 · YouTube API

1. [Google Cloud Console](https://console.cloud.google.com) → เปิด **YouTube Data API v3**
2. Credentials → Create API key
3. **จำกัด key**: Application restrictions → *None* (เรียกจาก server ไม่ใช่ browser)
   API restrictions → *YouTube Data API v3* เท่านั้น
4. ตั้ง **quota alert** ที่ 80% — quota เริ่มต้น 10,000 units/วัน = ค้นหาได้ ~99 ครั้ง

> ★ ถ้าจะเปิดใช้จริง **ยื่นขอเพิ่ม quota ตั้งแต่วันนี้** (YouTube API Services Audit and Compliance form) ใช้เวลาหลายสัปดาห์

### 4 · Vercel

```bash
vercel --prod
```

Environment Variables ที่ต้องใส่ใน Vercel:

| ชื่อ | Environment |
|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ทุก env |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ทุก env |
| `SUPABASE_SECRET_KEY` | Production + Preview |
| `YOUTUBE_API_KEY` | Production + Preview |
| `CRON_SECRET` | Production (สุ่มเอง เช่น `openssl rand -hex 32`) |

`vercel.json` ตั้ง cron `/api/cron/reconcile` ไว้ทุก 1 นาทีแล้ว — ตัวเก็บกวาดห้องที่เพลงจบแต่ไม่มีใครรายงาน

> Vercel Hobby plan จำกัด cron ที่ **วันละครั้ง** — ถ้าใช้ Hobby ให้เปลี่ยน schedule เป็น `0 * * * *` (ทุกชั่วโมง) แล้วยอมรับว่าห้องร้างจะค้างนานขึ้น หรือใช้ Supabase `pg_cron` แทน

## Checklist ก่อนเปิดจริง

- [ ] `npm run build` ผ่าน
- [ ] `npm run lint` สะอาด
- [ ] `npm test` ผ่านทั้งหมด
- [ ] `npm run db:test` ผ่าน (ต้องมี psql + DB_URL)
- [ ] เปิด Anonymous Sign-Ins แล้ว
- [ ] ทดสอบ 2 เบราว์เซอร์: เพิ่มเพลงที่เครื่องหนึ่ง อีกเครื่องเห็นทันที
- [ ] ทดสอบ late join: เปิด tab ใหม่กลางเพลง → เข้าตำแหน่งตรง
- [ ] ทดสอบปิดเน็ต 10 วิ แล้วเปิด → ซิงก์กลับเอง
- [ ] `CRON_SECRET` ตั้งแล้ว และ `/api/cron/reconcile` ยิงมั่วไม่ได้
- [ ] rotate key ที่เคยส่งผ่านช่องทางไม่ปลอดภัย

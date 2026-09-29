-- =============================================================================
-- ล้างข้อมูลทั้งระบบ — ห้อง · แชท · ผู้ใช้
-- =============================================================================
-- วาง SQL นี้ใน Supabase Dashboard → SQL Editor แล้วกด Run
--
-- ★★★ ไฟล์นี้ลบข้อมูลถาวร กู้คืนไม่ได้
--     ถ้ายังไม่แน่ใจ ไป Database → Backups กด backup ไว้ก่อน
--
-- ★★ ไฟล์ที่ผู้ใช้อัปไว้ (รูปโปรไฟล์ · รูปในแชท · สติกเกอร์) ลบด้วย SQL ไม่ได้
--    มันอยู่ใน Storage ซึ่งเป็นคนละระบบกับฐานข้อมูล
--    ★ ใช้ `node scripts/reset-data.mjs --yes` แทน จะล้างให้ครบทั้งสองที่
--      หรือไปลบเองที่ Dashboard → Storage → เลือกถัง → Select all → Delete
--
-- ★ ไม่แตะแคชของ YouTube (youtube_videos · youtube_search_cache) โดยตั้งใจ
--   มันไม่ใช่ข้อมูลผู้ใช้ และการลบทิ้งแปลว่าต้องไปขอจาก YouTube ใหม่หมด
--   ซึ่งกินโควตารายวันที่ตึงอยู่แล้ว — วันเปิดใช้จริงคือวันที่ต้องการโควตามากสุด
-- =============================================================================

begin;

-- ── 1. ข้อมูลในห้องทั้งหมด ────────────────────────────────────────────────
--
-- ★★ เรียงจาก "ลูก" ไป "แม่" ต่อให้มี ON DELETE CASCADE อยู่แล้วก็ตาม
--
--    ปล่อยให้ cascade ทำงานก็ได้ผลเหมือนกัน แต่การไล่ลบเองทำให้อ่านออกว่า
--    ★ อะไรถูกลบบ้าง และถ้าวันหลังมีตารางใหม่เพิ่มเข้ามาแล้วลืมใส่ที่นี่
--      มันจะเหลือค้างให้เห็น แทนที่จะหายเงียบไปกับ cascade โดยไม่มีใครรู้

truncate table
  public.chat_reactions,
  public.chat_messages,
  public.quiz_scores,
  public.quiz_rounds,
  public.quiz_games,
  public.skip_votes,
  public.room_stickers,
  public.queue_items,
  public.playback_states,
  public.room_members,
  public.rooms,
  public.rate_limits
restart identity cascade;

commit;

-- ── 2. ผู้ใช้ทั้งหมด ──────────────────────────────────────────────────────
--
-- ★★★ ต้องแยกออกมาเป็นคำสั่งของตัวเอง และรันทีหลังเสมอ
--
--     profiles ผูกกับ auth.users แบบ ON DELETE CASCADE ★ พอลบ user
--     โปรไฟล์จะหายตามเอง — ห้ามลบ profiles ก่อน เพราะ trigger ที่สร้าง
--     โปรไฟล์อัตโนมัติจะสร้างกลับมาให้ใหม่ทันทีที่ user ยังอยู่
--
-- ★ ถ้าบรรทัดนี้ขึ้น permission denied แปลว่า role ที่ใช้รันไม่มีสิทธิ์แตะ
--   schema auth — ให้ใช้ scripts/reset-data.mjs แทน (มันผ่าน Admin API)
--   หรือไปลบที่ Dashboard → Authentication → Users

delete from auth.users;

-- ── 3. ตรวจผล ─────────────────────────────────────────────────────────────
-- ★ ควรได้ 0 ทุกช่อง — ถ้าไม่ใช่ แปลว่ามีอะไรบางอย่างรันไม่ผ่าน

select
  (select count(*) from public.rooms)         as rooms,
  (select count(*) from public.room_members)  as members,
  (select count(*) from public.chat_messages) as chat,
  (select count(*) from public.queue_items)   as queue,
  (select count(*) from public.profiles)      as profiles,
  (select count(*) from auth.users)           as users;

-- ============================================================================
-- 0006 · Realtime Publication
-- ============================================================================
-- Supabase Realtime อ่านจาก WAL ผ่าน publication ชื่อ supabase_realtime
-- ตารางที่ไม่ได้อยู่ใน publication จะไม่ส่ง event ออกมาเลย
-- ============================================================================

-- ปลอดภัยเมื่อรันซ้ำ: ถ้า publication ยังไม่มีให้สร้างเปล่า ๆ ก่อน
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

do $$
begin
  -- queue_items: เพิ่มเพลง / ลบเพลง / เปลี่ยนสถานะ
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_items'
  ) then
    alter publication supabase_realtime add table public.queue_items;
  end if;

  -- playback_states: เปลี่ยนเพลง / play / pause / seek — ทุก event ของ player
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playback_states'
  ) then
    alter publication supabase_realtime add table public.playback_states;
  end if;

  -- rooms: เปลี่ยนชื่อห้อง / ล็อกคิว / เปลี่ยนสิทธิ์
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  -- room_members: คนเข้า/ออกห้องแบบถาวร
  -- (สถานะออนไลน์ "ตอนนี้" ใช้ presence ไม่ใช่ตารางนี้ — presence เป็นของชั่วคราว
  --  ที่เขียนลง DB ไม่ได้เพราะจะเกิด write ถี่มากและค้างเมื่อ tab ถูกปิดกะทันหัน)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- ★ ตั้งใจไม่ใช้ REPLICA IDENTITY FULL
-- ---------------------------------------------------------------------------
-- FULL จะทำให้ WAL บรรจุค่าเดิมของ "ทุกคอลัมน์" ในทุก UPDATE/DELETE
-- ซึ่งทำให้ปริมาณ WAL และ bandwidth ของ Realtime บวมขึ้นมากตลอดเวลา
--
-- เราไม่ต้องการมันเพราะ:
--   • การลบเพลงเป็น soft delete (status = 'REMOVED') จึงเป็น UPDATE
--     ซึ่งส่งค่าใหม่ครบอยู่แล้ว
--   • ไม่มี logic ไหนฝั่ง client ที่ต้องรู้ "ค่าเก่า" ของแถว
--     เพราะ state ทั้งหมดคำนวณจากค่าใหม่ + version เท่านั้น
--
-- ค่า default (REPLICA IDENTITY DEFAULT = primary key) จึงเพียงพอ
-- ---------------------------------------------------------------------------

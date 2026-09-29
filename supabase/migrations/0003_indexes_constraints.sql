-- ============================================================================
-- 0003 · Indexes & Constraints
-- ============================================================================
-- แยกจาก 0002 เพราะ index หลายตัวที่นี่ไม่ใช่แค่เรื่องความเร็ว
-- แต่เป็น "กฎของระบบ" ที่บังคับที่ระดับฐานข้อมูล — ถ้าโค้ดพลาด DB จะปฏิเสธ
-- ============================================================================


-- ===========================================================================
-- rooms
-- ===========================================================================

-- lookup ด้วย code ตอน join — เป็น query ที่เกิดทุกครั้งที่มีคนเข้าห้อง
create unique index rooms_code_key on public.rooms (code);

create index rooms_owner_idx on public.rooms (owner_id);


-- ===========================================================================
-- room_members
-- ===========================================================================

-- "ฉันอยู่ในห้องนี้ไหม" — RLS ทุก policy เรียกผ่าน is_room_member()
-- ซึ่ง query ด้วย (room_id, user_id) จึงต้องมี index ตรงชุดนี้
-- unique constraint จาก 0002 สร้าง index (room_id, user_id) ให้อยู่แล้ว

-- "ฉันอยู่ห้องไหนบ้าง" — ใช้ใน policy ของ profiles
create index room_members_user_idx on public.room_members (user_id);

-- ★ กฎ: หนึ่งห้องมี OWNER ได้คนเดียว
create unique index room_members_single_owner_idx
  on public.room_members (room_id)
  where role = 'OWNER';


-- ===========================================================================
-- queue_items — index 4 ตัวนี้คือจุดที่ความถูกต้องของคิวเกิดขึ้นจริง
-- ===========================================================================

-- ★★ กฎที่ 1: position ห้ามซ้ำในห้องเดียวกัน — ตลอดกาล
--
-- นี่คือ "ตัวกันชนสุดท้าย" ของ race condition ตอนเพิ่มเพลง
-- enqueue_track() ถือ advisory lock อยู่แล้วจึงไม่ควรชนกัน
-- แต่ถ้าวันหนึ่งมีใครเขียนโค้ด insert ตรง ๆ โดยลืม lock
-- เราอยากให้มันพังเสียงดัง (unique violation) มากกว่าได้ position ซ้ำเงียบ ๆ
-- แล้วคิวเรียงผิดโดยไม่มีใครรู้
--
-- ครอบทุกแถวรวม PLAYED/REMOVED ได้เพราะ position เป็น monotonic ไม่ใช้ซ้ำ
alter table public.queue_items
  add constraint queue_items_position_unique unique (room_id, position);


-- ★★ กฎที่ 2: หนึ่งห้องมีเพลงที่ PLAYING ได้ไม่เกิน 1 เพลง
--
-- ปิดช่องของ race ตอนเปลี่ยนเพลง: ถ้าสองทรานแซกชันพยายามตั้งเพลงเป็น PLAYING
-- พร้อมกัน ตัวที่สองจะถูก DB ปฏิเสธ แม้ logic ใน advance_queue() จะพลาด
create unique index queue_items_one_playing_idx
  on public.queue_items (room_id)
  where status = 'PLAYING';


-- ★★ กฎที่ 3: เพลงเดิมอยู่ในคิวซ้ำไม่ได้ (เฉพาะที่ยังไม่เล่น)
--
-- เล่นจบแล้ว (PLAYED) เพิ่มซ้ำได้ — คนอยากฟังซ้ำเป็นเรื่องปกติ
-- เปลี่ยนนโยบายเป็น "อนุญาตให้ซ้ำ" ทำได้ด้วยการ drop index ตัวนี้ตัวเดียว
create unique index queue_items_no_dup_pending_idx
  on public.queue_items (room_id, video_id)
  where status in ('WAITING', 'PLAYING');


-- ★ query ที่ร้อนที่สุดในระบบ: "เพลง WAITING ถัดไปของห้องนี้คือเพลงไหน"
--   ถูกเรียกทุกครั้งที่เพลงจบและทุกครั้งที่มีคนกด Skip
--   partial index ทำให้ index เล็กมาก (ไม่รวมประวัติที่เล่นไปแล้ว)
--   และ order by position asc limit 1 กลายเป็นการอ่านแถวแรกของ index ตรง ๆ
create index queue_items_next_waiting_idx
  on public.queue_items (room_id, position)
  where status = 'WAITING';


-- แสดงคิวทั้งหมดรวมประวัติ (หน้าห้อง + การ resync)
create index queue_items_room_position_idx
  on public.queue_items (room_id, position desc);


-- หา "เพลงที่ฉันเพิ่ม" เพื่อเช็คสิทธิ์ตอนกดลบ
create index queue_items_added_by_idx
  on public.queue_items (added_by)
  where added_by is not null;


-- ===========================================================================
-- playback_states
-- ===========================================================================

-- ใช้โดย janitor ที่ตามเก็บห้องที่เพลงควรจบไปแล้วแต่ไม่มีใครรายงาน
-- partial index เพราะห้องส่วนใหญ่ในระบบจะไม่ได้เล่นอยู่
create index playback_states_playing_idx
  on public.playback_states (started_at)
  where is_playing;

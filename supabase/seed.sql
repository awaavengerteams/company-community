-- ============================================================================
-- Seed — รันอัตโนมัติหลัง `supabase db reset`
-- ============================================================================
-- ★ ตั้งใจไม่ seed ห้องตัวอย่างไว้
--
-- เพราะทุกห้องต้องมี owner ที่เป็น auth.users จริง การ seed จึงต้องปลอม
-- แถวใน auth.users ซึ่งจะกลายเป็นบัญชีที่ login ไม่ได้และค้างอยู่ในระบบ
-- สร้างความสับสนตอนเทสมากกว่าประโยชน์ที่ได้
--
-- ต้องการห้องสำหรับเล่น ให้ใช้วิธีใดวิธีหนึ่ง:
--
--   1. ผ่านแอป (ทางปกติ) — กด Create Room ที่หน้าแรก ตั้งแต่ Phase 3 เป็นต้นไป
--
--   2. ผ่าน SQL โดยตรง:
--        insert into auth.users (id, instance_id, aud, role, created_at, updated_at,
--                                raw_app_meta_data, raw_user_meta_data)
--        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
--                'authenticated', 'authenticated', now(), now(), '{}',
--                '{"display_name":"Dev"}')
--        returning id;
--        -- แล้วเอา id ที่ได้ไปใส่:
--        select public.create_room('<id>'::uuid, 'Dev Room');
--
--   3. รัน ./scripts/db-test.sh ด้วย KEEP=1
--      จะได้ห้องที่มีเพลงในคิวพร้อมทดสอบ และไม่ถูกลบทิ้งตอนจบ
-- ============================================================================

-- ตรวจว่า migration ทั้งหมดลงครบจริง — ถ้าขาดจะฟ้องตั้งแต่ตอน reset
do $$
declare
  v_missing text;
begin
  select string_agg(t, ', ')
  into v_missing
  from unnest(array[
    'profiles', 'rooms', 'room_members', 'queue_items', 'playback_states',
    'youtube_search_cache', 'youtube_videos', 'rate_limits'
  ]) as t
  where to_regclass('public.' || t) is null;

  if v_missing is not null then
    raise exception 'migration ไม่ครบ ขาดตาราง: %', v_missing;
  end if;

  raise notice 'schema พร้อมใช้งาน — ตารางครบทั้ง 8 ตาราง';
end;
$$;

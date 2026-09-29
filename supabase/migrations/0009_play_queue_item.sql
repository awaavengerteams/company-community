-- ============================================================================
-- 0009 · กระโดดไปเล่นเพลงที่เลือกในคิว
-- ============================================================================
-- พฤติกรรมแบบ playlist ของ YouTube: กดเพลงไหนในรายการก็เล่นเพลงนั้นทันที
--
-- ★ ทำไมต้องเป็น RPC ไม่ใช่ UPDATE หลายคำสั่งจาก Route Handler
--
--   การกระโดดต้องแก้ 3 อย่างพร้อมกัน:
--     1. เพลงที่เล่นอยู่ → SKIPPED
--     2. เพลงเป้าหมาย   → PLAYING
--     3. playback_states → ชี้ไปเพลงใหม่ + รีเซ็ต anchor
--
--   ถ้าทำแยกกันผ่าน PostgREST จะไม่มีทรานแซกชันครอบ
--   สองคนกดคนละเพลงพร้อมกันจะได้สถานะพังกลางทาง เช่นไม่มีเพลงไหนเป็น PLAYING เลย
--   หรือ playback ชี้ไปเพลงที่ยัง WAITING อยู่
--
--   (ถ้าโชคดี partial unique index queue_items_one_playing_idx จะช่วยจับได้
--    แต่การหวังให้ข้อผิดพลาดถูกจับโดยบังเอิญ ไม่ใช่การออกแบบ)
-- ============================================================================

create or replace function public.play_queue_item(
  p_room_id uuid,
  p_actor   uuid,
  p_item_id uuid
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms;
  v_role    public.member_role;
  v_pb      public.playback_states;
  v_target  public.queue_items;
begin
  -- key เดียวกับ enqueue_track / advance_queue → กันกันเองได้ทุกคู่
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  -- ★ ใช้เกณฑ์เดียวกับการข้ามเพลง
  --   การกระโดดเปลี่ยนสิ่งที่ "ทุกคนในห้อง" ได้ยิน ไม่ต่างจากกด Skip
  --   จึงไม่ควรใช้เกณฑ์ที่หลวมกว่ากัน
  if v_role is null or not public.perm_can_skip(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_target
  from public.queue_items
  where id = p_item_id and room_id = p_room_id   -- ★ ผูก room_id เสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;

  -- กดเพลงที่กำลังเล่นอยู่ → ไม่ต้องทำอะไร (idempotent)
  if v_pb.queue_item_id = p_item_id then
    return v_pb;
  end if;

  if v_target.status <> 'WAITING' then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- เล่นจบ/ถูกลบไปแล้ว
  end if;

  -- ★ เพลงที่ถูกข้ามไปตอนกระโดด ไม่ถูกลบทิ้ง
  --   เพลงที่อยู่ก่อนหน้าเป้าหมายยังเป็น WAITING อยู่เหมือนเดิม
  --   พอเพลงที่เลือกจบ คิวจะเดินต่อจากเพลงที่ position น้อยที่สุดที่ยังรออยู่
  --   = "ดึงเพลงขึ้นมาเล่นก่อน" ไม่ใช่ "ทิ้งทุกอย่างที่ค้างไว้"
  if v_pb.queue_item_id is not null then
    update public.queue_items
    set status = 'SKIPPED', ended_at = now()
    where id = v_pb.queue_item_id;
  end if;

  update public.queue_items
  set status = 'PLAYING', started_at = now()
  where id = p_item_id;

  update public.playback_states
  set queue_item_id    = p_item_id,
      video_id         = v_target.video_id,
      is_playing       = true,
      started_at       = now(),
      paused_at        = null,
      current_position = 0,
      version          = version + 1
  where room_id = p_room_id
  returning * into v_pb;

  return v_pb;
end;
$$;

-- เหตุผลของ grant ชุดนี้อยู่ใน 0004 — โดยย่อ: ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
-- ผู้เรียกจึง "บอกเองได้ว่าตัวเองเป็นใคร" ปลอดภัยเฉพาะเมื่อผู้เรียกคือ server เรา
revoke execute on function public.play_queue_item(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.play_queue_item(uuid, uuid, uuid)
  to service_role;

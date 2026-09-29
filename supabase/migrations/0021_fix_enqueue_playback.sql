-- ─────────────────────────────────────────────────────────────────────
-- 0021 · แก้บั๊ก: เพิ่มเพลงเข้าคิวไม่ได้หลังรัน 0020
-- ─────────────────────────────────────────────────────────────────────
--
-- ★★★ อาการ
--
--     กดเพิ่มเพลงในห้องที่ไม่มีเพลงเล่นอยู่ → "เพิ่มเพลงไม่สำเร็จ"
--     ห้องที่มีเพลงเล่นอยู่แล้วเพิ่มได้ปกติ (เพลงถูกต่อท้ายคิวเฉย ๆ)
--
-- ★★★ สาเหตุ
--
--     0020 เขียน enqueue_track ใหม่ทั้งก้อนเพื่อรับฟิลด์ "ขอเพลงถึงเพื่อน"
--     และตอนคัดลอกเนื้อในเดิมมา ★ ทำสองบรรทัดตกไปจาก update playback_states:
--
--         video_id  = v_item.video_id
--         paused_at = null
--
--     ตาราง playback_states มี check constraint ตั้งแต่ 0002:
--
--         not is_playing
--         or (started_at is not null and queue_item_id is not null
--             and video_id is not null)
--
--     ★ พอเพลงแรกของห้องถูกตั้งเป็น PLAYING โดยไม่เขียน video_id
--       constraint จึงไม่ผ่าน → ทรานแซกชันทั้งก้อนถูกยกเลิก → เพิ่มเพลงไม่ได้
--
--     และในห้องที่เคยเล่นเพลงมาก่อน video_id เก่ายังค้างอยู่ constraint จึงผ่าน
--     แต่ ★★ ตัวเล่นจะไปเปิด "เพลงก่อนหน้า" แทนเพลงที่เพิ่งเพิ่ม
--       ซึ่งแย่กว่าพังเสียงดัง เพราะไม่มี error ให้เห็นเลย
--
-- ★★ บทเรียน
--
--    plpgsql แก้เฉพาะบางบรรทัดไม่ได้ ต้องเขียนใหม่ทั้งฟังก์ชันเสมอ
--    การคัดลอกเนื้อในเดิมมาจึงเป็นจุดที่ทำของตกหายได้ง่ายที่สุดในไฟล์ SQL
--    ★ ครั้งต่อไปที่ต้องเพิ่มพารามิเตอร์ให้ฟังก์ชันที่มีอยู่ ต้อง diff กับ
--      ตัวเดิมทีละบรรทัดก่อนรัน ไม่ใช่อ่านผ่านแล้วเชื่อว่าครบ
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.enqueue_track(
  p_room_id      uuid,
  p_actor        uuid,
  p_video_id     text,
  p_title        text,
  p_channel      text,
  p_thumb        text,
  p_duration     integer,
  p_dedicated_to uuid default null,
  p_dedication   text default null
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room        public.rooms;
  v_role        public.member_role;
  v_item        public.queue_items;
  v_position    bigint;
  v_waiting     integer;
  v_has_playing boolean;
  v_to          uuid := p_dedicated_to;
begin
  -- ★ บรรทัดแรกเสมอ — ทุกอย่างหลังจากนี้เป็นของห้องนี้คนเดียว
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if v_room.is_locked then
    raise exception 'QUEUE_LOCKED';
  end if;

  if not public.perm_can_add(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * ★ คนที่ถูกขอให้ ต้องอยู่ในห้องนี้จริง
   *   ถ้าไม่อยู่ให้ทิ้งเป็น null ไม่ใช่ปฏิเสธทั้ง request — คนขออาจกดตอน
   *   เพื่อนเพิ่งออกจากห้องพอดี ซึ่งไม่ใช่ความผิดของเขา
   */
  if v_to is not null and not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = v_to
  ) then
    v_to := null;
  end if;

  select count(*) into v_waiting
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING';

  if v_waiting >= v_room.max_queue_size then
    raise exception 'QUEUE_FULL';
  end if;

  -- เช็คซ้ำก่อน insert เพื่อให้ได้ error code ที่ถูกต้อง
  if exists (
    select 1 from public.queue_items
    where room_id = p_room_id
      and video_id = p_video_id
      and status in ('WAITING', 'PLAYING')
  ) then
    raise exception 'DUPLICATE_IN_QUEUE';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from public.queue_items
  where room_id = p_room_id;

  insert into public.queue_items (
    room_id, video_id, title, channel_title, thumbnail_url,
    duration, position, status, added_by, dedicated_to, dedication
  )
  values (
    p_room_id, p_video_id, left(p_title, 300), left(p_channel, 200), p_thumb,
    p_duration, v_position, 'WAITING', p_actor,
    v_to, nullif(left(coalesce(p_dedication, ''), 120), '')
  )
  returning * into v_item;

  -- ถ้าห้องเงียบอยู่ ให้เพลงนี้เริ่มเล่นทันทีในทรานแซกชันเดียวกัน
  select exists (
    select 1 from public.queue_items
    where room_id = p_room_id and status = 'PLAYING'
  ) into v_has_playing;

  if not v_has_playing then
    update public.queue_items
       set status = 'PLAYING', started_at = now()
     where id = v_item.id
     returning * into v_item;

    update public.playback_states
       set queue_item_id    = v_item.id,
           -- ★★ สองบรรทัดนี้คือสิ่งที่หายไปใน 0020
           video_id         = v_item.video_id,   -- constraint บังคับ + ตัวเล่นใช้ค่านี้
           paused_at        = null,              -- ไม่ล้างแล้วเวลาหยุดครั้งก่อนจะค้าง
           is_playing       = true,
           started_at       = now(),
           current_position = 0,
           version          = version + 1
     where room_id = p_room_id;
  end if;

  return v_item;
end;
$$;

revoke execute on function public.enqueue_track(uuid, uuid, text, text, text, text, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_track(uuid, uuid, text, text, text, text, integer, uuid, text)
  to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- ★ ซ่อมห้องที่ค้างอยู่จากบั๊กนี้
-- ─────────────────────────────────────────────────────────────────────
-- ห้องที่เพิ่มเพลงสำเร็จระหว่างที่บั๊กยังอยู่ จะมี playback ที่ queue_item_id
-- ชี้เพลงใหม่แต่ video_id เป็นของเพลงเก่า — ตัวเล่นจึงเปิดผิดเพลง
-- ★ ดึง video_id กลับมาจากแถวคิวที่มันชี้อยู่ ซึ่งเป็นความจริงเสมอ
update public.playback_states pb
   set video_id = q.video_id
  from public.queue_items q
 where q.id = pb.queue_item_id
   and pb.video_id is distinct from q.video_id;

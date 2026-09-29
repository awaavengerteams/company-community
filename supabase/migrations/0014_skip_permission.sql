-- ===========================================================================
-- 0014 · สิทธิ์ "ลัดคิว" — เจ้าของห้องเท่านั้น และมอบให้คนอื่นได้
-- ===========================================================================
--
-- ★★ กลับทิศจาก 0012 เฉพาะเรื่องเดียว
--
--    0012 เปิดทุกอย่างให้ทุกคนเท่ากัน ซึ่งยังเป็นนโยบายหลักอยู่:
--    เพิ่มเพลง · หยุด/เล่น · ลบเพลง · ล้างคิว · สลับลำดับ — ทุกคนทำได้หมด
--
--    ★ สิ่งเดียวที่ดึงกลับมาคือ "การเปลี่ยนเพลงที่กำลังเล่นอยู่ให้เป็นเพลงอื่น"
--      คือกดเพลงในคิวเพื่อลัดขึ้นมาเล่น และการกดข้าม
--
--    เหตุผลที่สองอย่างนี้ต่างจากที่เหลือ: มันทำลายสิ่งที่ทุกคนกำลังฟังอยู่
--    ทันทีและกู้คืนไม่ได้ ส่วนการเพิ่มเพลงหรือสลับลำดับกระทบแค่ "อนาคต"
--    ซึ่งแก้กลับได้ก่อนถึงคิวจริง
--
-- ★★ ทำไมเป็นสิทธิ์รายคน ไม่ใช่สวิตช์เปิด/ปิดทั้งห้อง
--
--    rooms.allow_member_skip ที่มีอยู่แล้วเป็นสวิตช์ทั้งห้อง ซึ่งตอบโจทย์
--    "ให้ทุกคน" กับ "ไม่ให้ใครเลย" แต่ตอบ "ให้เฉพาะคนนี้" ไม่ได้
--    ซึ่งเป็นสิ่งที่เจ้าของห้องอยากทำจริง — มอบให้เพื่อนที่คุมเพลงเป็น
--    โดยไม่ต้องเปิดให้คนทั้งห้อง
--
--    ★ เก็บ allow_member_skip ไว้ไม่แตะ เพื่อไม่ให้ต้องย้อนแก้ของเดิม
--      แต่เส้นทางตัดสินใจเส้นเดียวที่ใช้จริงตั้งแต่นี้คือ member_can_skip()
-- ---------------------------------------------------------------------------

alter table public.room_members
  add column if not exists can_skip boolean not null default false;

comment on column public.room_members.can_skip is
  'เจ้าของห้องมอบสิทธิ์ลัดคิว/ข้ามเพลงให้คนนี้หรือยัง (OWNER มีเสมอโดยไม่สนคอลัมน์นี้)';


-- ---------------------------------------------------------------------------
-- member_can_skip — ด่านเดียวที่ตัดสินเรื่องนี้
-- ---------------------------------------------------------------------------
-- ★ รับ room_id + user id ไม่ใช่ role + room เหมือน perm_can_* ตัวอื่น
--   เพราะคำตอบขึ้นกับ "แถวของคนคนนั้น" ไม่ใช่แค่บทบาทของเขา
--   perm_can_skip() เดิมยังอยู่เพื่อไม่ให้ของเก่าพัง แต่ไม่มีใครเรียกแล้ว
create or replace function public.member_can_skip(p_room_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.role = 'OWNER' or m.can_skip
     from public.room_members m
     where m.room_id = p_room_id and m.user_id = p_actor),
    false                                   -- ไม่ได้อยู่ในห้อง = ไม่ได้
  );
$$;


-- ---------------------------------------------------------------------------
-- set_member_skip — เจ้าของห้องมอบ/ถอนสิทธิ์
-- ---------------------------------------------------------------------------
create or replace function public.set_member_skip(
  p_room_id uuid,
  p_actor   uuid,
  p_target  uuid,
  p_allow   boolean
)
returns public.room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.room_members;
  v_target public.room_members;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  -- ★ อ่าน "หลัง" จับล็อกเสมอ
  --   ตำแหน่งเจ้าของห้องโอนได้ (0010/0011) การอ่านก่อนล็อกจึงอาจได้ภาพที่
  --   ล้าสมัยไปแล้วหนึ่งจังหวะ แล้วเรายอมให้อดีตเจ้าของแจกสิทธิ์ได้
  select * into v_actor
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_actor.user_id is null or v_actor.role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_target
  from public.room_members
  where room_id = p_room_id and user_id = p_target
  for update;

  if not found then
    raise exception 'FORBIDDEN';              -- ไม่ได้อยู่ในห้องนี้
  end if;

  -- ★ เจ้าของห้องมีสิทธิ์นี้อยู่แล้วโดยบทบาท การถอนของตัวเองจึงไม่มีความหมาย
  --   ปล่อยให้ทำได้จะกลายเป็นสถานะที่ค่าในคอลัมน์ขัดกับสิ่งที่ระบบยอมให้ทำจริง
  if v_target.role = 'OWNER' then
    raise exception 'VALIDATION_FAILED: owner always has this permission';
  end if;

  update public.room_members
  set can_skip = p_allow
  where room_id = p_room_id and user_id = p_target
  returning * into v_target;

  return v_target;
end;
$$;


-- ---------------------------------------------------------------------------
-- play_queue_item — เปลี่ยนด่านสิทธิ์มาใช้ member_can_skip
-- ---------------------------------------------------------------------------
-- ★ เนื้อในเหมือน 0009 ทุกบรรทัด ต่างแค่บรรทัดเช็คสิทธิ์
--   ที่ต้องเขียนใหม่ทั้งก้อนเพราะ plpgsql ไม่มีทางแก้เฉพาะบางบรรทัดได้
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
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  -- ★★ ด่านใหม่: เจ้าของห้อง หรือคนที่เจ้าของห้องมอบสิทธิ์ให้เท่านั้น
  if v_role is null or not public.member_can_skip(p_room_id, p_actor) then
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

  -- เพลงที่ถูกข้ามไปตอนกระโดด ไม่ถูกลบทิ้ง (เหตุผลเต็มอยู่ใน 0009)
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


-- ---------------------------------------------------------------------------
-- advance_queue — เฉพาะ SKIPPED ที่ต้องมีสิทธิ์ · ENDED ทุกคนรายงานได้เหมือนเดิม
-- ---------------------------------------------------------------------------
-- ★★ ห้ามเผลอเอาสิทธิ์ไปครอบ ENDED ด้วย
--
--    ENDED คือ "เพลงเล่นจบแล้ว" ซึ่งเครื่องของใครก็ได้เป็นคนรายงาน —
--    ตัวที่รายงานคือ leader ที่ถูกเลือกจากคนที่เปิดหน้าอยู่ ถ้าเผลอบังคับสิทธิ์
--    ตรงนี้ด้วย ห้องที่เจ้าของห้องปิดแท็บไปจะค้างอยู่ที่เพลงเดิมตลอดกาล
--
--    ด่านของ ENDED เป็นคนละชนิด: ต้องเล่นไปเกือบครบความยาวจริง (PREMATURE_END)
create or replace function public.advance_queue(
  p_room_id     uuid,
  p_actor       uuid,
  p_expected_id uuid,
  p_reason      text
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb      public.playback_states;
  v_room    public.rooms;
  v_role    public.member_role;
  v_current public.queue_items;
  v_next    public.queue_items;
  v_elapsed numeric;
begin
  if p_reason not in ('ENDED', 'SKIPPED') then
    raise exception 'VALIDATION_FAILED: unknown reason %', p_reason;
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ตรวจสิทธิ์
  if p_actor is not null then
    select role into v_role
    from public.room_members
    where room_id = p_room_id and user_id = p_actor;

    if v_role is null then
      raise exception 'FORBIDDEN';
    end if;

    if p_reason = 'SKIPPED' and not public.member_can_skip(p_room_id, p_actor) then
      raise exception 'FORBIDDEN';
    end if;
  elsif p_reason <> 'ENDED' then
    raise exception 'FORBIDDEN';               -- ระบบข้ามเพลงเองไม่ได้
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ★★ Compare-and-swap — เงื่อนไขนี้คือทั้งหมดที่กันการเปลี่ยนเพลงซ้ำซ้อน
  if v_pb.queue_item_id is distinct from p_expected_id then
    return v_pb;
  end if;

  if p_expected_id is not null then
    select * into v_current from public.queue_items where id = p_expected_id for update;
  end if;

  -- ด่านกันการยิง /next รัว ๆ เพื่อข้ามเพลงของคนอื่น
  if p_reason = 'ENDED' and v_current.id is not null then
    v_elapsed := public.playback_position_now(v_pb);
    if v_elapsed < v_current.duration - 5 then
      raise exception 'PREMATURE_END';
    end if;
  end if;

  if v_current.id is not null then
    update public.queue_items
    set status   = case when p_reason = 'SKIPPED' then 'SKIPPED'::public.queue_status
                        else 'PLAYED'::public.queue_status end,
        ended_at = now()
    where id = v_current.id;
  end if;

  select * into v_next
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING'
  order by position asc
  limit 1
  for update skip locked;

  if v_next.id is not null then
    update public.queue_items
    set status = 'PLAYING', started_at = now()
    where id = v_next.id;

    update public.playback_states
    set queue_item_id    = v_next.id,
        video_id         = v_next.video_id,
        is_playing       = true,
        started_at       = now(),
        paused_at        = null,
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  else
    update public.playback_states
    set queue_item_id    = null,
        video_id         = null,
        is_playing       = false,
        started_at       = null,
        paused_at        = now(),
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  end if;

  return v_pb;
end;
$$;


-- ---------------------------------------------------------------------------
-- ★ เจ้าของห้องปัจจุบันของทุกห้อง ไม่ต้องทำอะไร — role = 'OWNER' ชนะอยู่แล้ว
--   ส่วนคนอื่นเริ่มจากไม่มีสิทธิ์ ซึ่งคือสิ่งที่ผู้ใช้ขอพอดี
-- ---------------------------------------------------------------------------

revoke execute on function public.set_member_skip(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_member_skip(uuid, uuid, uuid, boolean)
  to service_role;

-- ★ member_can_skip อ่านอย่างเดียวและไม่รับ p_actor ที่เชื่อถือไม่ได้มาใช้เขียน
--   แต่ก็ไม่มีเหตุให้ client เรียกเอง — ปิดไว้ให้เหมือนตัวอื่นในไฟล์นี้
revoke execute on function public.member_can_skip(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.member_can_skip(uuid, uuid)
  to service_role;

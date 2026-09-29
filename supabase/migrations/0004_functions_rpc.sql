-- ============================================================================
-- 0004 · Functions & RPC
-- ============================================================================
-- ★ ไฟล์นี้คือที่ที่ความถูกต้องของคิวและการซิงก์เกิดขึ้นจริง
--
-- หลักการ 3 ข้อที่ทุกฟังก์ชันในนี้ยึด:
--
--   1. mutation ของห้องเดียวกัน "เข้าคิวทีละตัว" ด้วย pg_advisory_xact_lock
--      ที่ใช้ key เดียวกันทั้งไฟล์ → enqueue / advance / remove / clear
--      ไม่มีทางทำงานทับกันได้เลย
--
--   2. การเปลี่ยนเพลงเป็น compare-and-swap เสมอ — ยิงซ้ำกี่ครั้งได้ผลเดียว
--      (idempotent) เพราะผู้ฟัง 50 คนจะได้ event ENDED พร้อมกัน
--
--   3. ตรวจสิทธิ์ในฟังก์ชันเอง ไม่พึ่งว่า caller ตรวจมาแล้ว
--      เพราะฟังก์ชันเหล่านี้เป็น SECURITY DEFINER = มีอำนาจเต็ม
-- ============================================================================


-- ===========================================================================
-- ส่วนที่ 1 · Helper
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- key ของ advisory lock ต่อห้อง
-- ---------------------------------------------------------------------------
-- ★ ทุกฟังก์ชันที่แก้คิว/playback ต้องเรียกตัวนี้เป็นบรรทัดแรก
--   ถ้าใช้ key คนละสูตรกัน lock จะไม่กันกันเอง — จึงรวมไว้ที่เดียว
--
-- advisory lock เป็น lock ระดับ session/transaction ที่เราตั้งความหมายเอง
-- ไม่ได้ผูกกับแถวไหน จึงกันได้แม้แต่กรณีที่ยังไม่มีแถวอยู่เลย
-- (เช่น INSERT เพลงแรกของห้อง ซึ่ง row lock ช่วยไม่ได้)
-- ---------------------------------------------------------------------------
create or replace function public.room_lock_key(p_room_id uuid)
returns bigint
language sql
immutable
as $$
  select hashtextextended(p_room_id::text, 42);
$$;


-- ---------------------------------------------------------------------------
-- สุ่ม room code ด้วย CSPRNG
-- ---------------------------------------------------------------------------
-- ใช้ gen_random_bytes ไม่ใช่ random() เพราะ random() เดาต่อได้เมื่อรู้ seed
-- ซึ่งเปิดทางให้เดารหัสห้องที่เพิ่งถูกสร้าง
--
-- 256 หารด้วย 32 ลงตัว → `% 32` ไม่เกิด modulo bias
-- ---------------------------------------------------------------------------
create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  k_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := gen_random_bytes(6);
  v_code text := '';
  i integer;
begin
  for i in 0..5 loop
    v_code := v_code || substr(k_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;


-- ---------------------------------------------------------------------------
-- ผู้ใช้ปัจจุบันอยู่ในห้องนี้ไหม / มี role อะไร
-- ---------------------------------------------------------------------------
-- ★ ต้องเป็น SECURITY DEFINER ไม่งั้น policy ของ room_members จะเรียกตัวเองวนไม่จบ
--   (policy → is_room_member → SELECT room_members → policy → ...)
--   SECURITY DEFINER ทำให้ query ข้างในไม่ถูก RLS ตรวจอีกรอบ
--
-- ★ set search_path = '' แล้วเขียนชื่อเต็มทุกตัว
--   กันการโจมตีแบบสร้างตารางชื่อเดียวกันใน schema ที่ตัวเองควบคุม
--   แล้วดัน search_path ให้ฟังก์ชันสิทธิ์สูงไปอ่านตารางปลอมแทน
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.my_room_role(p_room_id uuid)
returns public.member_role
language sql
security definer
stable
set search_path = ''
as $$
  select role
  from public.room_members
  where room_id = p_room_id
    and user_id = (select auth.uid());
$$;


-- ---------------------------------------------------------------------------
-- Permission matrix — รวมไว้ที่เดียว
-- ---------------------------------------------------------------------------
-- เปลี่ยนนโยบายสิทธิ์ทั้งระบบ = แก้แค่ 4 ฟังก์ชันนี้
-- ไม่ต้องไล่แก้ตาม RPC แต่ละตัว และไม่ต้องแก้โค้ด TypeScript
-- ---------------------------------------------------------------------------
create or replace function public.perm_can_add(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select case
    when p_room.is_locked then false          -- ห้องปิดรับเพลง = ไม่มีใครเพิ่มได้ แม้แต่ OWNER
    when p_role = 'OWNER'  then true
    when p_role = 'MEMBER' then true
    when p_role = 'GUEST'  then p_room.allow_guest_add
    else false
  end;
$$;

create or replace function public.perm_can_skip(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select case
    when p_role = 'OWNER'  then true
    when p_role = 'MEMBER' then p_room.allow_member_skip
    else false                                 -- GUEST ข้ามเพลงไม่ได้
  end;
$$;

create or replace function public.perm_can_control(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select case
    when p_role = 'OWNER'  then true
    when p_role = 'MEMBER' then p_room.allow_member_control
    else false
  end;
$$;

create or replace function public.perm_can_manage(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select p_role = 'OWNER' and p_room.id is not null;
$$;


-- ---------------------------------------------------------------------------
-- ตำแหน่งเพลงปัจจุบัน ณ เวลานี้ (วินาที) คำนวณจากนาฬิกา server
-- ---------------------------------------------------------------------------
-- สูตรเดียวกับที่ client ใช้เป๊ะ ๆ — ถ้าสองที่คำนวณไม่ตรงกัน การซิงก์จะเพี้ยน
-- แบบหาสาเหตุยาก จึงเขียนไว้ทั้งสองฝั่งโดยอ้างอิงนิยามเดียวกันใน 0002
-- ---------------------------------------------------------------------------
create or replace function public.playback_position_now(p_pb public.playback_states)
returns numeric
language sql
stable
as $$
  select case
    when p_pb.is_playing and p_pb.started_at is not null
      then p_pb.current_position + extract(epoch from (now() - p_pb.started_at))
    else p_pb.current_position::numeric
  end;
$$;


-- ===========================================================================
-- ส่วนที่ 2 · Room
-- ===========================================================================

create or replace function public.create_room(
  p_owner uuid,
  p_name  text default null
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms;
  v_attempt integer := 0;
begin
  if p_owner is null or not exists (select 1 from public.profiles where id = p_owner) then
    raise exception 'UNAUTHORIZED';
  end if;

  -- retry เมื่อ code ชน — โอกาสชนที่ 1.07e9 combination แทบเป็นศูนย์
  -- แต่ "แทบ" ไม่ใช่ "ไม่" จึงต้องมี loop ไม่ใช่ปล่อยให้ผู้ใช้เจอ error
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.rooms (code, name, owner_id)
      values (
        public.generate_room_code(),
        coalesce(nullif(trim(p_name), ''), 'Music Room'),
        p_owner
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'DATABASE_ERROR: room code collision after % attempts', v_attempt;
      end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, p_owner, 'OWNER');

  -- ★ สร้างแถว playback ว่างพร้อมห้องเสมอ
  --   ทำให้ฟังก์ชันอื่นสมมติได้ตลอดว่าแถวนี้มีอยู่ ไม่ต้อง upsert ให้ซับซ้อน
  --   และไม่มีช่วงเวลาที่ห้องมีอยู่แต่ playback ยังไม่มี
  insert into public.playback_states (room_id) values (v_room.id);

  return v_room;
end;
$$;


create or replace function public.join_room(
  p_code text,
  p_user uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into v_room from public.rooms where code = upper(p_code);
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- เข้าห้องซ้ำได้ไม่จำกัด (refresh หน้า / เปิดหลาย tab) จึงต้อง idempotent
  -- ★ do update ไม่ใช่ do nothing เพราะต้องอัปเดต last_seen_at
  --   แต่ห้ามแตะ role เด็ดขาด ไม่งั้น OWNER ที่กลับเข้าห้องจะถูกลดเป็น MEMBER
  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, p_user, 'MEMBER')
  on conflict (room_id, user_id)
  do update set last_seen_at = now();

  return v_room;
end;
$$;


create or replace function public.touch_member(
  p_room_id uuid,
  p_user    uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = p_user;
$$;


-- ===========================================================================
-- ส่วนที่ 3 · Queue
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- enqueue_track — เพิ่มเพลงเข้าคิวแบบปลอดภัยจาก race condition
-- ---------------------------------------------------------------------------
-- สถานการณ์ที่ต้องรองรับ: A, B, C กด Add พร้อมกันในเสี้ยววินาทีเดียวกัน
--
-- ★ ทำไม max(position) + 1 ตรงนี้ถึงปลอดภัย ทั้งที่เป็นรูปแบบที่ห้ามทำจาก client
--
--   จาก client:  อ่าน max → (ช่องว่างที่ใครก็แทรกได้) → เขียน
--                A อ่านได้ 5, B อ่านได้ 5, ทั้งคู่เขียน 6 → ซ้ำ
--
--   ในนี้:       ถือ advisory lock ของห้องอยู่ → ทรานแซกชันของห้องเดียวกัน
--                เข้ามาได้ทีละตัว ช่องว่างนั้นจึงไม่มีอยู่
--                A เข้า (lock) อ่าน 5 เขียน 6 ปล่อย → B เข้า อ่าน 6 เขียน 7
--
--   และถ้าวันหนึ่ง lock พลาดจริง ๆ unique (room_id, position) จะ reject ให้อีกชั้น
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_track(
  p_room_id  uuid,
  p_actor    uuid,
  p_video_id text,
  p_title    text,
  p_channel  text,
  p_thumb    text,
  p_duration integer
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
    raise exception 'FORBIDDEN';              -- ไม่ได้อยู่ในห้องนี้
  end if;

  if v_room.is_locked then
    raise exception 'QUEUE_LOCKED';
  end if;

  if not public.perm_can_add(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select count(*) into v_waiting
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING';

  if v_waiting >= v_room.max_queue_size then
    raise exception 'QUEUE_FULL';
  end if;

  -- เช็คซ้ำก่อน insert เพื่อให้ได้ error code ที่ถูกต้อง
  -- (ถ้าปล่อยให้ index เป็นคนจับ จะแยกไม่ออกว่าชนเพราะ video ซ้ำหรือ position ซ้ำ)
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
    duration, position, status, added_by
  )
  values (
    p_room_id, p_video_id, left(p_title, 300), left(p_channel, 200), p_thumb,
    p_duration, v_position, 'WAITING', p_actor
  )
  returning * into v_item;

  -- ถ้าห้องเงียบอยู่ ให้เพลงนี้เริ่มเล่นทันทีในทรานแซกชันเดียวกัน
  -- ★ ทำในนี้ ไม่ใช่ให้ client ยิง API ตัวที่สองตามมา
  --   เพราะระหว่างสอง request นั้นจะมีช่วงที่ "มีเพลงในคิวแต่ไม่มีอะไรเล่น"
  --   ซึ่งถ้าคนอื่นเพิ่มเพลงแทรกพอดี ลำดับจะสลับแบบคาดเดาไม่ได้
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
        video_id         = v_item.video_id,
        is_playing       = true,
        started_at       = now(),
        paused_at        = null,
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id;
  end if;

  return v_item;
end;
$$;


-- ---------------------------------------------------------------------------
-- advance_queue — เปลี่ยนไปเพลงถัดไป (เพลงจบเอง หรือถูกข้าม)
-- ---------------------------------------------------------------------------
-- ★★ นี่คือฟังก์ชันที่สำคัญที่สุดในระบบ
--
-- ปัญหา: ผู้ฟัง 50 คนได้ event ENDED จาก YouTube player พร้อมกัน
--        ถ้าทุกคนเปลี่ยนเพลงได้ เพลงจะถูกข้ามรวดเดียว 50 เพลง
--
-- ทางแก้: compare-and-swap ด้วย p_expected_id
--        client บอกมาว่า "ฉันเห็นว่าเพลงที่เล่นอยู่คือ X"
--        ถ้าตอนที่ request มาถึง เพลงปัจจุบันไม่ใช่ X แล้ว
--        แปลว่ามีคนเปลี่ยนไปก่อนหน้าเสี้ยววินาที → ไม่ทำอะไร คืนสถานะปัจจุบันกลับไป
--
--        คนแรกที่มาถึงชนะ อีก 49 คนได้ผลลัพธ์เดียวกันโดยไม่มี error
--        และ client ทั้ง 50 เครื่องจบลงด้วย state เดียวกันเสมอ
--
-- p_actor = null หมายถึง "ระบบเป็นคนเรียก" (janitor ใน 0007)
-- ใช้ได้เฉพาะ reason = 'ENDED' และเรียกได้จาก service_role เท่านั้น
-- ---------------------------------------------------------------------------
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

    -- การข้ามเพลงเป็นการกระทำที่กระทบทุกคนในห้อง จึงต้องมีสิทธิ์
    -- ส่วนการรายงานว่าเพลงจบ สมาชิกทุกคนทำได้ (แต่มีด่านตรวจเวลาด้านล่าง)
    if p_reason = 'SKIPPED' and not public.perm_can_skip(v_role, v_room) then
      raise exception 'FORBIDDEN';
    end if;
  elsif p_reason <> 'ENDED' then
    raise exception 'FORBIDDEN';               -- ระบบข้ามเพลงเองไม่ได้
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ★★ Compare-and-swap
  -- เงื่อนไขนี้คือทั้งหมดที่กันการเปลี่ยนเพลงซ้ำซ้อน
  -- return เฉย ๆ ไม่ raise เพราะ "มีคนทำไปก่อนแล้ว" ไม่ใช่ความผิดพลาด
  if v_pb.queue_item_id is distinct from p_expected_id then
    return v_pb;
  end if;

  if p_expected_id is not null then
    select * into v_current from public.queue_items where id = p_expected_id for update;
  end if;

  -- ★ ด่านกันการยิง /next รัว ๆ เพื่อข้ามเพลงของคนอื่น
  --   เพลงจบจริงต้องเล่นไปแล้วเกือบครบความยาว เผื่อ 5 วินาทีให้ buffer/โฆษณา
  --   (ถ้าอยากข้ามก่อนเวลาต้องใช้ SKIPPED ซึ่งเช็คสิทธิ์ไปแล้วข้างบน)
  if p_reason = 'ENDED' and v_current.id is not null then
    v_elapsed := public.playback_position_now(v_pb);
    if v_elapsed < v_current.duration - 5 then
      raise exception 'PREMATURE_END';
    end if;
  end if;

  -- ปิดเพลงเดิม
  if v_current.id is not null then
    update public.queue_items
    set status   = case when p_reason = 'SKIPPED' then 'SKIPPED'::public.queue_status
                        else 'PLAYED'::public.queue_status end,
        ended_at = now()
    where id = v_current.id;
  end if;

  -- หาเพลงถัดไป — ใช้ queue_items_next_waiting_idx อ่านแถวแรกของ index ตรง ๆ
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
    -- คิวหมด — หยุดนิ่ง ไม่ใช่ error
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
-- set_playback — Play / Pause / Seek
-- ---------------------------------------------------------------------------
create or replace function public.set_playback(
  p_room_id  uuid,
  p_actor    uuid,
  p_action   text,
  p_position integer default null
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb       public.playback_states;
  v_room     public.rooms;
  v_role     public.member_role;
  v_item     public.queue_items;
  v_target   integer;
begin
  if p_action not in ('PLAY', 'PAUSE', 'SEEK') then
    raise exception 'VALIDATION_FAILED: unknown action %', p_action;
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null or not public.perm_can_control(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;

  if v_pb.queue_item_id is null then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- ไม่มีเพลงให้ควบคุม
  end if;

  select * into v_item from public.queue_items where id = v_pb.queue_item_id;

  if p_action = 'PLAY' then
    if v_pb.is_playing then
      return v_pb;                             -- อยู่ในสถานะที่ขอแล้ว → idempotent
    end if;
    update public.playback_states
    set is_playing = true,
        started_at = now(),                    -- anchor ใหม่ current_position คงเดิม
        paused_at  = null,
        version    = version + 1
    where room_id = p_room_id
    returning * into v_pb;

  elsif p_action = 'PAUSE' then
    if not v_pb.is_playing then
      return v_pb;
    end if;
    update public.playback_states
    set is_playing       = false,
        -- freeze ตำแหน่ง ณ วินาทีนี้ไว้ ไม่งั้นพอ resume จะกระโดด
        current_position = least(
          floor(public.playback_position_now(v_pb))::integer,
          v_item.duration
        ),
        paused_at        = now(),
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;

  else -- SEEK
    if p_position is null or p_position < 0 then
      raise exception 'VALIDATION_FAILED: position required for SEEK';
    end if;

    v_target := least(p_position, v_item.duration);

    update public.playback_states
    set current_position = v_target,
        -- ถ้ากำลังเล่นอยู่ต้องรีเซ็ต anchor ด้วย ไม่งั้นสูตรจะนับเวลาซ้ำ
        started_at       = case when is_playing then now() else started_at end,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  end if;

  return v_pb;
end;
$$;


-- ---------------------------------------------------------------------------
-- remove_queue_item — ลบเพลงที่ยังไม่ได้เล่น
-- ---------------------------------------------------------------------------
create or replace function public.remove_queue_item(
  p_room_id uuid,
  p_actor   uuid,
  p_item_id uuid
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_role public.member_role;
  v_item public.queue_items;
begin
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

  select * into v_item
  from public.queue_items
  where id = p_item_id and room_id = p_room_id     -- ★ ผูก room_id ด้วยเสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  -- ★ ลบเพลงที่กำลังเล่นอยู่ไม่ได้ ต้องใช้ Skip
  --   ถ้าปล่อยให้ลบได้ playback_states จะชี้ไปที่เพลงที่ถูกลบ
  --   แล้วต้องมี logic กู้สถานะเพิ่มอีกชุด — กันไว้ตั้งแต่ต้นง่ายกว่า
  if v_item.status <> 'WAITING' then
    raise exception 'FORBIDDEN';
  end if;

  -- เจ้าของห้องลบได้ทุกเพลง คนอื่นลบได้เฉพาะเพลงที่ตัวเองเพิ่ม
  if not public.perm_can_manage(v_role, v_room) and v_item.added_by is distinct from p_actor then
    raise exception 'FORBIDDEN';
  end if;

  update public.queue_items
  set status = 'REMOVED', ended_at = now()
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;


-- ---------------------------------------------------------------------------
-- clear_queue — ล้างเพลงที่รออยู่ทั้งหมด (เพลงที่กำลังเล่นไม่ถูกแตะ)
-- ---------------------------------------------------------------------------
create or replace function public.clear_queue(
  p_room_id uuid,
  p_actor   uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms;
  v_role    public.member_role;
  v_removed integer;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null or not public.perm_can_manage(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  update public.queue_items
  set status = 'REMOVED', ended_at = now()
  where room_id = p_room_id and status = 'WAITING';

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;


-- ===========================================================================
-- ส่วนที่ 4 · Grants
-- ===========================================================================
-- ★★★ ส่วนนี้สำคัญไม่แพ้ตัวฟังก์ชันเอง
--
-- Postgres ให้สิทธิ์ EXECUTE กับ PUBLIC โดยอัตโนมัติเมื่อสร้างฟังก์ชัน
-- ถ้าไม่ revoke ผู้ใช้ที่ถือ anon key จะเรียก RPC เหล่านี้ตรง ๆ ผ่าน PostgREST ได้
-- เช่น supabase.rpc('enqueue_track', { p_actor: '<uuid ของคนอื่น>' , ... })
--
-- ฟังก์ชันพวกนี้เป็น SECURITY DEFINER และรับ p_actor เป็นพารามิเตอร์
-- ซึ่งแปลว่าผู้เรียก "บอกเองได้ว่าตัวเองเป็นใคร" — ปลอดภัยเฉพาะเมื่อผู้เรียก
-- คือ Route Handler ของเราที่อ่าน actor จาก session จริงเท่านั้น
--
-- จึงต้องปิดประตูให้เหลือทางเดียว: service_role
-- ===========================================================================

revoke execute on function
  public.create_room(uuid, text),
  public.join_room(text, uuid),
  public.touch_member(uuid, uuid),
  public.enqueue_track(uuid, uuid, text, text, text, text, integer),
  public.advance_queue(uuid, uuid, uuid, text),
  public.set_playback(uuid, uuid, text, integer),
  public.remove_queue_item(uuid, uuid, uuid),
  public.clear_queue(uuid, uuid),
  public.generate_room_code()
from public, anon, authenticated;

grant execute on function
  public.create_room(uuid, text),
  public.join_room(text, uuid),
  public.touch_member(uuid, uuid),
  public.enqueue_track(uuid, uuid, text, text, text, text, integer),
  public.advance_queue(uuid, uuid, uuid, text),
  public.set_playback(uuid, uuid, text, integer),
  public.remove_queue_item(uuid, uuid, uuid),
  public.clear_queue(uuid, uuid),
  public.generate_room_code()
to service_role;


-- helper ที่ RLS policy ต้องใช้ — ผู้ใช้ที่ login แล้วต้องเรียกได้
-- ปลอดภัยเพราะอ่าน auth.uid() ของตัวเอง ไม่รับ actor จากภายนอก
revoke execute on function
  public.is_room_member(uuid),
  public.my_room_role(uuid)
from public, anon;

grant execute on function
  public.is_room_member(uuid),
  public.my_room_role(uuid)
to authenticated, service_role;

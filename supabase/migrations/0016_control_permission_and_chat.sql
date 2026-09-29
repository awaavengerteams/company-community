-- ===========================================================================
-- 0016 · หยุด/เล่นต้องมีสิทธิ์ + แชทอยู่ต่อหลังรีเฟรช
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ส่วนที่ 1 · set_playback ใช้ด่านสิทธิ์เดียวกับการลัดคิว
-- ---------------------------------------------------------------------------
-- ★★ ทำไมรวมเป็นสิทธิ์เดียว ไม่แยก "ลัดคิว" กับ "หยุด/เล่น"
--
--    ทั้งสองอย่างเปลี่ยนสิ่งที่ทุกคนในห้องได้ยิน ณ วินาทีนั้นทันที และย้อนไม่ได้
--    คนที่กดหยุดเพลงกลางวงได้ ก็ก่อกวนได้ไม่ต่างจากคนที่ลัดคิวได้
--
--    ★ สิทธิ์สองใบที่ต้องแจกแยกกันแต่มีผลเหมือนกัน คือภาระของเจ้าของห้อง
--      โดยไม่ได้อะไรกลับมา — ถ้าวันหนึ่งพบว่าต้องแยกจริง ค่อยแตกทีหลังได้
--      เพราะด่านอยู่ที่ member_can_skip() ที่เดียว
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

  if v_role is null or not public.member_can_skip(p_room_id, p_actor) then
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
        started_at       = case when is_playing then now() else started_at end,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  end if;

  return v_pb;
end;
$$;


-- ===========================================================================
-- ส่วนที่ 2 · แชทเก็บลงฐานข้อมูล
-- ===========================================================================
--
-- ★★★ นี่คือการกลับคำตัดสินใจเดิม อ่านให้ครบก่อนแก้ต่อ
--
--     เดิมแชทวิ่งผ่าน Realtime broadcast ล้วน ไม่แตะฐานข้อมูล ด้วยเหตุผลว่า
--     "ไม่มีใครกลับมาอ่านแชทของห้องเมื่อวาน"
--
--     ข้อนั้นยังจริง แต่ที่พลาดคือกรณีที่ใกล้กว่านั้นมาก: **การรีเฟรชหน้า**
--     ผู้ใช้ที่กด F5 หรือเน็ตหลุดแล้วโหลดใหม่ เสียบทสนทนาทั้งหมดที่เพิ่งคุยไป
--     เมื่อสิบวินาทีก่อน ซึ่งไม่ใช่ "แชทเมื่อวาน" แต่คือแชทที่กำลังคุยกันอยู่
--
--     ★ ผลพลอยได้ที่สำคัญกว่าที่คิด: broadcast ไม่มีการยืนยันตัวตนระดับข้อความ
--       ใครที่อยู่ในห้องและเขียน JS เป็น ส่งข้อความในชื่อคนอื่นได้
--       พอย้ายมาเขียนผ่าน RPC ฝั่ง server เป็นคนใส่ user_id เอง
--       — ช่องโหว่นั้นหายไปเลยโดยไม่ต้องทำอะไรเพิ่ม
--
--     ราคาที่จ่าย: ตาราง + RLS + index + การกวาดของเก่า ซึ่งคือสิ่งที่
--     คอมเมนต์เดิมบอกว่าไม่อยากจ่าย — ตอนนี้จ่ายแล้วเพราะเหตุผลเปลี่ยน
-- ---------------------------------------------------------------------------

create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  text         text not null default ''
               constraint chat_messages_text_len check (char_length(text) <= 300),
  image_url    text
               constraint chat_messages_image_https
               check (image_url is null or image_url ~ '^https://'),
  image_width  integer,
  image_height integer,
  /**
   * ★ เก็บ mentions เป็น jsonb ไม่ใช่ตารางแยก
   *   มันคือ "เจตนาของผู้ส่ง ณ ตอนส่ง" ไม่ใช่ความสัมพันธ์ที่ต้อง query ย้อน
   *   ไม่มีที่ไหนถามว่า "ข้อความไหนบ้างที่ @ คนนี้" — มีแต่อ่านพร้อมข้อความ
   */
  mentions     jsonb not null default '[]'::jsonb,
  /** สำเนาของข้อความที่ตอบกลับ — เก็บไว้เพราะต้นฉบับอาจถูกลบไปแล้ว */
  reply_to     jsonb,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.chat_messages is
  'ข้อความแชทในห้อง — อายุสั้น กวาดทิ้งด้วย cron หลัง 24 ชั่วโมง';

-- ★ index เดียวที่ต้องมีจริง: ดึงข้อความล่าสุดของห้องหนึ่ง
--   ทุกการอ่านในระบบเป็นรูปแบบนี้หมด (bootstrap + resync)
create index if not exists chat_messages_room_time_idx
  on public.chat_messages (room_id, created_at desc);

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null
             constraint chat_reactions_emoji_len check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  -- ★ คนเดียวกดอีโมจิเดิมซ้ำไม่ได้ — กดซ้ำ = ถอน ซึ่งเป็นการลบแถว
  primary key (message_id, user_id, emoji)
);


-- ---------------------------------------------------------------------------
-- RLS — อ่านได้เฉพาะคนในห้อง เขียนผ่าน RPC เท่านั้น
-- ---------------------------------------------------------------------------
alter table public.chat_messages  enable row level security;
alter table public.chat_reactions enable row level security;

drop policy if exists "chat_messages: read in room" on public.chat_messages;
create policy "chat_messages: read in room"
  on public.chat_messages for select
  using (public.is_room_member(room_id));

drop policy if exists "chat_reactions: read in room" on public.chat_reactions;
create policy "chat_reactions: read in room"
  on public.chat_reactions for select
  using (
    exists (
      select 1 from public.chat_messages m
      where m.id = chat_reactions.message_id and public.is_room_member(m.room_id)
    )
  );

-- ★ ไม่มี policy สำหรับ insert/update/delete โดยตั้งใจ
--   RLS เป็น default-deny อยู่แล้ว การไม่เขียน policy = ห้ามทุกคนเขียนตรง ๆ
--   ทางเดียวที่เขียนได้คือผ่าน RPC ที่เป็น security definer ซึ่งเราคุมทั้งหมด


-- ---------------------------------------------------------------------------
-- ส่งข้อความ
-- ---------------------------------------------------------------------------
create or replace function public.send_chat_message(
  p_room_id      uuid,
  p_actor        uuid,
  p_text         text,
  p_image_url    text default null,
  p_image_width  integer default null,
  p_image_height integer default null,
  p_mentions     jsonb default '[]'::jsonb,
  p_reply_to     jsonb default null
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.member_role;
  v_row  public.chat_messages;
begin
  -- ★ ไม่ต้องจับ advisory lock — การส่งข้อความไม่แข่งกับใคร
  --   ต่างจากคิวเพลงที่ลำดับต้องไม่ซ้ำ ข้อความสองข้อความที่มาพร้อมกัน
  --   ถูกต้องทั้งคู่ไม่ว่าจะเรียงยังไง การล็อกจะทำให้ห้องที่คุยกันรัว ๆ ช้าลงเปล่า ๆ
  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if coalesce(btrim(p_text), '') = '' and p_image_url is null then
    raise exception 'VALIDATION_FAILED: empty message';
  end if;

  insert into public.chat_messages (
    room_id, user_id, text, image_url, image_width, image_height, mentions, reply_to
  )
  values (
    p_room_id, p_actor, coalesce(p_text, ''), p_image_url, p_image_width, p_image_height,
    coalesce(p_mentions, '[]'::jsonb), p_reply_to
  )
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------------
-- ลบข้อความ — เฉพาะของตัวเอง หรือเจ้าของห้อง
-- ---------------------------------------------------------------------------
create or replace function public.delete_chat_message(
  p_actor      uuid,
  p_message_id uuid
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg  public.chat_messages;
  v_role public.member_role;
begin
  select * into v_msg from public.chat_messages where id = p_message_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- ใช้รหัสกลางของระบบ (แปลว่า "ไม่พบสิ่งที่อ้างถึง")
  end if;

  select role into v_role
  from public.room_members
  where room_id = v_msg.room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ เจ้าของห้องลบของคนอื่นได้ด้วย — ต้องมีคนเก็บกวาดได้เมื่อมีคนส่งของไม่ควรส่ง
  if v_msg.user_id <> p_actor and v_role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * ★ ทำเครื่องหมายว่าลบ ไม่ลบแถวทิ้ง
   *   แถวที่หายไปทำให้บทสนทนาขาดตอนจนคนอ่านย้อนไม่เข้าใจ และข้อความที่
   *   อ้างถึงมันอยู่จะชี้ไปที่ความว่างเปล่า
   *   ★ เนื้อความถูกล้างจริง ๆ ด้วย — "ลบแล้ว" ต้องแปลว่าอ่านไม่ได้อีก
   *     ไม่ใช่แค่ซ่อนจาก UI แล้วยังดึงกลับมาได้จาก API
   */
  update public.chat_messages
  set deleted_at = now(), text = '', image_url = null,
      image_width = null, image_height = null
  where id = p_message_id
  returning * into v_msg;

  return v_msg;
end;
$$;


-- ---------------------------------------------------------------------------
-- กด/ถอนอีโมจิบนข้อความ
-- ---------------------------------------------------------------------------
create or replace function public.toggle_chat_reaction(
  p_actor      uuid,
  p_message_id uuid,
  p_emoji      text,
  p_on         boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
begin
  select room_id into v_room from public.chat_messages where id = p_message_id;
  if v_room is null then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- ใช้รหัสกลางของระบบ (แปลว่า "ไม่พบสิ่งที่อ้างถึง")
  end if;

  if not exists (
    select 1 from public.room_members where room_id = v_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_on then
    -- ★ on conflict do nothing = กดซ้ำไม่พัง และไม่ต้องเช็คก่อนว่ามีอยู่ไหม
    --   (การเช็คก่อนแล้วค่อย insert คือ race condition คลาสสิก)
    insert into public.chat_reactions (message_id, user_id, emoji)
    values (p_message_id, p_actor, p_emoji)
    on conflict do nothing;
  else
    delete from public.chat_reactions
    where message_id = p_message_id and user_id = p_actor and emoji = p_emoji;
  end if;

  return p_on;
end;
$$;


-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- ★ ต้องเพิ่มเข้า publication เอง ไม่ได้มาเองตอน create table
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'chat_reactions'
  ) then
    alter publication supabase_realtime add table public.chat_reactions;
  end if;
end
$$;

-- ★ replica identity full — ต้องมีเพื่อให้ payload ของ DELETE มีข้อมูลครบ
--   ไม่งั้นตอนถอนอีโมจิ ฝั่ง client จะได้แค่ primary key ซึ่งพอสำหรับตารางนี้
--   (pk คือสามคอลัมน์ที่เราต้องใช้พอดี) แต่ chat_messages ต้องการ room_id
--   เพื่อให้ RLS กรองได้ถูกห้อง
alter table public.chat_messages  replica identity full;
alter table public.chat_reactions replica identity full;


revoke execute on function public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb)
  to service_role;

revoke execute on function public.delete_chat_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_chat_message(uuid, uuid) to service_role;

revoke execute on function public.toggle_chat_reaction(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.toggle_chat_reaction(uuid, uuid, text, boolean)
  to service_role;

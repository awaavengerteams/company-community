-- ===========================================================================
-- 0018 · สติกเกอร์
-- ===========================================================================
--
-- ★★★ ทำไมไม่เอาชุดสติกเกอร์ของ LINE/Facebook มาใส่
--
--     ทั้งสองเจ้าเป็นงานมีลิขสิทธิ์ การเอามาใช้คือการละเมิด ไม่ว่าจะ
--     "แค่ในกลุ่มเพื่อน" หรือไม่ — และเป็นความเสี่ยงที่ตกกับเจ้าของเว็บ
--
--     ★ จึงออกแบบให้สติกเกอร์มาจากสองทางที่ถูกกฎหมาย 100%:
--
--       1. อีโมจิตัวใหญ่ — ไม่ต้องเก็บอะไรเลย เก็บแค่ตัวอักษรอีโมจิใน text
--          แล้วฝั่ง UI วาดใหญ่ 96px โดยไม่มีฟองข้อความ
--          ★ ไม่มีไฟล์ ไม่มีลิขสิทธิ์ ไม่มีที่เก็บ ใช้ได้ทันทีตั้งแต่วันแรก
--
--       2. สติกเกอร์ของห้องเอง — สมาชิกอัปรูปเข้าชุดของห้องนี้
--          ★ อันนี้แหละที่ทำให้สนุกจริง เพราะกลายเป็นรูปหน้าเพื่อนกันเอง
--            ซึ่งเป็นของที่ไม่มีเจ้าไหนขายได้
--
-- ★★ ทำไมเป็น "ของห้อง" ไม่ใช่ "ของคน"
--
--    สติกเกอร์มีความหมายก็ต่อเมื่อคนในวงเข้าใจตรงกัน — รูปหน้าเพื่อนคนหนึ่ง
--    ตลกเฉพาะในกลุ่มที่รู้จักเขา ชุดที่ผูกกับห้องจึงตรงกับวิธีที่คนใช้จริง
--    และทำให้ขอบเขตการมองเห็นตรงกับ RLS ของห้องพอดีโดยไม่ต้องคิดเพิ่ม
-- ---------------------------------------------------------------------------

-- ★ ธงเดียว ไม่ใช่คอลัมน์ใหม่ทั้งชุด
--   สติกเกอร์คือข้อความชนิดหนึ่ง — ตัวอักษรอีโมจิอยู่ใน text ส่วนรูปอยู่ใน
--   image_url เหมือนเดิมทุกอย่าง ต่างแค่ "วาดใหญ่และไม่มีฟอง"
--   การแยกเป็นตารางใหม่จะทำให้ต้องรวมสองแหล่งตอนอ่านแชททุกครั้งโดยไม่ได้อะไร
alter table public.chat_messages
  add column if not exists is_sticker boolean not null default false;


create table if not exists public.room_stickers (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  url        text not null
             constraint room_stickers_https check (url ~ '^https://'),
  width      integer,
  height     integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.room_stickers is
  'ชุดสติกเกอร์ของห้อง — สมาชิกอัปเข้ามาเอง ใช้ได้เฉพาะในห้องนั้น';

create index if not exists room_stickers_room_idx
  on public.room_stickers (room_id, created_at desc);

alter table public.room_stickers enable row level security;

drop policy if exists "room_stickers: read in room" on public.room_stickers;
create policy "room_stickers: read in room"
  on public.room_stickers for select
  using (public.is_room_member(room_id));

-- ★ ไม่มี policy เขียน — เหมือนทุกตารางในระบบนี้ เขียนผ่าน RPC เท่านั้น


-- ---------------------------------------------------------------------------
-- เพิ่ม/ลบสติกเกอร์ของห้อง
-- ---------------------------------------------------------------------------
create or replace function public.add_room_sticker(
  p_room_id uuid,
  p_actor   uuid,
  p_url     text,
  p_width   integer default null,
  p_height  integer default null
)
returns public.room_stickers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.member_role;
  v_count integer;
  v_row   public.room_stickers;
begin
  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ เพดานต่อห้อง — ไม่ใช่เรื่องพื้นที่เก็บ แต่เป็นเรื่องแผงเลือกที่ใช้ได้จริง
  --   ชุดที่มี 500 ตัวคือชุดที่ไม่มีใครหาอะไรเจอ และเลื่อนหาจนเลิกใช้
  select count(*) into v_count from public.room_stickers where room_id = p_room_id;
  if v_count >= 60 then
    raise exception 'QUEUE_FULL';   -- ใช้รหัสกลางของระบบ (แปลว่า "เต็มแล้ว")
  end if;

  insert into public.room_stickers (room_id, url, width, height, created_by)
  values (p_room_id, p_url, p_width, p_height, p_actor)
  returning * into v_row;

  return v_row;
end;
$$;


create or replace function public.remove_room_sticker(
  p_actor      uuid,
  p_sticker_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sticker public.room_stickers;
  v_role    public.member_role;
begin
  select * into v_sticker from public.room_stickers where id = p_sticker_id;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = v_sticker.room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ คนที่อัปเอง หรือเจ้าของห้อง — ต้องมีคนเก็บกวาดได้เสมอ
  --   สติกเกอร์เป็นของที่ทุกคนในห้องเห็นตลอดเวลา ต่างจากข้อความที่ไหลผ่านไป
  if v_sticker.created_by is distinct from p_actor and v_role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.room_stickers where id = p_sticker_id;
  return p_sticker_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- send_chat_message — รับธงสติกเกอร์เพิ่ม
-- ---------------------------------------------------------------------------
-- ★ เนื้อในเหมือน 0016 ทุกบรรทัด ต่างแค่พารามิเตอร์ใหม่หนึ่งตัว
--   (plpgsql แก้เฉพาะบางบรรทัดไม่ได้ ต้องเขียนใหม่ทั้งก้อน)
create or replace function public.send_chat_message(
  p_room_id      uuid,
  p_actor        uuid,
  p_text         text,
  p_image_url    text default null,
  p_image_width  integer default null,
  p_image_height integer default null,
  p_mentions     jsonb default '[]'::jsonb,
  p_reply_to     jsonb default null,
  p_is_sticker   boolean default false
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
    room_id, user_id, text, image_url, image_width, image_height,
    mentions, reply_to, is_sticker
  )
  values (
    p_room_id, p_actor, coalesce(p_text, ''), p_image_url, p_image_width, p_image_height,
    coalesce(p_mentions, '[]'::jsonb), p_reply_to, coalesce(p_is_sticker, false)
  )
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------------
-- Realtime — สติกเกอร์ใหม่ต้องโผล่ที่แผงของทุกคนทันที
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'room_stickers'
  ) then
    alter publication supabase_realtime add table public.room_stickers;
  end if;
end
$$;

-- ★ ต้องมี full เพราะการลบสติกเกอร์เป็น DELETE จริง (ไม่ใช่ soft delete)
--   ถ้าไม่มี payload ของ DELETE จะมีแค่ id ซึ่งไม่มี room_id ให้ RLS กรอง
alter table public.room_stickers replica identity full;


revoke execute on function public.add_room_sticker(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.add_room_sticker(uuid, uuid, text, integer, integer)
  to service_role;

revoke execute on function public.remove_room_sticker(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_room_sticker(uuid, uuid) to service_role;

revoke execute on function
  public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function
  public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb, boolean)
  to service_role;

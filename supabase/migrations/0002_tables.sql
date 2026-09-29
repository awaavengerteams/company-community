-- ============================================================================
-- 0002 · Tables & Triggers
-- ============================================================================
-- Index / constraint ที่ไม่ใช่ PK-FK อยู่ใน 0003 เพื่อให้ไฟล์นี้อ่านเป็น
-- "รูปร่างของข้อมูล" ล้วน ๆ
-- ============================================================================


-- ---------------------------------------------------------------------------
-- helper: อัปเดต updated_at อัตโนมัติ
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ===========================================================================
-- profiles — ข้อมูลผู้ใช้ที่เราเป็นเจ้าของ (auth.users เป็นของ Supabase)
-- ===========================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'Listener'
                constraint profiles_display_name_len
                check (char_length(display_name) between 1 and 40),
  avatar_url    text
                constraint profiles_avatar_https
                check (avatar_url is null or avatar_url ~ '^https://'),
  -- true = ผู้ใช้ anonymous (ยังไม่ผูก email/OAuth)
  -- เก็บไว้เพื่อให้ UI แยกแสดงได้ และเพื่ออนาคตที่จะ upgrade guest → สมาชิกจริง
  is_guest      boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'ข้อมูลผู้ใช้ฝั่งแอป 1:1 กับ auth.users สร้างอัตโนมัติด้วย trigger';


-- ---------------------------------------------------------------------------
-- สร้าง profile ทุกครั้งที่มี auth user ใหม่ (รวม anonymous sign-in)
-- ---------------------------------------------------------------------------
-- ★ ทำไมต้องเป็น trigger ไม่ใช่ให้ Route Handler insert เอง:
--   anonymous sign-in เกิดขึ้นฝั่ง client ผ่าน GoTrue โดยตรง ไม่ผ่าน server เรา
--   ถ้ารอ server มา insert จะมีช่วงที่ auth.uid() มีอยู่แต่ profile ยังไม่มี
--   แล้ว foreign key ของ room_members / queue_items จะพังเป็นครั้งคราว
--   (race ที่ reproduce ยากมาก) — trigger ปิดช่องนี้ในทรานแซกชันเดียวกับการสมัคร
--
-- ★ ไม่ใช้ new.is_anonymous เพราะเป็นคอลัมน์ที่เพิ่งมีใน GoTrue รุ่นใหม่
--   เช็คจาก email/phone เป็น null แทน ซึ่งเป็นจริงกับ anonymous เสมอ
--   และพอ user ผูก email ภายหลัง เราอัปเดต is_guest เองใน Route Handler
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_guest)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      'Listener ' || upper(left(replace(new.id::text, '-', ''), 4))
    ),
    new.email is null and new.phone is null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ===========================================================================
-- rooms
-- ===========================================================================
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),

  -- Crockford Base32 (0-9 A-Z ตัด I L O U) 6 หลัก = 32^6 ≈ 1.07e9
  -- ตัวชุดนี้ normalize ได้: ผู้ใช้พิมพ์ O → 0, พิมพ์ I/L → 1 ได้ไม่กำกวม
  code        text not null
              constraint rooms_code_format
              check (code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$'),

  name        text not null default 'Music Room'
              constraint rooms_name_len
              check (char_length(name) between 1 and 60),

  owner_id    uuid not null references public.profiles(id) on delete cascade,

  -- ─── Permission configuration ───────────────────────────────────────────
  -- เก็บเป็นคอลัมน์ในห้อง ไม่ hardcode ในโค้ด เพื่อให้เปลี่ยนนโยบายภายหลัง
  -- ได้โดยไม่ต้อง migrate และให้แต่ละห้องตั้งค่าต่างกันได้
  is_locked             boolean not null default false,  -- ปิดรับเพลงใหม่ชั่วคราว
  allow_guest_add       boolean not null default true,   -- GUEST เพิ่มเพลงได้ไหม
  allow_member_skip     boolean not null default false,  -- MEMBER กด Skip ได้ไหม
  allow_member_control  boolean not null default false,  -- MEMBER กด Play/Pause/Seek ได้ไหม

  max_queue_size  integer not null default 200
                  constraint rooms_max_queue_range
                  check (max_queue_size between 1 and 1000),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger rooms_touch
  before update on public.rooms
  for each row execute function public.touch_updated_at();


-- ===========================================================================
-- room_members
-- ===========================================================================
create table public.room_members (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          public.member_role not null default 'GUEST',
  joined_at     timestamptz not null default now(),
  -- ใช้ตัดสิน "leader" ตอนต้องเลือกว่าใครรายงานเพลงจบ เมื่อ OWNER ไม่อยู่
  last_seen_at  timestamptz not null default now(),

  constraint room_members_unique_membership unique (room_id, user_id)
);

comment on column public.room_members.last_seen_at is
  'อัปเดตเป็นระยะจาก presence ไม่ใช่ทุก request — ใช้เลือก leader เท่านั้น';


-- ===========================================================================
-- queue_items
-- ===========================================================================
create table public.queue_items (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,

  -- YouTube video id เป็น 11 ตัวอักษร base64url เสมอ
  -- ตรวจที่ระดับ DB ด้วย เพราะค่านี้ถูกส่งต่อไปที่ IFrame Player โดยตรง
  video_id       text not null
                 constraint queue_items_video_id_format
                 check (video_id ~ '^[A-Za-z0-9_-]{11}$'),

  title          text not null
                 constraint queue_items_title_len
                 check (char_length(title) between 1 and 300),
  channel_title  text
                 constraint queue_items_channel_len
                 check (channel_title is null or char_length(channel_title) <= 200),
  thumbnail_url  text
                 constraint queue_items_thumb_https
                 check (thumbnail_url is null or thumbnail_url ~ '^https://'),

  -- วินาที · เพดาน 10 ชั่วโมง กัน live stream / วิดีโอยาวผิดปกติเข้าคิว
  duration       integer not null
                 constraint queue_items_duration_range
                 check (duration > 0 and duration <= 36000),

  -- ★ เพิ่มขึ้นเรื่อย ๆ ต่อห้อง ไม่เคยใช้ซ้ำแม้เพลงจะถูกลบ
  --   ทำให้ unique (room_id, position) ครอบทุกแถวได้ (ดู 0003)
  position       bigint not null,

  status         public.queue_status not null default 'WAITING',
  added_by       uuid references public.profiles(id) on delete set null,

  -- เวลาที่เพลงนี้เริ่ม/จบจริง ใช้ทำ history และ debug การซิงก์
  started_at     timestamptz,
  ended_at       timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger queue_items_touch
  before update on public.queue_items
  for each row execute function public.touch_updated_at();


-- ===========================================================================
-- playback_states — หัวใจของการซิงก์ · 1 แถวต่อ 1 ห้อง
-- ===========================================================================
-- ความหมายของแต่ละ field (ทั้งระบบพึ่งนิยามนี้):
--
--   is_playing = true   →  position(t) = current_position + (t - started_at)
--   is_playing = false  →  position(t) = current_position
--
--   started_at ★ ไม่ใช่ "เวลาที่เพลงเริ่ม" แต่คือ "anchor ล่าสุด"
--     • เริ่มเพลงใหม่ : current_position = 0, started_at = now()
--     • กด Pause     : current_position = position(now()), is_playing = false
--     • กด Play ต่อ  : started_at = now()  (current_position คงเดิม)
--     • Seek ไป S    : current_position = S, started_at = now()
--
--   ออกแบบแบบนี้เพราะทำให้ play / pause / resume / seek ใช้สูตรเดียวกันทั้งหมด
--   ไม่ต้องแยกเคสในโค้ดฝั่ง client เลย
-- ===========================================================================
create table public.playback_states (
  room_id           uuid primary key references public.rooms(id) on delete cascade,

  -- null = ไม่มีเพลงเล่นอยู่ (คิวหมด หรือห้องเพิ่งสร้าง)
  queue_item_id     uuid references public.queue_items(id) on delete set null,
  video_id          text
                    constraint playback_video_id_format
                    check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),

  is_playing        boolean not null default false,
  started_at        timestamptz,
  paused_at         timestamptz,

  current_position  integer not null default 0
                    constraint playback_position_non_negative
                    check (current_position >= 0),

  -- ★ เพิ่มขึ้นทุกครั้งที่เขียน — client ทิ้ง realtime payload ที่ version ต่ำกว่า
  --   ที่ถืออยู่ ทำให้ event ที่มาช้า/ซ้ำ/ผิดลำดับทำลาย state ไม่ได้
  version           bigint not null default 0,

  updated_at        timestamptz not null default now(),

  -- กำลังเล่นอยู่ต้องมี anchor และต้องรู้ว่าเล่นเพลงไหน — ไม่มีก็คำนวณตำแหน่งไม่ได้
  constraint playback_playing_needs_anchor
  check (
    not is_playing
    or (started_at is not null and queue_item_id is not null and video_id is not null)
  )
);

create trigger playback_states_touch
  before update on public.playback_states
  for each row execute function public.touch_updated_at();

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

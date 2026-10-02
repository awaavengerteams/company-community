-- ============================================================================
--  0049 · เกมแข่งพิมพ์ดีด — ห้องแข่ง + ผลการพิมพ์
-- ============================================================================
--  ★★★ ความคืบหน้าระหว่างแข่ง (ตัวที่พิมพ์ถึง) ไม่ลงฐานข้อมูล
--      ส่งผ่าน Supabase Realtime "broadcast" ระหว่างผู้เล่นโดยตรง
--      ★ พิมพ์ 6 คน คนละ 5 ตัวต่อวินาที = 30 แถวต่อวินาทีต่อห้อง ถ้าลงตาราง
--        ทั้งที่ข้อมูลนั้นไร้ค่าทันทีที่แข่งจบ — ลงแค่ "ผลตอนจบ" ก็พอ
--
--  ★★ เวลาเริ่มแข่งเป็นของ server (starts_at) — ทุกเครื่องนับถอยหลังไปหาเวลาเดียวกัน
--     และ server ใช้เวลานี้ตรวจว่าเวลาที่ผู้เล่นส่งมาเป็นไปได้จริง
--
--  รันซ้ำได้ — วางใน SQL Editor ได้ทั้งไฟล์
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1 · ห้องแข่ง
-- ---------------------------------------------------------------------------
create table if not exists public.typing_rooms (
  id          uuid primary key default gen_random_uuid(),
  -- รหัสห้อง 6 ตัว ไม่มีตัวที่สับสนกันง่าย (0/O, 1/I/L)
  code        text not null unique
              constraint typing_rooms_code check (code ~ '^[A-Z2-9]{6}$'),
  host_id     uuid not null references public.profiles(id) on delete cascade,

  lang        text not null constraint typing_rooms_lang check (lang in ('th', 'en')),
  length      text not null constraint typing_rooms_length check (length in ('short', 'medium')),
  -- ลำดับข้อความใน lib/games/typing/passages.ts
  passage_idx integer not null check (passage_idx >= 0),

  -- ★ "แข่งอีกรอบ" ใช้ห้องเดิม — รอบเพิ่มทีละหนึ่ง ข้อความใหม่ทุกรอบ
  round       integer not null default 1,

  status      text not null default 'WAITING'
              constraint typing_rooms_status check (status in ('WAITING', 'RACING', 'FINISHED')),
  max_players integer not null default 6 check (max_players between 2 and 6),

  -- ★ เริ่มเองเมื่อมีคนครบ 2 คนแล้วรอครบเวลานี้ (หรือห้องเต็ม)
  auto_start_at timestamptz,
  -- ★ เวลาที่ "ไป!" — ก่อนหน้านี้คือช่วงนับถอยหลัง 3-2-1
  starts_at   timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists typing_rooms_waiting_idx
  on public.typing_rooms (lang, created_at) where status = 'WAITING';

create table if not exists public.typing_room_players (
  room_id     uuid not null references public.typing_rooms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  -- ★ ออกกลางคัน — ห้องแข่งต่อได้ คนที่เหลือไม่ต้องรอ
  left_at     timestamptz,
  -- รอบที่คนนี้ร่วมแข่ง / จบรอบนั้นเมื่อไร
  round       integer not null default 1,
  finished_at timestamptz,
  primary key (room_id, user_id)
);

comment on table public.typing_room_players is
  'ผู้เล่นในห้องแข่งพิมพ์ — left_at ไม่ null = ออกไปแล้ว ห้องไม่รอคนนี้';


-- ---------------------------------------------------------------------------
-- 2 · ผลการพิมพ์ — ทั้งฝึกคนเดียวและแข่ง
-- ---------------------------------------------------------------------------
create table if not exists public.typing_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  mode        text not null constraint typing_runs_mode check (mode in ('PRACTICE', 'RACE')),
  room_id     uuid references public.typing_rooms(id) on delete set null,
  round       integer,

  lang        text not null constraint typing_runs_lang check (lang in ('th', 'en')),
  length      text not null constraint typing_runs_length check (length in ('short', 'medium')),
  passage_idx integer not null,

  created_at  timestamptz not null default now(),
  -- ★ ฝึกคนเดียว: เวลาที่ server ได้รับ "เริ่มพิมพ์ตัวแรก" — ใช้ตรวจเวลาที่ส่งมา
  began_at    timestamptz,
  finished_at timestamptz,

  chars       integer,
  keystrokes  integer,
  first_try   integer,
  elapsed_ms  integer,
  wpm         numeric(6, 1),
  accuracy    numeric(5, 1),

  -- ★★ false = บันทึกไว้ แต่ไม่นับเข้ากระดานอันดับ (เร็วเกินจริง / ตัวเลขขัดกัน)
  valid       boolean not null default false,
  flag        text
);

-- ★ ส่งผลแข่งซ้ำ (กดสองที / เน็ตส่งซ้ำ) ได้แถวเดียว
create unique index if not exists typing_runs_race_once
  on public.typing_runs (room_id, round, user_id) where mode = 'RACE';
create index if not exists typing_runs_user_idx
  on public.typing_runs (user_id, lang, finished_at desc) where finished_at is not null;
-- ★ กระดานอันดับรายสัปดาห์
create index if not exists typing_runs_board_idx
  on public.typing_runs (lang, finished_at) where valid;


-- ---------------------------------------------------------------------------
-- 3 · RLS — อ่านได้เฉพาะห้องที่ตัวเองอยู่ · เขียนผ่าน server เท่านั้น
-- ---------------------------------------------------------------------------
alter table public.typing_rooms        enable row level security;
alter table public.typing_room_players enable row level security;
alter table public.typing_runs         enable row level security;

/*
 * ★★ เช็กความเป็นสมาชิกผ่านฟังก์ชัน security definer
 *    policy ของ typing_room_players ที่ select ตารางตัวเอง = Postgres ตอบ
 *    "infinite recursion detected in policy" ★ ฟังก์ชันอ่านตารางโดยข้าม RLS
 *    จึงไม่วนกลับมาเรียก policy ซ้ำ
 */
create or replace function public.is_typing_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.typing_room_players
    where room_id = p_room and user_id = auth.uid()
  );
$$;

revoke all on function public.is_typing_room_member(uuid) from public;
grant execute on function public.is_typing_room_member(uuid) to authenticated;

drop policy if exists typing_rooms_read on public.typing_rooms;
create policy typing_rooms_read on public.typing_rooms
  for select to authenticated
  using (public.is_typing_room_member(id));

drop policy if exists typing_room_players_read on public.typing_room_players;
create policy typing_room_players_read on public.typing_room_players
  for select to authenticated
  using (public.is_typing_room_member(room_id));

drop policy if exists typing_runs_read on public.typing_runs;
create policy typing_runs_read on public.typing_runs
  for select to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 4 · Realtime — สถานะห้องเปลี่ยน (มีคนเข้า · เริ่ม · จบ)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'typing_rooms'
  ) then
    alter publication supabase_realtime add table public.typing_rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'typing_room_players'
  ) then
    alter publication supabase_realtime add table public.typing_room_players;
  end if;
end
$$;

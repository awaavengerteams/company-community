-- ============================================================================
--  0048 · เกมหมากฮอส — คำท้า + กระดานออนไลน์
-- ============================================================================
--  ★★★ ตัดสินตาเดินที่ server (Next API ใช้ lib/games/checkers/rules.ts)
--      ไม่ใช่ใน SQL — กติกามีที่เดียว ใช้ร่วมกันทั้งหน้าจอ บอท และ server
--      ★ ฐานข้อมูลมีหน้าที่สองอย่าง: เก็บสภาพกระดาน และกัน "เขียนซ้อน"
--        ด้วยคอลัมน์ version (update … where version = ที่อ่านมา)
--
--  ★★ ไม่มีตารางสถิติแยก — ชนะ/แพ้/เสมอ และอันดับรายเดือน นับจาก
--     checkers_matches ที่จบแล้วโดยตรง ★ ตัวเลขจึงเพี้ยนจากความจริงไม่ได้
--
--  รันซ้ำได้ (if not exists / drop … if exists) — วางใน SQL Editor ได้ทั้งไฟล์
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1 · คำท้า
-- ---------------------------------------------------------------------------
create table if not exists public.game_challenges (
  id          uuid primary key default gen_random_uuid(),

  -- ★ เผื่อเกมอื่นที่ท้ากันได้ในอนาคต — ตอนนี้มีแค่หมากฮอส
  game        text not null default 'checkers'
              constraint game_challenges_game check (game in ('checkers')),

  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_user     uuid not null references public.profiles(id) on delete cascade,

  -- การตั้งค่าห้องที่ผู้ท้าเลือก: { forceCapture: bool, turnSeconds: int | null }
  settings    jsonb not null default '{}'::jsonb,

  status      text not null default 'PENDING'
              constraint game_challenges_status
              check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')),

  /*
   * ★★ หมดอายุคำนวณจากเวลา ไม่ต้องมี cron มาเปลี่ยนสถานะ
   *    PENDING ที่ expires_at ผ่านไปแล้ว = หมดอายุ ทุกที่ที่อ่านเช็กเงื่อนไขนี้
   */
  expires_at  timestamptz not null,

  match_id    uuid,
  created_at  timestamptz not null default now(),
  responded_at timestamptz,

  constraint game_challenges_not_self check (from_user <> to_user)
);

comment on table public.game_challenges is
  'คำท้าเล่นเกม — PENDING ที่เลย expires_at แล้วถือว่าหมดอายุ (FR เกม เฟส 2)';

create index if not exists game_challenges_to_pending_idx
  on public.game_challenges (to_user, expires_at) where status = 'PENDING';
create index if not exists game_challenges_from_pending_idx
  on public.game_challenges (from_user, expires_at) where status = 'PENDING';


-- ---------------------------------------------------------------------------
-- 2 · กระดานออนไลน์
-- ---------------------------------------------------------------------------
create table if not exists public.checkers_matches (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid references public.game_challenges(id) on delete set null,

  -- ★ ฝ่ายล่าง (side -1) เดินก่อน · ฝ่ายบน (side 1) เดินทีหลัง
  player_bottom uuid not null references public.profiles(id) on delete cascade,
  player_top    uuid not null references public.profiles(id) on delete cascade,

  -- { board: int[64], turn: 1|-1, quiet: int, ply: int } — ดู rules.ts
  state         jsonb not null,

  -- ★★ กันสองคำขอเขียนทับกัน: update ต้อง where version = ค่าที่อ่านมา
  version       integer not null default 0,

  force_capture boolean not null default true,

  -- null = ปิดเวลาต่อตา
  turn_seconds  integer
                constraint checkers_matches_turn_seconds check (turn_seconds between 10 and 600),
  turn_deadline timestamptz,

  -- จำนวนครั้งที่หมดเวลา — ครบ 3 แพ้
  timeouts_bottom integer not null default 0,
  timeouts_top    integer not null default 0,

  -- ตาล่าสุด { from, path, captures } — ให้อีกฝ่ายเห็นว่าเพิ่งเดินอะไร
  last_move     jsonb,

  -- ใครขอเสมออยู่ (null = ไม่มีคำขอ)
  draw_offer_by uuid references public.profiles(id) on delete set null,

  status        text not null default 'ACTIVE'
                constraint checkers_matches_status check (status in ('ACTIVE', 'FINISHED')),
  winner_id     uuid references public.profiles(id) on delete set null,
  end_reason    text
                constraint checkers_matches_end_reason
                check (end_reason in ('NO_PIECES', 'NO_MOVES', 'NO_CAPTURE', 'RESIGN', 'TIMEOUT', 'DRAW_AGREED')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz,

  constraint checkers_matches_two_players check (player_bottom <> player_top)
);

comment on table public.checkers_matches is
  'กระดานหมากฮอสออนไลน์ — state ตัดสินโดย server ด้วย rules.ts · กันเขียนซ้อนด้วย version';

create index if not exists checkers_matches_bottom_idx on public.checkers_matches (player_bottom, status);
create index if not exists checkers_matches_top_idx    on public.checkers_matches (player_top, status);
-- ★ กระดานอันดับรายเดือนอ่านจากเกมที่จบในช่วงเวลา
create index if not exists checkers_matches_finished_idx
  on public.checkers_matches (finished_at) where status = 'FINISHED';


-- ---------------------------------------------------------------------------
-- 3 · RLS — อ่านได้เฉพาะคนที่เกี่ยวข้อง · เขียนผ่าน server (service role) เท่านั้น
-- ---------------------------------------------------------------------------
--  ★★ ไม่มี policy insert/update ให้ client เลย
--     ทุกการเขียนผ่าน API ที่ตรวจตาเดินด้วย rules.ts ก่อน
--     ★ policy select มีไว้ให้ Realtime ส่ง event ถึงผู้เล่นได้
alter table public.game_challenges  enable row level security;
alter table public.checkers_matches enable row level security;

drop policy if exists game_challenges_read on public.game_challenges;
create policy game_challenges_read on public.game_challenges
  for select to authenticated
  using (auth.uid() in (from_user, to_user));

drop policy if exists checkers_matches_read on public.checkers_matches;
create policy checkers_matches_read on public.checkers_matches
  for select to authenticated
  using (auth.uid() in (player_bottom, player_top));


-- ---------------------------------------------------------------------------
-- 4 · Realtime — ทางเร็ว (หน้าจอยังถามซ้ำเป็นจังหวะเผื่อ event ไม่มา)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_challenges'
  ) then
    alter publication supabase_realtime add table public.game_challenges;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkers_matches'
  ) then
    alter publication supabase_realtime add table public.checkers_matches;
  end if;
end
$$;

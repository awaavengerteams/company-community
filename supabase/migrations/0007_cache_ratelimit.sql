-- ============================================================================
-- 0007 · YouTube Cache · Rate Limit · Janitor
-- ============================================================================
-- ตารางในไฟล์นี้ไม่มีเจ้าของเป็นผู้ใช้คนไหน — เป็นโครงสร้างพื้นฐานของ server
-- จึงเปิด RLS แล้วไม่ให้ policy ใด ๆ เลย (เข้าถึงได้เฉพาะ service_role)
-- ============================================================================


-- ===========================================================================
-- youtube_search_cache
-- ===========================================================================
-- ★ นี่คือมาตรการที่สำคัญที่สุดเรื่อง quota
--
--   search.list = 100 units จาก quota เริ่มต้น 10,000/วัน
--   → ค้นหาได้แค่ ~98 ครั้งต่อวัน "ทั้งระบบ" ถ้าไม่ cache
--
--   cache ตัวนี้ใช้ร่วมกันทุกห้องทุกผู้ใช้ — คนที่ค้น "bohemian rhapsody"
--   เป็นคนที่ 2 ของวันไม่เสีย quota เลย
-- ===========================================================================
create table public.youtube_search_cache (
  -- คำค้นที่ normalize แล้ว: lowercase + trim + ยุบ whitespace ติดกัน
  -- ทำให้ "  Bohemian   RHAPSODY " กับ "bohemian rhapsody" ใช้ cache ร่วมกัน
  query_key   text not null,
  -- ผลหน้าถัด ๆ ไปของคำค้นเดียวกันต้องแยก cache (pageToken ต่างกัน)
  -- ใช้ '' แทน null เพื่อให้เป็นส่วนหนึ่งของ primary key ได้
  page_token  text not null default '',
  results     jsonb not null,
  fetched_at  timestamptz not null default now(),

  primary key (query_key, page_token)
);

-- ใช้กวาด cache เก่าทิ้ง
create index youtube_search_cache_fetched_idx
  on public.youtube_search_cache (fetched_at);


-- ===========================================================================
-- youtube_videos — metadata ราย video
-- ===========================================================================
-- videos.list ราคา 1 unit ต่อครั้ง (ได้สูงสุด 50 id) ถูกกว่า search 100 เท่า
--
-- ใช้ 2 ทาง:
--   1. เติม duration + สถานะ embed ให้ผลค้นหา (search.list ไม่คืน duration มา)
--   2. เวลาผู้ใช้วางลิงก์ YouTube ตรง ๆ → ดึงจาก cache ก่อน ถ้ามีก็ไม่เสีย quota เลย
-- ===========================================================================
create table public.youtube_videos (
  video_id      text primary key
                constraint youtube_videos_id_format
                check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title         text not null,
  channel_title text,
  thumbnail_url text,
  duration      integer not null check (duration >= 0),
  -- false = เจ้าของปิด embed หรือติดข้อจำกัดลิขสิทธิ์ → ห้ามให้เข้าคิว
  embeddable    boolean not null default true,
  -- เก็บไว้เพื่ออธิบายให้ผู้ใช้ว่าทำไมเพลงนี้เพิ่มไม่ได้
  unavailable_reason text,
  fetched_at    timestamptz not null default now()
);

create index youtube_videos_fetched_idx on public.youtube_videos (fetched_at);


-- ===========================================================================
-- rate_limits — ตัวนับแบบ fixed window
-- ===========================================================================
-- เลือกทำใน Postgres แทนที่จะพึ่ง service ภายนอก (Upstash ฯลฯ) เพราะ:
--   • ไม่เพิ่ม dependency และไม่เพิ่ม secret ที่ต้องดูแล
--   • upsert ของ Postgres เป็น atomic อยู่แล้ว จึงนับถูกต้องแม้มี request พร้อมกัน
--   • เราต่อ Postgres อยู่แล้วทุก request — ไม่มี network hop เพิ่ม
-- ===========================================================================
create table public.rate_limits (
  bucket_key   text not null,          -- 'search:<user_id>' | 'youtube:quota:2026-09-24'
  window_start timestamptz not null,
  counter      integer not null default 0,
  primary key (bucket_key, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);


-- ===========================================================================
-- RLS: เปิดแต่ไม่ให้ policy ใด ๆ = ปฏิเสธทุกอย่างสำหรับ anon/authenticated
-- ===========================================================================
alter table public.youtube_search_cache enable row level security;
alter table public.youtube_videos       enable row level security;
alter table public.rate_limits          enable row level security;

revoke all on public.youtube_search_cache, public.youtube_videos, public.rate_limits
  from anon, authenticated;


-- ===========================================================================
-- consume_rate_limit — นับและตัดสินในคำสั่งเดียว
-- ===========================================================================
-- ★ ทำไมต้องเป็นฟังก์ชันเดียว ไม่ใช่ "อ่านแล้วค่อยเขียน"
--   ถ้าแยกสองขั้นตอน จะมีช่องให้ 10 request พร้อมกันอ่านค่าเดิมได้ทั้งหมด
--   แล้วผ่านด่านไปหมดทุกตัว — ซึ่งทำให้ rate limit ไม่มีความหมาย
--
--   upsert + returning ทำให้การนับกับการตัดสินอยู่ในคำสั่ง atomic เดียวกัน
--
-- p_cost > 1 ใช้กับ quota ของ YouTube ที่ search.list = 100 units
-- ===========================================================================
create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer,
  p_cost           integer default 1
)
returns table (allowed boolean, used integer, limit_value integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  if p_cost > p_limit then
    -- ขอมากกว่าเพดานทั้งหมด — เป็นไปไม่ได้ตั้งแต่ต้น ไม่ต้องไปแตะตัวนับ
    return query select false, 0, p_limit, now();
    return;
  end if;

  -- ปัดเวลาลงเป็นช่วงหน้าต่าง เช่น window 60 วิ → 10:00:00, 10:01:00, ...
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as rl (bucket_key, window_start, counter)
  values (p_bucket, v_window, p_cost)
  on conflict (bucket_key, window_start)
  do update set counter = rl.counter + p_cost
  -- ★ where ตรงนี้คือด่านจริง: ถ้าเกินเพดานแล้ว UPDATE จะไม่เกิดขึ้น
  --   ตัวนับจึงไม่ถูกบวกเพิ่ม และเราไม่ได้แถวกลับมา
  where rl.counter + p_cost <= p_limit
  returning rl.counter into v_count;

  if v_count is null then
    select rl.counter into v_count
    from public.rate_limits rl
    where rl.bucket_key = p_bucket and rl.window_start = v_window;

    return query select
      false,
      coalesce(v_count, 0),
      p_limit,
      v_window + make_interval(secs => p_window_seconds);
    return;
  end if;

  return query select
    true,
    v_count,
    p_limit,
    v_window + make_interval(secs => p_window_seconds);
end;
$$;


-- ===========================================================================
-- reconcile_stale_playback — janitor
-- ===========================================================================
-- ปัญหาที่แก้: เพลงจบแล้วแต่ไม่มีใครรายงาน
--
--   • ทุกคนปิด tab พร้อมกันกลางเพลง
--   • คนสุดท้ายในห้องเน็ตหลุด
--   • ทุก client ได้ ENDED แต่ request หายระหว่างทาง
--
-- ถ้าไม่มีตัวนี้ ห้องจะค้างอยู่ที่เพลงเดิมตลอดไป และคนที่เข้ามาใหม่จะเห็นเพลงที่
-- "เล่นอยู่" มาแล้ว 3 ชั่วโมง
--
-- เรียกจาก Vercel Cron ทุก 1 นาที (ตั้งใน Phase 7)
-- ★ ไม่ใช่การ polling เพื่อ sync — ไม่มี client เกี่ยวข้อง เป็นงานบ้านฝั่ง server ล้วน
-- ===========================================================================
create or replace function public.reconcile_stale_playback(
  p_grace_seconds integer default 20
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     record;
  v_advanced integer := 0;
begin
  for v_row in
    select pb.room_id, pb.queue_item_id
    from public.playback_states pb
    join public.queue_items qi on qi.id = pb.queue_item_id
    where pb.is_playing
      and pb.started_at is not null
      and now() > pb.started_at
                  + make_interval(secs =>
                      greatest(qi.duration - pb.current_position, 0) + p_grace_seconds
                    )
  loop
    -- p_actor = null → เรียกในฐานะระบบ (advance_queue อนุญาตเฉพาะ reason ENDED)
    -- CAS ข้างในยังทำงานปกติ ถ้ามี client ชิงเปลี่ยนไปก่อนก็จะกลายเป็น no-op
    perform public.advance_queue(v_row.room_id, null, v_row.queue_item_id, 'ENDED');
    v_advanced := v_advanced + 1;
  end loop;

  return v_advanced;
end;
$$;


-- ===========================================================================
-- prune_ephemeral — ลบข้อมูลชั่วคราวที่หมดอายุ
-- ===========================================================================
create or replace function public.prune_ephemeral(
  p_search_cache_hours integer default 24,
  p_video_cache_days   integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  delete from public.youtube_search_cache
  where fetched_at < now() - make_interval(hours => p_search_cache_hours);
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.youtube_videos
  where fetched_at < now() - make_interval(days => p_video_cache_days);
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- เก็บ 2 วันพอ — หน้าต่างที่ยาวที่สุดที่เราใช้คือ quota รายวัน
  delete from public.rate_limits
  where window_start < now() - interval '2 days';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end;
$$;


-- ===========================================================================
-- Grants — server เท่านั้น เหมือนใน 0004
-- ===========================================================================
revoke execute on function
  public.consume_rate_limit(text, integer, integer, integer),
  public.reconcile_stale_playback(integer),
  public.prune_ephemeral(integer, integer),
  public.playback_position_now(public.playback_states),
  public.room_lock_key(uuid),
  public.perm_can_add(public.member_role, public.rooms),
  public.perm_can_skip(public.member_role, public.rooms),
  public.perm_can_control(public.member_role, public.rooms),
  public.perm_can_manage(public.member_role, public.rooms)
from public, anon, authenticated;

grant execute on function
  public.consume_rate_limit(text, integer, integer, integer),
  public.reconcile_stale_playback(integer),
  public.prune_ephemeral(integer, integer),
  public.playback_position_now(public.playback_states),
  public.room_lock_key(uuid),
  public.perm_can_add(public.member_role, public.rooms),
  public.perm_can_skip(public.member_role, public.rooms),
  public.perm_can_control(public.member_role, public.rooms),
  public.perm_can_manage(public.member_role, public.rooms)
to service_role;

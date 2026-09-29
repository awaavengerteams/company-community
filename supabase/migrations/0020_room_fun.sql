-- ─────────────────────────────────────────────────────────────────────
-- 0020 · กิจกรรมในห้อง
--
--   1) ขอเพลงถึงเพื่อน   — queue_items.dedicated_to / dedication
--   2) โหวตข้ามเพลง      — skip_votes + toggle_skip_vote
--   3) เกมทายเพลง        — quiz_games / quiz_rounds / quiz_scores
-- ─────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ขอเพลงถึงเพื่อน
-- ═════════════════════════════════════════════════════════════════════

alter table public.queue_items
  add column if not exists dedicated_to uuid references public.profiles(id) on delete set null,
  add column if not exists dedication   text;

alter table public.queue_items
  drop constraint if exists queue_items_dedication_len;
alter table public.queue_items
  add constraint queue_items_dedication_len
  check (dedication is null or char_length(dedication) <= 120);

/**
 * เพิ่มเพลงเข้าคิว (+ ขอถึงใครสักคน)
 *
 * ★ พารามิเตอร์ใหม่มี default ทั้งคู่ ของเดิมที่เรียกด้วย 7 ตัวจึงยังทำงานได้
 *   แต่ ★★ ต้องลบตัว 7 พารามิเตอร์ทิ้งด้วย (อยู่ท้ายไฟล์) ไม่งั้น PostgREST
 *   จะเลือกไม่ถูกว่าจะเรียกตัวไหนแล้วตอบ PGRST203 — บทเรียนจากตอนทำสติกเกอร์
 */
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
   *   ไม่งั้นจะขอเพลงถึง uuid อะไรก็ได้ที่ไม่มีใครในห้องเห็น ซึ่งไม่มีประโยชน์
   *   และเปิดช่องให้เดาว่า uuid ไหนมีตัวตนในระบบ
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
           -- ★★ ห้ามลืมสองบรรทัดนี้ (ดู 0021) — video_id ถูกบังคับโดย
           --    check constraint playback_playing_needs_anchor และเป็นค่าที่
           --    ตัวเล่นใช้จริง ส่วน paused_at ถ้าไม่ล้างจะค้างจากการหยุดครั้งก่อน
           video_id         = v_item.video_id,
           paused_at        = null,
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

-- ★ ลบตัวเก่า 7 พารามิเตอร์ ไม่งั้น PostgREST เลือกไม่ถูก (PGRST203)
drop function if exists public.enqueue_track(uuid, uuid, text, text, text, text, integer);


-- ═════════════════════════════════════════════════════════════════════
-- 2 · โหวตข้ามเพลง
-- ═════════════════════════════════════════════════════════════════════

/**
 * ★★★ ทำไมต้องมี ทั้งที่มีระบบให้สิทธิ์ลัดคิวอยู่แล้ว
 *
 *     ระบบสิทธิ์ตอบคำถาม "ใครมีอำนาจ" ซึ่งถูกต้องสำหรับการควบคุมห้อง
 *     แต่มันแก้ปัญหาที่เกิดจริงบ่อยที่สุดไม่ได้เลย: เจ้าของห้องปิดแท็บไปแล้ว
 *     เพลงที่ไม่มีใครอยากฟังจะค้างอยู่อย่างนั้นจนจบเพลง
 *
 *     ★ การโหวตไม่ใช่การแจกอำนาจเพิ่ม แต่เป็น "เสียงส่วนใหญ่ของคนที่อยู่ตอนนี้"
 *       ซึ่งเป็นคนละเรื่องกับสิทธิ์ และอยู่ร่วมกันได้โดยไม่ขัดกัน
 */
create table if not exists public.skip_votes (
  room_id       uuid not null references public.rooms(id) on delete cascade,
  queue_item_id uuid not null references public.queue_items(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (queue_item_id, user_id)
);

create index if not exists skip_votes_room_idx on public.skip_votes (room_id, queue_item_id);

alter table public.skip_votes enable row level security;

drop policy if exists skip_votes_read on public.skip_votes;
create policy skip_votes_read on public.skip_votes
  for select using (public.is_room_member(room_id));
-- ★ ไม่มี policy เขียน — เขียนผ่าน RPC เท่านั้น

/**
 * กดโหวต / ถอนโหวตข้ามเพลงปัจจุบัน
 *
 * ★★ นับจาก "คนที่ยังอยู่จริง" ไม่ใช่จำนวนสมาชิกทั้งหมด
 *
 *    ห้องที่มีคนเคยเข้ามา 20 คนแต่ตอนนี้เหลือ 3 จะไม่มีวันโหวตผ่าน
 *    ถ้าใช้ตัวหารเป็น 20 ★ เกณฑ์จึงต้องอิงคนที่ last_seen_at ยังสด
 *      ซึ่งเป็นตัวเลขเดียวกับที่หน้าห้องแสดงว่า "N คนกำลังฟัง"
 */
create or replace function public.toggle_skip_vote(
  p_room_id uuid,
  p_actor   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb       public.playback_states;
  v_item     uuid;
  v_existed  boolean;
  v_votes    integer;
  v_live     integer;
  v_needed   integer;
  v_skipped  boolean := false;
  v_owner    uuid;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id;
  if not found or v_pb.queue_item_id is null then
    raise exception 'NOTHING_PLAYING';
  end if;
  v_item := v_pb.queue_item_id;

  delete from public.skip_votes
   where queue_item_id = v_item and user_id = p_actor;
  v_existed := found;

  if not v_existed then
    insert into public.skip_votes (room_id, queue_item_id, user_id)
    values (p_room_id, v_item, p_actor);
  end if;

  select count(*) into v_votes
  from public.skip_votes where queue_item_id = v_item;

  select count(*) into v_live
  from public.room_members
  where room_id = p_room_id and last_seen_at > now() - interval '5 minutes';

  -- เกินครึ่งของคนที่อยู่ตอนนี้ · อย่างน้อยสองเสียงเสมอ
  -- ★ ขั้นต่ำสองเสียงกันไม่ให้คนที่อยู่คนเดียวในห้องกดข้ามผ่านช่องทางนี้
  --   โดยไม่ต้องมีสิทธิ์ ซึ่งจะกลายเป็นประตูหลังของระบบสิทธิ์ทั้งระบบ
  v_needed := greatest(2, (v_live / 2) + 1);

  if v_votes >= v_needed then
    select owner_id into v_owner from public.rooms where id = p_room_id;
    /*
     * ★ เรียก advance_queue ในนามเจ้าของห้อง
     *   ไม่ใช่เพราะเจ้าของสั่ง แต่เพราะ advance_queue ตรวจ "สิทธิ์ของผู้เรียก"
     *   และเสียงโหวตคืออำนาจคนละชุดที่ฟังก์ชันนั้นไม่รู้จัก
     *   ★ advance_queue ไม่ได้บันทึกว่าใครเป็นคนข้าม การยืมชื่อจึงไม่ทิ้งร่องรอย
     *     ที่ผิดความจริงไว้ในฐานข้อมูลเลย
     */
    perform public.advance_queue(p_room_id, v_owner, v_item, 'SKIPPED');
    delete from public.skip_votes where queue_item_id = v_item;
    v_skipped := true;
  end if;

  return jsonb_build_object(
    'voted',   not v_existed and not v_skipped,
    'votes',   case when v_skipped then 0 else v_votes end,
    'needed',  v_needed,
    'skipped', v_skipped
  );
end;
$$;

revoke execute on function public.toggle_skip_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_skip_vote(uuid, uuid) to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · เกมทายเพลง
-- ═════════════════════════════════════════════════════════════════════

/**
 * ★★★ ทำไมเป็น "ทายจากคำใบ้" ไม่ใช่ "เปิดเพลงแล้วปิดชื่อ"
 *
 *     แบบที่สนุกที่สุดคือเปิดเพลงให้ฟังแล้วบังจอไว้ — แต่ทำไม่ได้
 *     ★ ข้อกำหนดของ YouTube ห้ามบดบังตัวเล่น และการเอาแผ่นทึบไปคลุม iframe
 *       ก็คือการบังโฆษณาไปด้วยโดยปริยาย ซึ่งเป็นข้อห้ามตรง ๆ ของโปรเจกต์นี้
 *
 *     ★ คำใบ้ที่ค่อย ๆ เปิดให้ทีละชั้นสร้างความกดดันแบบเดียวกันได้
 *       โดยไม่ต้องแตะตัวเล่นเลยสักนิด และยังเล่นพร้อมกับเพลงที่เปิดอยู่ได้ด้วย
 */

create table if not exists public.quiz_games (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  host_id       uuid not null references public.profiles(id) on delete cascade,
  total_rounds  integer not null,
  round_idx     integer not null default 0,
  status        text not null default 'PLAYING',
  -- ── ข้อมูลของรอบปัจจุบันที่ "เปิดเผยได้" ────────────────────────
  hint_mask     text,
  hint_initials text,
  hint_channel  text,
  hint_duration integer,
  hint_adder    text,
  round_started_at timestamptz,
  round_ends_at    timestamptz,
  -- ── ผลของรอบที่เพิ่งจบ ──────────────────────────────────────────
  last_answer   text,
  last_cover    text,
  last_winner   text,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);

create unique index if not exists quiz_games_one_live_idx
  on public.quiz_games (room_id) where status = 'PLAYING';

/**
 * ★★★ ตารางนี้ไม่มี policy อ่าน และห้ามมี
 *   คอลัมน์ answer_key กับ video_id คือเฉลย การเปิดให้อ่านได้แม้แต่แถวเดียว
 *   แปลว่าเปิด devtools แล้วรู้คำตอบทุกข้อตั้งแต่วินาทีแรก
 *   ★ ทุกอย่างที่ client ต้องเห็นถูกคัดลอกไปไว้ใน quiz_games แล้ว
 */
create table if not exists public.quiz_rounds (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.quiz_games(id) on delete cascade,
  idx           integer not null,
  video_id      text not null,
  title         text not null,
  channel_title text,
  thumbnail_url text,
  answer_key    text not null,
  adder_name    text,
  winner_id     uuid references public.profiles(id) on delete set null,
  unique (game_id, idx)
);

create table if not exists public.quiz_scores (
  game_id  uuid not null references public.quiz_games(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  points   integer not null default 0,
  primary key (game_id, user_id)
);

alter table public.quiz_games  enable row level security;
alter table public.quiz_rounds enable row level security;
alter table public.quiz_scores enable row level security;

drop policy if exists quiz_games_read on public.quiz_games;
create policy quiz_games_read on public.quiz_games
  for select using (public.is_room_member(room_id));

drop policy if exists quiz_scores_read on public.quiz_scores;
create policy quiz_scores_read on public.quiz_scores
  for select using (
    exists (
      select 1 from public.quiz_games g
      where g.id = quiz_scores.game_id and public.is_room_member(g.room_id)
    )
  );

-- quiz_rounds: ไม่มี policy = ปฏิเสธทุกอย่าง ★ ตั้งใจ

/** ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลขทิ้ง เพื่อให้เทียบคำตอบแบบใจกว้าง */
create or replace function public.quiz_norm(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^0-9a-z฀-๿]', '', 'g')
$$;

/**
 * ตัดชื่อเพลงให้เหลือแต่เนื้อ ๆ
 *
 * ★ ชื่อคลิปจริงหน้าตาแบบ "ชื่อเพลง - ศิลปิน [Official MV] (Lyrics)"
 *   ถ้าเทียบกับสตริงเต็ม คนตอบถูกก็ยังตอบผิด เพราะไม่มีใครพิมพ์ว่า Official MV
 */
create or replace function public.quiz_clean_title(p_title text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      regexp_replace(coalesce(p_title, ''), '[\(\[\{].*?[\)\]\}]', ' ', 'g'),
      '(?i)\y(official|audio|lyrics?|video|mv|version|hd|4k|live|teaser|feat|ft)\y',
      ' ', 'g'
    )
  )
$$;

/** ป้ายปิดชื่อเพลง — เก็บช่องว่างไว้ให้เห็นว่ามีกี่คำ */
create or replace function public.quiz_mask(p_title text)
returns text
language sql
immutable
as $$
  select regexp_replace(public.quiz_clean_title(p_title), '[^ ]', '▢', 'g')
$$;

/** ตัวอักษรแรกของแต่ละคำ — คำใบ้ชั้นที่สอง */
create or replace function public.quiz_initials(p_title text)
returns text
language sql
immutable
as $$
  select string_agg(
    left(w, 1) || repeat('▢', greatest(char_length(w) - 1, 0)),
    ' '
  )
  from regexp_split_to_table(public.quiz_clean_title(p_title), '\s+') as w
  where w <> ''
$$;

/** เดินไปรอบถัดไป (หรือจบเกม) — ใช้ร่วมกันทั้งตอนเริ่มและตอนข้ามรอบ */
create or replace function public.quiz_open_round(p_game_id uuid, p_idx integer)
returns public.quiz_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  public.quiz_games;
  v_round public.quiz_rounds;
begin
  select * into v_round from public.quiz_rounds where game_id = p_game_id and idx = p_idx;

  if not found then
    update public.quiz_games
       set status        = 'ENDED',
           ended_at      = now(),
           round_started_at = null,
           round_ends_at    = null,
           hint_mask     = null,
           hint_initials = null
     where id = p_game_id
     returning * into v_game;
    return v_game;
  end if;

  update public.quiz_games
     set round_idx        = p_idx,
         hint_mask        = public.quiz_mask(v_round.title),
         hint_initials    = public.quiz_initials(v_round.title),
         hint_channel     = v_round.channel_title,
         hint_adder       = v_round.adder_name,
         round_started_at = now(),
         round_ends_at    = now() + interval '35 seconds',
         last_answer      = null,
         last_cover       = null,
         last_winner      = null
   where id = p_game_id
   returning * into v_game;

  return v_game;
end;
$$;

/**
 * เริ่มเกม
 *
 * ★ สุ่มจากเพลงที่ "ห้องนี้เคยฟังจริง" เท่านั้น
 *   เกมทายเพลงที่สุ่มจากคลังเพลงทั้งโลกคือเกมที่ไม่มีใครตอบถูก
 *   ส่วนเกมที่สุ่มจากเพลงที่กลุ่มนี้เปิดกันเองคือเกมที่ทุกคนมีสิทธิ์ลุ้น
 */
create or replace function public.quiz_start(
  p_room_id uuid,
  p_actor   uuid,
  p_rounds  integer default 5
)
returns public.quiz_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game    public.quiz_games;
  v_rounds  integer := least(greatest(coalesce(p_rounds, 5), 3), 10);
  v_have    integer;
  v_idx     integer := 0;
  v_row     record;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  -- เกมที่ค้างอยู่ให้จบไปก่อน ★ ไม่งั้น unique index จะเด้ง error ที่อ่านไม่รู้เรื่อง
  update public.quiz_games
     set status = 'ENDED', ended_at = now()
   where room_id = p_room_id and status = 'PLAYING';

  select count(distinct video_id) into v_have
  from public.queue_items
  where room_id = p_room_id and status = 'PLAYED';

  if v_have < 3 then
    raise exception 'NOT_ENOUGH_SONGS';
  end if;
  v_rounds := least(v_rounds, v_have);

  insert into public.quiz_games (room_id, host_id, total_rounds)
  values (p_room_id, p_actor, v_rounds)
  returning * into v_game;

  for v_row in
    select distinct on (q.video_id)
           q.video_id, q.title, q.channel_title, q.thumbnail_url,
           coalesce(p.nickname, p.display_name) as adder_name
    from public.queue_items q
    left join public.profiles p on p.id = q.added_by
    where q.room_id = p_room_id and q.status = 'PLAYED'
    order by q.video_id, q.created_at desc
  loop
    insert into public.quiz_rounds (
      game_id, idx, video_id, title, channel_title, thumbnail_url, answer_key, adder_name
    )
    values (
      v_game.id, v_idx, v_row.video_id, v_row.title, v_row.channel_title, v_row.thumbnail_url,
      public.quiz_norm(public.quiz_clean_title(v_row.title)), v_row.adder_name
    );
    v_idx := v_idx + 1;
  end loop;

  /*
   * ★ สุ่มลำดับหลัง insert ไม่ใช่ตอน select
   *   distinct on ต้อง order by video_id เป็นคอลัมน์แรกเสมอ จะแทรก random()
   *   เข้าไปไม่ได้ — ★ สลับเลขรอบทีหลังจึงเป็นวิธีเดียวที่ทำให้ทั้งสุ่มและไม่ซ้ำ
   */
  with shuffled as (
    select id, row_number() over (order by random()) - 1 as new_idx
    from public.quiz_rounds where game_id = v_game.id
  )
  update public.quiz_rounds r
     set idx = s.new_idx - 1000
    from shuffled s
   where r.id = s.id;
  update public.quiz_rounds set idx = idx + 1000 where game_id = v_game.id;

  delete from public.quiz_rounds where game_id = v_game.id and idx >= v_rounds;

  return public.quiz_open_round(v_game.id, 0);
end;
$$;

/**
 * ส่งคำตอบ
 *
 * ★★★ การตัดสินอยู่ที่นี่ที่เดียว ห้ามย้ายไปฝั่ง client เด็ดขาด
 *     ไม่ใช่เพราะกลัวคนโกง (เล่นกันในกลุ่มเพื่อน) แต่เพราะถ้าฝั่ง client
 *     เป็นคนบอกว่า "ฉันตอบถูก" แล้วยิง API มาขอแต้ม ใครก็ยิงเองได้ตรง ๆ
 *     ★ เฉลยไม่เคยออกจากเซิร์ฟเวอร์จนกว่ารอบจะจบ
 */
create or replace function public.quiz_answer(
  p_room_id uuid,
  p_actor   uuid,
  p_guess   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  public.quiz_games;
  v_round public.quiz_rounds;
  v_guess text := public.quiz_norm(p_guess);
  v_name  text;
begin
  select * into v_game
  from public.quiz_games
  where room_id = p_room_id and status = 'PLAYING'
  limit 1;

  if not found or v_game.round_started_at is null then
    return jsonb_build_object('active', false);
  end if;

  -- หมดเวลาแล้ว ยังไม่มีใครตอบถูก
  if now() > v_game.round_ends_at then
    return jsonb_build_object('active', false);
  end if;

  select * into v_round
  from public.quiz_rounds where game_id = v_game.id and idx = v_game.round_idx;

  if not found or v_round.winner_id is not null then
    return jsonb_build_object('active', false);
  end if;

  -- ★ สั้นเกินไปไม่นับ ไม่งั้นพิมพ์ "ก" รัว ๆ ก็ชนคำตอบได้ในที่สุด
  if char_length(v_guess) < 4 or position(v_guess in v_round.answer_key) = 0 then
    return jsonb_build_object('active', true, 'correct', false);
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  -- อ่านซ้ำหลังถือล็อก ★ กันสองคนตอบถูกพร้อมกันแล้วได้แต้มทั้งคู่
  select * into v_round
  from public.quiz_rounds where game_id = v_game.id and idx = v_game.round_idx for update;
  if v_round.winner_id is not null then
    return jsonb_build_object('active', true, 'correct', false);
  end if;

  update public.quiz_rounds set winner_id = p_actor where id = v_round.id;

  insert into public.quiz_scores (game_id, user_id, points)
  values (v_game.id, p_actor, 1)
  on conflict (game_id, user_id) do update set points = quiz_scores.points + 1;

  select coalesce(nickname, display_name) into v_name from public.profiles where id = p_actor;

  update public.quiz_games
     set last_answer   = public.quiz_clean_title(v_round.title),
         last_cover    = v_round.thumbnail_url,
         last_winner   = v_name,
         round_ends_at = now() + interval '6 seconds'
   where id = v_game.id;

  return jsonb_build_object('active', true, 'correct', true, 'answer', public.quiz_clean_title(v_round.title));
end;
$$;

/** ไปรอบถัดไป — เจ้าของเกมกด หรือใครก็ได้กดเมื่อหมดเวลาแล้ว */
create or replace function public.quiz_next(
  p_room_id uuid,
  p_actor   uuid
)
returns public.quiz_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  public.quiz_games;
  v_round public.quiz_rounds;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_game
  from public.quiz_games where room_id = p_room_id and status = 'PLAYING' limit 1;
  if not found then
    raise exception 'NO_GAME';
  end if;

  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ ระหว่างรอบยังไม่หมดเวลา มีแค่คนเปิดเกมที่ข้ามได้
  --   ไม่งั้นใครกดรัว ๆ ก็ไล่รอบจนจบเกมได้ภายในสองวินาที
  if now() < v_game.round_ends_at and v_game.host_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  -- เฉลยให้ก่อนถ้ายังไม่มีใครตอบถูก
  select * into v_round
  from public.quiz_rounds where game_id = v_game.id and idx = v_game.round_idx;
  if found and v_round.winner_id is null then
    update public.quiz_games
       set last_answer = public.quiz_clean_title(v_round.title),
           last_cover  = v_round.thumbnail_url,
           last_winner = null
     where id = v_game.id;
  end if;

  return public.quiz_open_round(v_game.id, v_game.round_idx + 1);
end;
$$;

/** เลิกเกมกลางคัน */
create or replace function public.quiz_stop(p_room_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.quiz_games
     set status = 'ENDED', ended_at = now(), round_started_at = null, round_ends_at = null
   where room_id = p_room_id
     and status = 'PLAYING'
     and (host_id = p_actor
          or exists (select 1 from public.rooms where id = p_room_id and owner_id = p_actor));
end;
$$;

revoke execute on function public.quiz_start(uuid, uuid, integer)  from public, anon, authenticated;
revoke execute on function public.quiz_answer(uuid, uuid, text)    from public, anon, authenticated;
revoke execute on function public.quiz_next(uuid, uuid)            from public, anon, authenticated;
revoke execute on function public.quiz_stop(uuid, uuid)            from public, anon, authenticated;
revoke execute on function public.quiz_open_round(uuid, integer)   from public, anon, authenticated;
grant execute on function public.quiz_start(uuid, uuid, integer)   to service_role;
grant execute on function public.quiz_answer(uuid, uuid, text)     to service_role;
grant execute on function public.quiz_next(uuid, uuid)             to service_role;
grant execute on function public.quiz_stop(uuid, uuid)             to service_role;
grant execute on function public.quiz_open_round(uuid, integer)    to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- Realtime
-- ═════════════════════════════════════════════════════════════════════

alter table public.skip_votes  replica identity full;
alter table public.quiz_games  replica identity full;
alter table public.quiz_scores replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.skip_votes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quiz_games;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quiz_scores;
  exception when duplicate_object then null;
  end;
end $$;

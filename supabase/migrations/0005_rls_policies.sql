-- ============================================================================
-- 0005 · Row Level Security
-- ============================================================================
-- แนวคิดหลัก: **Client อ่านผ่าน RLS / เขียนผ่าน Route Handler เท่านั้น**
--
-- ทุกตารางเปิด RLS แต่ "ไม่มี policy สำหรับ INSERT / UPDATE / DELETE เลย"
-- ซึ่งใน Postgres แปลว่าปฏิเสธทั้งหมด (default deny)
--
-- ผลลัพธ์: ต่อให้ anon key รั่วออกไปทั้งก้อน หรือเว็บโดน XSS
-- ผู้โจมตีก็ยังแก้ฐานข้อมูลไม่ได้แม้แต่แถวเดียว ทำได้มากสุดคืออ่านข้อมูลของ
-- ห้องที่ตัวเองเป็นสมาชิกอยู่แล้ว
--
-- RLS ที่นี่จึงทำหน้าที่ 2 อย่างพร้อมกัน:
--   1. กรองสิทธิ์การอ่าน
--   2. ★ เป็นตัวกรองของ Supabase Realtime ไปในตัว
--      Realtime บังคับ RLS ต่อ subscriber ทุกคน แปลว่าคนที่ไม่ใช่สมาชิกห้อง
--      จะไม่ได้รับ payload ของห้องนั้นเลย ไม่ต้องเขียน logic กรองเพิ่มฝั่ง client
-- ============================================================================


alter table public.profiles            enable row level security;
alter table public.rooms               enable row level security;
alter table public.room_members        enable row level security;
alter table public.queue_items         enable row level security;
alter table public.playback_states     enable row level security;


-- ---------------------------------------------------------------------------
-- ล้างสิทธิ์ระดับตารางก่อน แล้วค่อยให้เท่าที่จำเป็น
-- ---------------------------------------------------------------------------
-- ★ RLS ทำงานก็ต่อเมื่อ role นั้นมีสิทธิ์ระดับตารางก่อน
--   ถ้าไม่ revoke ไว้ INSERT/UPDATE/DELETE จะ "ถูกอนุญาตระดับตาราง" แล้วไปตกที่
--   RLS อีกชั้น ซึ่งก็ปฏิเสธอยู่ดี — แต่การปิดสองชั้นทำให้ความตั้งใจชัดเจน
--   และกันกรณีที่มีใครเผลอเพิ่ม policy หลวม ๆ ในอนาคต
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.rooms, public.room_members,
              public.queue_items, public.playback_states
  from anon, authenticated;

-- anon = ยังไม่ได้ sign in แม้แต่แบบ anonymous → อ่านอะไรไม่ได้เลย
-- ทุกคนต้องผ่าน supabase.auth.signInAnonymously() ก่อนเสมอ
grant select on public.profiles, public.rooms, public.room_members,
                public.queue_items, public.playback_states
  to authenticated;

-- ผู้ใช้แก้ชื่อเล่น/รูปตัวเองได้โดยตรง ไม่ต้องผ่าน API
-- (เป็นข้อมูลของตัวเอง ไม่กระทบใคร และไม่มีเงื่อนไขสิทธิ์ที่ซับซ้อน)
grant update (display_name, avatar_url) on public.profiles to authenticated;


-- ===========================================================================
-- profiles
-- ===========================================================================

-- เห็น profile ของตัวเอง และของคนที่อยู่ห้องเดียวกัน (ต้องแสดงว่าใครเพิ่มเพลง)
-- ★ ไม่ใช่ทุกคนในระบบ — ไม่มีเหตุผลที่ผู้ใช้ห้อง A ต้องเห็นรายชื่อคนในห้อง B
create policy "profiles: read self or co-member"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.room_members me
    join public.room_members them on them.room_id = me.room_id
    where me.user_id = (select auth.uid())
      and them.user_id = public.profiles.id
  )
);

create policy "profiles: update own"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));


-- ===========================================================================
-- rooms
-- ===========================================================================

-- ★ ไม่มี policy แบบ "ค้นห้องด้วย code ได้" โดยเจตนา
--   การเข้าห้องทำผ่าน POST /api/rooms/[code]/join ที่ใช้ service role
--   ถ้าเปิดให้ client query ด้วย code ได้ จะกลายเป็นช่องให้ยิงเดารหัสห้องรัว ๆ
--   โดยไม่ผ่าน rate limit ของเรา
create policy "rooms: members read"
on public.rooms for select to authenticated
using (public.is_room_member(id));


-- ===========================================================================
-- room_members
-- ===========================================================================

create policy "room_members: members read"
on public.room_members for select to authenticated
using (public.is_room_member(room_id));


-- ===========================================================================
-- queue_items
-- ===========================================================================

-- policy เดียวนี้คุมทั้งการอ่านคิว และการรับ realtime event ของคิว
create policy "queue_items: members read"
on public.queue_items for select to authenticated
using (public.is_room_member(room_id));


-- ===========================================================================
-- playback_states
-- ===========================================================================

create policy "playback_states: members read"
on public.playback_states for select to authenticated
using (public.is_room_member(room_id));


-- ===========================================================================
-- ตรวจสอบตัวเอง: ต้องไม่มี policy ไหนที่เป็น USING (true)
-- ===========================================================================
-- รันตอน migrate เพื่อกันคนเผลอเพิ่ม policy หลวมในอนาคต
-- ถ้ามีเมื่อไหร่ migration จะล้มทันที ไม่ปล่อยผ่านขึ้น production
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ')
  into v_bad
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');

  if v_bad is not null then
    raise exception 'พบ RLS policy ที่เปิดกว้างเกินไป (USING true): %', v_bad;
  end if;
end;
$$;

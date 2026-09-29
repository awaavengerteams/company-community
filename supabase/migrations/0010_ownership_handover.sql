-- ============================================================================
-- 0010 · ยกตำแหน่งเจ้าของห้องเมื่อเจ้าของเดิมหายไปนาน
-- ============================================================================
-- ★ ปัญหาที่แก้ (เจอจากการใช้งานจริง)
--
--   perm_can_skip / perm_can_control ให้สิทธิ์ MEMBER ตาม allow_member_skip
--   และ allow_member_control ซึ่ง **ค่าเริ่มต้นเป็น false ทั้งคู่**
--
--   พอเจ้าของห้องปิดจอไป ห้องที่ยังมีคนฟังอยู่ 4 คนจะค้างทันที —
--   กดหยุดไม่ได้ กดข้ามไม่ได้ เพลงที่เล่นไม่ได้ก็ต้องทนฟังจนจบ
--   ไม่มีทางแก้จากในแอปเลยนอกจากสร้างห้องใหม่ทั้งหมด
--
-- ★★ ทำไมต้องพึ่ง last_seen_at ไม่ใช่ presence
--
--    presence ของ Realtime เป็นข้อมูลฝั่ง client ที่ browser ประกาศเอง
--    server มองไม่เห็นและตรวจสอบไม่ได้ ถ้าเอามาตัดสิน "สิทธิ์"
--    คนที่แก้ payload เป็นก็ประกาศได้ว่าเจ้าของห้องหายไปแล้ว
--
--    last_seen_at อยู่ในฐานข้อมูล เขียนโดย server เท่านั้น จากคำขอที่ผ่าน
--    การยืนยันตัวตนมาแล้ว — จึงเป็นหลักฐานเดียวที่เชื่อถือได้ว่าใครยังอยู่
--
--    ★ คอลัมน์นี้มีมาตั้งแต่ 0002 พร้อมคอมเมนต์ว่าจะใช้ตอนเจ้าของไม่อยู่
--      แต่ไม่เคยมีใครเขียนค่าลงไปเลยนอกจากตอนกดเข้าห้องครั้งแรก
--      ไฟล์นี้จึงทำให้มัน "เดิน" จริงเป็นครั้งแรก
-- ============================================================================


-- ---------------------------------------------------------------------------
-- room_heartbeat — ต่ออายุตัวเอง + โอนตำแหน่งถ้าถึงเวลา
-- ---------------------------------------------------------------------------
-- ★ ทำไมรวมสองเรื่องไว้ในฟังก์ชันเดียว
--
--   ถูกเรียกจาก GET /api/rooms/[code] ซึ่งเป็น request ที่เกิดบ่อยที่สุด
--   (เปิดห้อง · reconnect · กลับมาที่ tab · ตาข่ายกันพลาดทุก 45 วิ)
--   แยกเป็นสอง RPC = เพิ่ม round trip ให้ทุกครั้งที่มีคนเปิดห้องดู
--
--   และสองเรื่องนี้ต้องเกิดตามลำดับในทรานแซกชันเดียวกันด้วย:
--   ต้องต่ออายุตัวเองก่อน ไม่งั้นคนที่กำลังเรียกอยู่จะถูกนับว่า "ไม่อยู่"
--   แล้วกลายเป็นผู้สืบทอดที่ไม่มีสิทธิ์ตามเกณฑ์ของตัวเอง
--
-- คืนค่า: user_id ของเจ้าของห้อง ณ ตอนจบ (อาจเป็นคนเดิมหรือคนใหม่)
-- ---------------------------------------------------------------------------
create or replace function public.room_heartbeat(
  p_room_id            uuid,
  p_actor              uuid,
  -- เจ้าของเงียบเกินเท่านี้ถือว่าออกจากห้องแล้ว
  -- ★ 5 นาที ไม่ใช่ 1 นาที เพราะ heartbeat เดินเฉพาะแท็บที่เปิดดูอยู่
  --   คนที่สลับไปตอบแชทแป๊บหนึ่งต้องไม่เสียตำแหน่ง
  p_owner_away_seconds integer default 300,
  -- ผู้สืบทอดต้องเพิ่งเคลื่อนไหวภายในเท่านี้ (heartbeat เดินทุก 45 วิ)
  p_active_seconds     integer default 150
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room  public.rooms;
  v_owner public.room_members;
  v_next  public.room_members;
begin
  -- ── 1 · ต่ออายุตัวเอง (และยืนยันไปในตัวว่าเป็นสมาชิกจริง) ────────────
  update public.room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = p_actor;

  if not found then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ── 2 · ทางลัด: เจ้าของยังเคลื่อนไหวอยู่ → จบเลย ไม่ต้องแตะ lock ──────
  --    เป็นเส้นทางที่เกิดแทบทุกครั้ง จึงต้องถูกที่สุด
  select * into v_owner
  from public.room_members
  where room_id = p_room_id and role = 'OWNER';

  if found and v_owner.last_seen_at > now() - make_interval(secs => p_owner_away_seconds) then
    return v_owner.user_id;
  end if;

  -- ── 3 · ถึงตรงนี้แปลว่าน่าจะต้องโอน — เข้าคิวก่อน ────────────────────
  -- key เดียวกับทุกฟังก์ชันที่แก้ห้อง (ดู 0004) จึงกันกันเองได้ทุกคู่
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  -- ★ อ่านซ้ำหลังถือ lock เสมอ
  --   ระหว่างที่รอคิว อาจมีคนอื่นโอนไปแล้ว หรือเจ้าของเพิ่งกลับมาพอดี
  --   ถ้าเชื่อค่าที่อ่านก่อน lock จะโอนซ้ำหรือโอนทั้งที่ไม่ควรโอน
  select * into v_owner
  from public.room_members
  where room_id = p_room_id and role = 'OWNER'
  for update;

  if found and v_owner.last_seen_at > now() - make_interval(secs => p_owner_away_seconds) then
    return v_owner.user_id;
  end if;

  -- ── 4 · เลือกผู้สืบทอด ───────────────────────────────────────────────
  -- เกณฑ์: ยังเคลื่อนไหวอยู่ + เข้าห้องก่อนใครเพื่อน
  --
  -- ★ ต้องเป็นเกณฑ์ที่ให้คำตอบเดียวกันเสมอไม่ว่าใครเป็นคนเรียก
  --   จึงตัดสินด้วย user_id เมื่อ joined_at เท่ากัน (เช่นสองคนเข้าพร้อมกัน)
  select * into v_next
  from public.room_members
  where room_id = p_room_id
    and role <> 'OWNER'
    and last_seen_at > now() - make_interval(secs => p_active_seconds)
  order by joined_at asc, user_id asc
  limit 1
  for update;

  if not found then
    -- ห้องร้างจริง ๆ ไม่มีใครรับช่วงต่อ — ปล่อยไว้อย่างนั้น
    -- ★ ไม่ทำให้ห้อง "ไม่มีเจ้าของ" เพราะสถานะนั้นไม่มีใครดูแลคิวได้เลย
    return coalesce(v_owner.user_id, v_room.owner_id);
  end if;

  -- ── 5 · โอน ──────────────────────────────────────────────────────────
  -- ★ ต้องปลดคนเดิมก่อนตั้งคนใหม่
  --   room_members_single_owner_idx (0003) เป็น unique partial index
  --   ที่ตรวจทุกคำสั่ง ไม่ใช่ตอน commit — สลับลำดับแล้วจะชนทันที
  if v_owner.id is not null then
    update public.room_members set role = 'MEMBER' where id = v_owner.id;
  end if;

  update public.room_members set role = 'OWNER' where id = v_next.id;

  -- rooms.owner_id ต้องตามไปด้วย เพราะ UI ใช้ค่านี้ตัดสินว่าใครคือเจ้าของ
  -- และ resolveLeaderId() ฝั่ง client ก็อ่านจากตรงนี้
  update public.rooms set owner_id = v_next.user_id where id = p_room_id;

  return v_next.user_id;
end;
$$;


-- เหตุผลของ grant ชุดนี้อยู่ใน 0004 — ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
-- ผู้เรียกจึง "บอกเองได้ว่าตัวเองเป็นใคร" ปลอดภัยเฉพาะเมื่อผู้เรียกคือ server เรา
revoke execute on function public.room_heartbeat(uuid, uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.room_heartbeat(uuid, uuid, integer, integer)
  to service_role;


-- ---------------------------------------------------------------------------
-- ★★ ให้ทุกคนที่อยู่ในระบบตอนนี้ได้เวลาตั้งหลักหนึ่งรอบ
-- ---------------------------------------------------------------------------
-- ก่อนไฟล์นี้ last_seen_at ถูกเขียนแค่ตอนกดเข้าห้องครั้งแรกเท่านั้น
-- ห้องที่เปิดมาตั้งแต่เมื่อวานจึงมีค่าเก่าค้างอยู่ทั้งห้อง รวมทั้งเจ้าของที่
-- กำลังนั่งฟังอยู่จริง ๆ
--
-- ถ้าไม่รีเซ็ต พอ deploy เสร็จ heartbeat ตัวแรกที่วิ่งเข้ามาจะเห็นว่า
-- "เจ้าของเงียบมา 12 ชั่วโมง" แล้วยึดตำแหน่งไปจากคนที่ยังอยู่ทันที
--
-- ตั้งเป็น now() ทั้งหมดเท่ากับให้เวลาตั้งหลัก 5 นาที ซึ่งนานพอให้แท็บที่
-- เปิดอยู่จริงส่ง heartbeat รอบแรกเข้ามา (เดินทุก 45 วิ)
-- ---------------------------------------------------------------------------
update public.room_members set last_seen_at = now();

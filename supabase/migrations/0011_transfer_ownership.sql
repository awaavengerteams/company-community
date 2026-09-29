-- ============================================================================
-- 0011 · โอนตำแหน่งเจ้าของห้องด้วยมือ
-- ============================================================================
-- 0010 โอนให้อัตโนมัติเมื่อเจ้าของหายไป 5 นาที — ครอบคลุมกรณี "หายไปแล้ว"
-- ไฟล์นี้ครอบคลุมกรณี "กำลังจะไป": เจ้าของเลือกเองว่าจะยกให้ใครก่อนออกจากห้อง
--
-- ★ ทำไมต้องมีทั้งสองแบบ
--
--   อัตโนมัติ = ตาข่ายกันห้องค้าง ทำงานตอนไม่มีใครทันตั้งตัว
--               แต่ต้องรอ 5 นาที และเลือกให้ไม่ได้
--
--   ด้วยมือ   = เจตนาชัดเจน เกิดทันที และเจ้าของเลือกคนที่ไว้ใจได้เอง
--
--   สองอันนี้ใช้เส้นทางเดียวกันตอนเขียนข้อมูล (ปลดคนเดิม → ตั้งคนใหม่ →
--   อัปเดต rooms.owner_id) ต่างกันแค่เงื่อนไขว่าใครมีสิทธิ์สั่ง
-- ============================================================================

create or replace function public.transfer_ownership(
  p_room_id uuid,
  p_actor   uuid,
  p_target  uuid
)
returns public.room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.rooms;
  v_actor  public.room_members;
  v_target public.room_members;
begin
  -- key เดียวกับ room_heartbeat และทุกฟังก์ชันที่แก้ห้อง (ดู 0004)
  -- ★ จำเป็นจริง: ถ้าเจ้าของกดโอนพอดีกับจังหวะที่ heartbeat กำลังโอนอัตโนมัติ
  --   สองทางนี้จะเขียนทับกันจนเหลือ OWNER สองคนหรือศูนย์คน
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_actor
  from public.room_members
  where room_id = p_room_id and user_id = p_actor
  for update;

  -- ★ ตรวจ role จากฐานข้อมูล ไม่ใช่เชื่อว่า caller ตรวจมาแล้ว
  --   (ฟังก์ชันนี้เป็น SECURITY DEFINER — มีอำนาจเต็ม)
  if not found or v_actor.role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  -- โอนให้ตัวเอง = ไม่ต้องทำอะไร ไม่ใช่ความผิดพลาด
  if p_target = p_actor then
    return v_actor;
  end if;

  select * into v_target
  from public.room_members
  where room_id = p_room_id and user_id = p_target   -- ★ ผูก room_id เสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  -- ★ ปลดคนเดิมก่อนตั้งคนใหม่เสมอ
  --   room_members_single_owner_idx (0003) เป็น unique partial index
  --   ที่ตรวจทุกคำสั่ง ไม่ใช่ตอน commit — สลับลำดับแล้วชนทันที
  update public.room_members set role = 'MEMBER' where id = v_actor.id;

  update public.room_members
  set role = 'OWNER',
      -- ★ ต่ออายุให้คนที่เพิ่งรับตำแหน่ง
      --   ไม่งั้นถ้า last_seen_at ของเขาเก่ากว่า 5 นาทีอยู่แล้ว
      --   heartbeat ตัวถัดไปจะโอนต่อทันทีเป็นทอด ๆ
      last_seen_at = now()
  where id = v_target.id
  returning * into v_target;

  update public.rooms set owner_id = p_target where id = p_room_id;

  return v_target;
end;
$$;


-- เหตุผลของ grant ชุดนี้อยู่ใน 0004 — ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
-- ผู้เรียกจึง "บอกเองได้ว่าตัวเองเป็นใคร" ปลอดภัยเฉพาะเมื่อผู้เรียกคือ server เรา
revoke execute on function public.transfer_ownership(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.transfer_ownership(uuid, uuid, uuid)
  to service_role;

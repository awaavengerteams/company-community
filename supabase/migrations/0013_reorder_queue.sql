-- ===========================================================================
-- 0013 · ลากสลับลำดับคิวเพลง
-- ===========================================================================
--
-- ★★ ทำไมต้องเขียน position ใหม่ทั้งคิว ไม่ใช่แค่แถวที่ลาก
--
--    วิธีที่คนทำกันคือแทรกค่ากลาง ๆ (เช่น 5 กับ 6 → 5.5) เพื่อให้แก้แถวเดียว
--    แต่ตารางนี้ position เป็น bigint และมี unique (room_id, position) คุมอยู่
--    ซึ่งจงใจทำไว้ตั้งแต่ 0003 เพื่อให้ลำดับคิว "ไม่มีทางซ้ำได้เลย"
--
--    ★ การเปลี่ยนเป็น numeric เพื่อรองรับค่ากลาง = ยอมให้ลำดับคิวกลายเป็น
--      ทศนิยมที่หารกันไปเรื่อย ๆ และสุดท้ายจะชนขีดความละเอียดของ float
--      หลังลากไปมาไม่กี่ร้อยครั้ง — เขียนใหม่ทั้งคิวแพงกว่านิดเดียว
--      (คิวห้องฟังเพลงมีหลักสิบแถว ไม่ใช่หลักแสน) แต่ถูกต้องตลอดไป
--
-- ★★ ทำไมค่าใหม่ต้องเริ่มจาก max(position) ของทั้งห้อง ไม่ใช่ 1
--
--    unique (room_id, position) ครอบ "ทุกแถวรวมที่เล่นจบไปแล้ว" เพราะ
--    position เป็น monotonic ไม่เคยใช้ซ้ำ (ดูคอมเมนต์ใน 0003)
--
--    ถ้าเขียนทับด้วย 1,2,3 จะไปชนกับเพลงที่เล่นจบไปแล้วซึ่งถือเลขพวกนั้นอยู่
--    ★ เริ่มจาก max+1 ทำให้ค่าใหม่ทุกตัวสูงกว่าทุกแถวที่มีอยู่ — ไม่มีทางชน
--      และคุณสมบัติ "ไม่ใช้เลขซ้ำ" ยังคงอยู่ครบ
--
--    ผลข้างเคียงที่ตั้งใจ: เพลงที่กำลังเล่น (PLAYING) ถือเลขเก่าซึ่งต่ำกว่า
--    ทุกเพลงในคิวเสมอ advance_queue ที่ใช้ order by position asc จึงยังถูกต้อง
--
-- ★ ปัญหา unique violation ระหว่างอัปเดต
--   update ทีละแถวจะชนกันเองกลางทาง (แถวที่ 2 อยากได้เลขของแถวที่ 1)
--   ★ แก้ด้วยการเขียนทุกแถวใน statement เดียวและไปยังช่วงเลขที่ว่างทั้งช่วง
--     — ไม่มีจังหวะไหนเลยที่ค่าใหม่ทับค่าเก่าของแถวอื่น
-- ---------------------------------------------------------------------------

create or replace function public.reorder_queue_item(
  p_room_id  uuid,
  p_actor    uuid,
  p_item_id  uuid,
  -- ย้ายไปต่อ "หลัง" เพลงนี้ · null = ขึ้นไปเป็นเพลงแรกของคิว
  p_after_id uuid default null
)
returns setof public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room  public.rooms;
  v_role  public.member_role;
  v_item  public.queue_items;
  v_ids   uuid[];
  v_old   uuid[];
  v_at    integer;
  v_base  bigint;
begin
  -- ★ บรรทัดแรกเสมอ เหมือน RPC ตัวอื่นที่แตะคิว
  --   สองคนลากพร้อมกันจะถูกจัดคิวให้ทำทีละคน แล้วคนที่สองจะเห็นผลของคนแรก
  --   ก่อนคำนวณลำดับของตัวเอง — ไม่ใช่คำนวณจากภาพเก่าแล้วเขียนทับ
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  -- ★ ใช้เกณฑ์เดียวกับการเพิ่มเพลง
  --   การจัดลำดับคิวเป็นการกระทำระดับเดียวกับการเพิ่มเพลง ไม่ใช่ระดับเจ้าของห้อง
  --   และเกณฑ์นี้เคารพ is_locked ให้ด้วย — ห้องที่ปิดรับเพลงย่อมไม่ควรสลับคิวได้
  if v_role is null or not public.perm_can_add(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_item
  from public.queue_items
  where id = p_item_id and room_id = p_room_id   -- ★ ผูก room_id เสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  -- ★ ย้ายได้เฉพาะเพลงที่ยังไม่ได้เล่น
  --   เพลงที่กำลังเล่นอยู่ไม่ใช่ "ลำดับในคิว" แต่เป็นสถานะของห้อง ณ ตอนนี้
  --   การลากมันไปไว้กลางคิวไม่มีความหมายที่แปลเป็นการกระทำได้
  if v_item.status <> 'WAITING' then
    raise exception 'FORBIDDEN';
  end if;

  if p_after_id = p_item_id then
    raise exception 'VALIDATION_FAILED: cannot place an item after itself';
  end if;

  select array_agg(id order by position) into v_ids
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING';

  v_old := v_ids;
  v_ids := array_remove(v_ids, p_item_id);

  if p_after_id is null then
    v_at := 1;
  else
    v_at := array_position(v_ids, p_after_id);
    if v_at is null then
      -- หมุดที่อ้างถึงถูกลบ/เล่นไปแล้วระหว่างที่ผู้ใช้ลากอยู่
      raise exception 'QUEUE_ITEM_NOT_FOUND';
    end if;
    v_at := v_at + 1;
  end if;

  v_ids := v_ids[1:v_at - 1] || p_item_id || v_ids[v_at:];

  -- ★ ลำดับไม่เปลี่ยน → ไม่ต้องเขียนอะไรเลย
  --   ปล่อยให้เขียนทับจะยิง realtime ให้ทุกเครื่องโดยไม่มีอะไรต่างกัน
  --   ซึ่งเกิดบ่อยมากเพราะการ "ลากแล้ววางที่เดิม" คือความผิดพลาดปกติของนิ้ว
  if v_ids = v_old then
    return query
      select * from public.queue_items
      where room_id = p_room_id and status = 'WAITING'
      order by position;
    return;
  end if;

  select coalesce(max(position), 0) into v_base
  from public.queue_items
  where room_id = p_room_id;

  update public.queue_items q
  -- updated_at มี trigger touch_updated_at ตั้งให้อยู่แล้ว (0002) ไม่ต้องเขียนเอง
  set position = v_base + t.rn
  from (
    select id, ordinality as rn
    from unnest(v_ids) with ordinality as u(id, ordinality)
  ) t
  where q.id = t.id and q.room_id = p_room_id;

  return query
    select * from public.queue_items
    where room_id = p_room_id and status = 'WAITING'
    order by position;
end;
$$;

-- ★ เหตุผลเดียวกับ RPC ตัวอื่น: ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
--   ถ้าไม่ revoke คนที่ถือ anon key จะเรียกโดยใส่ user id ของคนอื่นได้
revoke execute on function public.reorder_queue_item(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reorder_queue_item(uuid, uuid, uuid, uuid)
  to service_role;

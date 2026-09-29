-- ─────────────────────────────────────────────────────────────────────
-- 0019 · หน้าตาตัวละครในลอบบี้
--
-- ★★ ทำไมเก็บใน DB ไม่ใช่ localStorage ทั้งที่ presence ส่งให้กันอยู่แล้ว
--
--    ลอบบี้ส่งหน้าตาไปกับ presence อยู่แล้ว คนอื่นจึงเห็นถูกต้องโดยไม่ต้อง
--    แตะฐานข้อมูลเลย — ถ้ามองแค่นั้น localStorage ก็พอ
--
--    ★ แต่ผู้ใช้เคยบอกชัดว่าไม่อยากตั้งค่าตัวตนใหม่ทุกครั้งที่เปิดเครื่อง
--      หน้าตาที่แต่งไว้คือตัวตน ไม่ใช่การตั้งค่าของเครื่อง จึงต้องตามคนไป
--      ไม่ใช่ตามเบราว์เซอร์
--
-- ★★ ทำไม jsonb ไม่ใช่คอลัมน์ละอย่าง
--
--    ชุดตัวเลือก (ทรงผม เสื้อ กางเกง แว่น) จะเพิ่มขึ้นแน่นอน
--    ★ ถ้าแยกคอลัมน์ การเพิ่มตัวเลือกใหม่ = migration ใหม่ทุกครั้ง
--      ในขณะที่ค่าพวกนี้ไม่เคยถูก query แบบมีเงื่อนไขเลยสักครั้ง
--      มันถูกอ่านทั้งก้อนแล้วส่งให้ client วาดอย่างเดียว
-- ─────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists appearance jsonb;

/*
 * ★ ไม่ตั้ง default และไม่ backfill โดยตั้งใจ
 *   null แปลว่า "ยังไม่เคยแต่งตัว" ซึ่ง client จะสุ่มหน้าตาประจำตัวจาก id ให้
 *   ทำให้คนที่ไม่เคยเข้าหน้าแต่งตัวก็ยังมีหน้าตาไม่ซ้ำใคร และแยกออกได้ว่า
 *   หน้าตานี้ "เลือกเอง" หรือ "ระบบแจกให้"
 */

/**
 * บันทึกหน้าตา
 *
 * ★ เขียนผ่านฟังก์ชันไม่ใช่ update ตรง เพราะ profiles ไม่มี write policy
 *   (ค่าเริ่มต้นคือปฏิเสธทุกอย่าง) และเราไม่อยากเปิด policy ให้ client
 *   เขียนคอลัมน์อื่นของตัวเองได้ไปด้วย เช่น username
 */
create or replace function public.set_appearance(
  p_actor uuid,
  p_appearance jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor is null then
    raise exception 'actor required';
  end if;

  -- ★ กันคนยัด json ก้อนใหญ่เข้ามาเก็บฟรี
  if pg_column_size(p_appearance) > 500 then
    raise exception 'appearance too large';
  end if;

  update public.profiles
     set appearance = p_appearance
   where id = p_actor;
end;
$$;

revoke execute on function public.set_appearance(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_appearance(uuid, jsonb) to service_role;

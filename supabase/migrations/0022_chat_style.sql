-- ─────────────────────────────────────────────────────────────────────
-- 0022 · ธีมแชท + พื้นหลังแชท
-- ─────────────────────────────────────────────────────────────────────
--
-- ★★ ทำไมเก็บที่ "ห้อง" ไม่ใช่ที่ "คน"
--
--    แบบของ Messenger คือธีมเป็นของบทสนทนา ทุกคนในห้องเห็นเหมือนกัน
--    ซึ่งดูเหมือนแปลกตอนแรก — ทำไมคนอื่นมาเปลี่ยนสีจอเราได้
--
--    ★ แต่นั่นคือเหตุผลที่มันสนุก: การเปลี่ยนธีมกลายเป็นการกระทำร่วมกัน
--      ที่ทุกคนเห็นพร้อมกัน ไม่ใช่การตั้งค่าส่วนตัวที่ไม่มีใครรู้
--      ถ้าเป็นของใครของมัน มันจะเป็นแค่ preference ที่ไม่มีใครเปลี่ยน
--
-- ★★ ทำไมเก็บ "ชื่อธีม" ไม่ใช่ค่าสี
--
--    เก็บ '#00b900' ไว้แปลว่าวันที่เราปรับจานสีให้สวยขึ้น ห้องที่ตั้งไว้แล้ว
--    จะค้างอยู่กับสีเก่าตลอดไป และเราจะแก้โทนสว่าง/มืดให้เข้ากันไม่ได้เลย
--    ★ เก็บชื่อแล้วตีความตอนวาด — เหมือนที่ทำกับหน้าตาตัวละครในลอบบี้ (0019)
-- ─────────────────────────────────────────────────────────────────────

alter table public.rooms
  add column if not exists chat_theme         text,
  add column if not exists chat_wallpaper     text,
  add column if not exists chat_wallpaper_url text;

/*
 * ★★ รูปพื้นหลังที่อัปเอง เก็บคนละคอลัมน์กับลายสำเร็จ
 *
 *    ยัดรวมคอลัมน์เดียวแล้วดูจากว่า "ขึ้นต้นด้วย https ไหม" ก็ทำได้
 *    แต่ทำให้ข้อจำกัดความยาว 24 ตัวอักษรของลายสำเร็จใช้ไม่ได้อีกต่อไป
 *    ★ แยกคอลัมน์แล้วแต่ละอันมีกฎของตัวเองที่ฐานข้อมูลบังคับได้จริง
 *      และสลับกลับไปใช้ลายสำเร็จได้โดยไม่ต้องลบรูปที่อัปไว้
 */
alter table public.rooms drop constraint if exists rooms_chat_wallpaper_https;
alter table public.rooms
  add constraint rooms_chat_wallpaper_https
  check (chat_wallpaper_url is null or chat_wallpaper_url ~ '^https://');

alter table public.rooms drop constraint if exists rooms_chat_theme_len;
alter table public.rooms
  add constraint rooms_chat_theme_len
  check (chat_theme is null or char_length(chat_theme) <= 24);

alter table public.rooms drop constraint if exists rooms_chat_wallpaper_len;
alter table public.rooms
  add constraint rooms_chat_wallpaper_len
  check (chat_wallpaper is null or char_length(chat_wallpaper) <= 24);

/**
 * ตั้งธีม/พื้นหลังของห้อง
 *
 * ★ ใครก็ตามที่อยู่ในห้องเปลี่ยนได้ ไม่ต้องเป็นเจ้าของห้อง
 *   ตรงตามนโยบายของ 0012 — สิ่งที่ "แก้กลับได้ทันที" ไม่ต้องหวงสิทธิ์
 *   (ต่างจากการข้ามเพลงที่ทำลายสิ่งที่ทุกคนกำลังฟังอยู่แล้วกู้ไม่ได้)
 */
create or replace function public.set_chat_style(
  p_room_id       uuid,
  p_actor         uuid,
  p_theme         text,
  p_wallpaper     text,
  p_wallpaper_url text default null
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.rooms
     set chat_theme         = nullif(left(coalesce(p_theme, ''), 24), ''),
         chat_wallpaper     = nullif(left(coalesce(p_wallpaper, ''), 24), ''),
         chat_wallpaper_url = nullif(btrim(coalesce(p_wallpaper_url, '')), '')
   where id = p_room_id
   returning * into v_room;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  return v_room;
end;
$$;

revoke execute on function public.set_chat_style(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_chat_style(uuid, uuid, text, text, text) to service_role;

-- ★ ลบตัวเก่า 4 พารามิเตอร์ถ้าเคยรันไปแล้ว ไม่งั้น PostgREST เลือกไม่ถูก (PGRST203)
--   บทเรียนเดียวกับตอนเพิ่มพารามิเตอร์ให้ enqueue_track
drop function if exists public.set_chat_style(uuid, uuid, text, text);

-- ★ rooms อยู่ใน publication อยู่แล้วตั้งแต่ 0006 — การเปลี่ยนธีมจึงเด้งถึง
--   ทุกเครื่องผ่านเส้นทางเดียวกับการเปลี่ยนชื่อห้อง ไม่ต้องต่อท่อใหม่

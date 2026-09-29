-- ============================================================================
--  ★★ ลบทุกอย่างของ Music Room ทิ้ง — ใช้เฉพาะตอนต้องการติดตั้งใหม่ ★★
-- ============================================================================
--  ลบข้อมูลห้อง/คิว/ผู้ใช้ทั้งหมดอย่างถาวร ไม่มีทางกู้คืน
--  รันเฉพาะบน project ที่ไม่มีข้อมูลสำคัญเท่านั้น
-- ============================================================================
begin;

drop table if exists public.rate_limits           cascade;
drop table if exists public.youtube_videos        cascade;
drop table if exists public.youtube_search_cache  cascade;
drop table if exists public.playback_states       cascade;
drop table if exists public.queue_items           cascade;
drop table if exists public.room_members          cascade;
drop table if exists public.rooms                 cascade;
drop table if exists public.profiles              cascade;

drop type if exists public.queue_status cascade;
drop type if exists public.member_role  cascade;

drop function if exists public.handle_new_user()    cascade;
drop function if exists public.touch_updated_at()   cascade;

delete from supabase_migrations.schema_migrations where version like '000%';

commit;

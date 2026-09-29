#!/usr/bin/env bash
# ============================================================================
# ชุดทดสอบฐานข้อมูล — พิสูจน์ว่า race condition ถูกจัดการจริง
# ============================================================================
#
# ใช้งาน:
#   ./scripts/db-test.sh                       # ยิงไปที่ Supabase local
#   DB_URL="postgresql://..." ./scripts/db-test.sh   # ยิงไปที่ instance อื่น
#
# ★ ทดสอบด้วย psql หลาย process ขนานกันจริง ไม่ใช่ loop ในทรานแซกชันเดียว
#   เพราะ race condition เกิดจากการที่ "หลาย connection" แย่งกันเขียน
#   การทดสอบใน transaction เดียวจะผ่านเสมอแม้โค้ดจะผิด
# ============================================================================
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CONCURRENCY="${CONCURRENCY:-8}"

psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }
psql_run() { psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if ! psql_q -c 'select 1' >/dev/null 2>&1; then
  echo "เชื่อมต่อฐานข้อมูลไม่ได้: $DB_URL"
  echo "ถ้าใช้ local ให้รัน 'npx supabase start' ก่อน"
  exit 1
fi

# ---------------------------------------------------------------------------
section "0 · เตรียมข้อมูลทดสอบ"
# ---------------------------------------------------------------------------
psql_run <<'SQL'
begin;

-- ล้างของเก่า (cascade ลง room_members / queue_items / playback_states)
delete from auth.users where raw_user_meta_data ->> 'test_tag' = 'db-test';

-- สร้างผู้ใช้ 4 คน — trigger handle_new_user จะสร้าง profiles ให้เอง
insert into auth.users (
  id, instance_id, aud, role, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  ('00000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', now(), now(),
  '{}'::jsonb,
  jsonb_build_object('test_tag', 'db-test', 'display_name', 'Tester ' || n)
from generate_series(1, 4) as n;

commit;
SQL

OWNER='00000000-0000-4000-8000-000000000001'
MEMBER='00000000-0000-4000-8000-000000000002'
GUEST='00000000-0000-4000-8000-000000000003'
OUTSIDER='00000000-0000-4000-8000-000000000004'

PROFILE_COUNT=$(psql_q -c "select count(*) from public.profiles where id::text like '00000000-0000-4000-8000-%'")
[ "$PROFILE_COUNT" = "4" ] \
  && pass "trigger สร้าง profiles ครบ 4 แถวอัตโนมัติ" \
  || fail "trigger ไม่ได้สร้าง profiles (ได้ $PROFILE_COUNT แถว)"

ROOM_CODE=$(psql_q -c "select (public.create_room('$OWNER'::uuid, 'Race Test')).code")
ROOM_ID=$(psql_q -c "select id from public.rooms where code = '$ROOM_CODE'")

[ -n "$ROOM_ID" ] && pass "สร้างห้อง $ROOM_CODE" || fail "สร้างห้องไม่สำเร็จ"

psql_q -c "select public.join_room('$ROOM_CODE', '$MEMBER'::uuid)" >/dev/null
psql_q -c "select public.join_room('$ROOM_CODE', '$GUEST'::uuid)" >/dev/null
psql_q -c "update public.room_members set role = 'GUEST' where room_id = '$ROOM_ID' and user_id = '$GUEST'" >/dev/null

PB_EXISTS=$(psql_q -c "select count(*) from public.playback_states where room_id = '$ROOM_ID'")
[ "$PB_EXISTS" = "1" ] \
  && pass "playback_states ถูกสร้างพร้อมห้อง" \
  || fail "ไม่มีแถว playback_states"

OWNER_ROLE=$(psql_q -c "select role from public.room_members where room_id='$ROOM_ID' and user_id='$OWNER'")
psql_q -c "select public.join_room('$ROOM_CODE', '$OWNER'::uuid)" >/dev/null
OWNER_ROLE_AFTER=$(psql_q -c "select role from public.room_members where room_id='$ROOM_ID' and user_id='$OWNER'")
[ "$OWNER_ROLE" = "OWNER" ] && [ "$OWNER_ROLE_AFTER" = "OWNER" ] \
  && pass "join ซ้ำไม่ลดสิทธิ์ OWNER (idempotent)" \
  || fail "join ซ้ำทำให้ role เปลี่ยนจาก $OWNER_ROLE เป็น $OWNER_ROLE_AFTER"


# ---------------------------------------------------------------------------
section "1 · Race: $CONCURRENCY คนกด Add พร้อมกัน"
# ---------------------------------------------------------------------------
# แต่ละ process เป็น connection แยก → แย่ง advisory lock กันจริง
for i in $(seq 1 "$CONCURRENCY"); do
  VID=$(printf 'TESTvideo%02d' "$i")
  psql "$DB_URL" -X -q -t -A -c \
    "select public.enqueue_track('$ROOM_ID'::uuid, '$MEMBER'::uuid, '$VID',
                                 'Track $i', 'Test Channel', NULL, 200)" \
    >/dev/null 2>&1 &
done
wait

ADDED=$(psql_q -c "select count(*) from public.queue_items where room_id = '$ROOM_ID'")
[ "$ADDED" = "$CONCURRENCY" ] \
  && pass "เพิ่มครบ $CONCURRENCY เพลง ไม่มีตัวไหนหาย" \
  || fail "คาดว่า $CONCURRENCY เพลง แต่ได้ $ADDED"

DUP_POS=$(psql_q -c "
  select count(*) from (
    select position from public.queue_items
    where room_id = '$ROOM_ID'
    group by position having count(*) > 1
  ) d")
[ "$DUP_POS" = "0" ] \
  && pass "★ ไม่มี position ซ้ำเลย (advisory lock ทำงาน)" \
  || fail "พบ position ซ้ำ $DUP_POS ค่า — race condition ยังอยู่"

CONTIGUOUS=$(psql_q -c "
  select case when min(position) = 1 and max(position) = count(*) then 'yes' else 'no' end
  from public.queue_items where room_id = '$ROOM_ID'")
[ "$CONTIGUOUS" = "yes" ] \
  && pass "position เรียง 1..$CONCURRENCY ต่อเนื่อง ไม่มีช่องว่าง" \
  || fail "position ไม่ต่อเนื่อง"

PLAYING=$(psql_q -c "select count(*) from public.queue_items where room_id='$ROOM_ID' and status='PLAYING'")
[ "$PLAYING" = "1" ] \
  && pass "★ มีเพลง PLAYING เพียง 1 เพลง (เพลงแรกเริ่มเล่นอัตโนมัติ)" \
  || fail "มีเพลง PLAYING $PLAYING เพลง ต้องเป็น 1"

PB_SYNCED=$(psql_q -c "
  select case when pb.queue_item_id = qi.id and pb.is_playing and pb.started_at is not null
              then 'yes' else 'no' end
  from public.playback_states pb
  join public.queue_items qi on qi.room_id = pb.room_id and qi.status = 'PLAYING'
  where pb.room_id = '$ROOM_ID'")
[ "$PB_SYNCED" = "yes" ] \
  && pass "playback_states ชี้ไปที่เพลงที่ PLAYING และมี anchor เวลา" \
  || fail "playback_states ไม่ตรงกับเพลงที่กำลังเล่น"


# ---------------------------------------------------------------------------
section "2 · เพลงซ้ำ / คิวเต็ม / ห้องล็อก"
# ---------------------------------------------------------------------------
DUP_ERR=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.enqueue_track('$ROOM_ID'::uuid, '$MEMBER'::uuid, 'TESTvideo03',
                               'Dup', 'Ch', NULL, 200)" 2>&1 || true)
echo "$DUP_ERR" | grep -q 'DUPLICATE_IN_QUEUE' \
  && pass "เพิ่มเพลงที่อยู่ในคิวแล้ว → DUPLICATE_IN_QUEUE" \
  || fail "ไม่ได้ error DUPLICATE_IN_QUEUE (ได้: $DUP_ERR)"

psql_q -c "update public.rooms set is_locked = true where id = '$ROOM_ID'" >/dev/null
LOCK_ERR=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.enqueue_track('$ROOM_ID'::uuid, '$MEMBER'::uuid, 'TESTvideoAA',
                               'Locked', 'Ch', NULL, 200)" 2>&1 || true)
echo "$LOCK_ERR" | grep -q 'QUEUE_LOCKED' \
  && pass "ห้องล็อกอยู่ → QUEUE_LOCKED" \
  || fail "ไม่ได้ error QUEUE_LOCKED (ได้: $LOCK_ERR)"
psql_q -c "update public.rooms set is_locked = false where id = '$ROOM_ID'" >/dev/null

OUT_ERR=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.enqueue_track('$ROOM_ID'::uuid, '$OUTSIDER'::uuid, 'TESTvideoBB',
                               'Outsider', 'Ch', NULL, 200)" 2>&1 || true)
echo "$OUT_ERR" | grep -q 'FORBIDDEN' \
  && pass "คนนอกห้องเพิ่มเพลง → FORBIDDEN" \
  || fail "คนนอกห้องเพิ่มเพลงได้! (ได้: $OUT_ERR)"

psql_q -c "update public.rooms set allow_guest_add = false where id = '$ROOM_ID'" >/dev/null
GUEST_ERR=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.enqueue_track('$ROOM_ID'::uuid, '$GUEST'::uuid, 'TESTvideoCC',
                               'Guest', 'Ch', NULL, 200)" 2>&1 || true)
echo "$GUEST_ERR" | grep -q 'FORBIDDEN' \
  && pass "GUEST เพิ่มเพลงตอน allow_guest_add=false → FORBIDDEN" \
  || fail "GUEST เพิ่มเพลงได้ทั้งที่ปิดไว้"
psql_q -c "update public.rooms set allow_guest_add = true where id = '$ROOM_ID'" >/dev/null


# ---------------------------------------------------------------------------
section "3 · ★ Race: $CONCURRENCY คนรายงานเพลงจบพร้อมกัน"
# ---------------------------------------------------------------------------
# จำลองว่าเพลงเล่นจบแล้วจริง ๆ (ดัน anchor ย้อนหลังไปเกินความยาวเพลง)
psql_q -c "
  update public.playback_states
  set started_at = now() - interval '210 seconds'
  where room_id = '$ROOM_ID'" >/dev/null

CURRENT_ID=$(psql_q -c "select queue_item_id from public.playback_states where room_id='$ROOM_ID'")
VERSION_BEFORE=$(psql_q -c "select version from public.playback_states where room_id='$ROOM_ID'")

# ทุก process ส่ง expected id เดียวกัน = สถานการณ์จริงเป๊ะ ๆ
for _ in $(seq 1 "$CONCURRENCY"); do
  psql "$DB_URL" -X -q -t -A -c \
    "select public.advance_queue('$ROOM_ID'::uuid, '$MEMBER'::uuid,
                                 '$CURRENT_ID'::uuid, 'ENDED')" \
    >/dev/null 2>&1 &
done
wait

VERSION_AFTER=$(psql_q -c "select version from public.playback_states where room_id='$ROOM_ID'")
VERSION_DIFF=$((VERSION_AFTER - VERSION_BEFORE))
[ "$VERSION_DIFF" = "1" ] \
  && pass "★ version เพิ่มขึ้นแค่ 1 — เปลี่ยนเพลงครั้งเดียวจาก $CONCURRENCY request (CAS ทำงาน)" \
  || fail "version เพิ่มขึ้น $VERSION_DIFF ครั้ง — เพลงถูกข้ามซ้ำซ้อน"

PLAYED=$(psql_q -c "select count(*) from public.queue_items where room_id='$ROOM_ID' and status='PLAYED'")
[ "$PLAYED" = "1" ] \
  && pass "เพลงที่จบถูกทำเครื่องหมาย PLAYED เพียงเพลงเดียว" \
  || fail "มีเพลง PLAYED $PLAYED เพลง ต้องเป็น 1"

STILL_ONE=$(psql_q -c "select count(*) from public.queue_items where room_id='$ROOM_ID' and status='PLAYING'")
[ "$STILL_ONE" = "1" ] \
  && pass "ยังมีเพลง PLAYING เพียง 1 เพลง" \
  || fail "มีเพลง PLAYING $STILL_ONE เพลง"

NOW_POS=$(psql_q -c "
  select qi.position from public.queue_items qi
  join public.playback_states pb on pb.queue_item_id = qi.id
  where pb.room_id = '$ROOM_ID'")
[ "$NOW_POS" = "2" ] \
  && pass "เล่นต่อที่เพลง position 2 — ข้ามไปแค่เพลงเดียว ไม่กระโดด" \
  || fail "กระโดดไปที่ position $NOW_POS (ควรเป็น 2)"


# ---------------------------------------------------------------------------
section "4 · ด่านกันการยิง /next เพื่อข้ามเพลงคนอื่น"
# ---------------------------------------------------------------------------
CURRENT_ID=$(psql_q -c "select queue_item_id from public.playback_states where room_id='$ROOM_ID'")
EARLY_ERR=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.advance_queue('$ROOM_ID'::uuid, '$MEMBER'::uuid,
                               '$CURRENT_ID'::uuid, 'ENDED')" 2>&1 || true)
echo "$EARLY_ERR" | grep -q 'PREMATURE_END' \
  && pass "★ รายงานเพลงจบทั้งที่เพิ่งเริ่มเล่น → PREMATURE_END" \
  || fail "ยิง ENDED ก่อนเวลาได้! (ได้: $EARLY_ERR)"

STALE_RESULT=$(psql_q -c "
  select version from public.advance_queue('$ROOM_ID'::uuid, '$MEMBER'::uuid,
    '00000000-0000-4000-8000-0000000000ff'::uuid, 'ENDED')")
VERSION_NOW=$(psql_q -c "select version from public.playback_states where room_id='$ROOM_ID'")
[ "$STALE_RESULT" = "$VERSION_NOW" ] \
  && pass "ส่ง expected id ที่ล้าสมัย → no-op คืน state ปัจจุบัน ไม่ error" \
  || fail "CAS ที่ไม่ตรงไม่ได้คืน state ปัจจุบัน"

GUEST_SKIP=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.advance_queue('$ROOM_ID'::uuid, '$GUEST'::uuid,
                               '$CURRENT_ID'::uuid, 'SKIPPED')" 2>&1 || true)
echo "$GUEST_SKIP" | grep -q 'FORBIDDEN' \
  && pass "GUEST กด Skip → FORBIDDEN" \
  || fail "GUEST ข้ามเพลงได้!"

MEMBER_SKIP=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.advance_queue('$ROOM_ID'::uuid, '$MEMBER'::uuid,
                               '$CURRENT_ID'::uuid, 'SKIPPED')" 2>&1 || true)
echo "$MEMBER_SKIP" | grep -q 'FORBIDDEN' \
  && pass "MEMBER กด Skip ตอน allow_member_skip=false → FORBIDDEN" \
  || fail "MEMBER ข้ามเพลงได้ทั้งที่ปิดไว้"

psql_q -c "select public.advance_queue('$ROOM_ID'::uuid, '$OWNER'::uuid, '$CURRENT_ID'::uuid, 'SKIPPED')" >/dev/null
SKIPPED=$(psql_q -c "select count(*) from public.queue_items where room_id='$ROOM_ID' and status='SKIPPED'")
[ "$SKIPPED" = "1" ] \
  && pass "OWNER กด Skip ได้ เพลงถูกทำเครื่องหมาย SKIPPED" \
  || fail "OWNER กด Skip ไม่ได้"


# ---------------------------------------------------------------------------
section "5 · Playback: pause / resume / seek"
# ---------------------------------------------------------------------------
psql_q -c "
  update public.playback_states
  set started_at = now() - interval '30 seconds'
  where room_id = '$ROOM_ID'" >/dev/null

psql_q -c "select public.set_playback('$ROOM_ID'::uuid, '$OWNER'::uuid, 'PAUSE')" >/dev/null
PAUSED_POS=$(psql_q -c "select current_position from public.playback_states where room_id='$ROOM_ID'")
[ "$PAUSED_POS" -ge 29 ] && [ "$PAUSED_POS" -le 31 ] \
  && pass "Pause freeze ตำแหน่งไว้ที่ ~30 วินาที (ได้ $PAUSED_POS)" \
  || fail "Pause เก็บตำแหน่งผิด: $PAUSED_POS"

psql_q -c "select public.set_playback('$ROOM_ID'::uuid, '$OWNER'::uuid, 'PLAY')" >/dev/null
RESUMED=$(psql_q -c "
  select case when is_playing and current_position = $PAUSED_POS
                   and started_at > now() - interval '5 seconds'
              then 'yes' else 'no' end
  from public.playback_states where room_id='$ROOM_ID'")
[ "$RESUMED" = "yes" ] \
  && pass "Resume ตั้ง anchor ใหม่โดยไม่ทิ้งตำแหน่งเดิม" \
  || fail "Resume คำนวณผิด"

psql_q -c "select public.set_playback('$ROOM_ID'::uuid, '$OWNER'::uuid, 'SEEK', 999999)" >/dev/null
CLAMPED=$(psql_q -c "select current_position from public.playback_states where room_id='$ROOM_ID'")
[ "$CLAMPED" = "200" ] \
  && pass "Seek เกินความยาวเพลงถูก clamp ไว้ที่ 200 วินาที" \
  || fail "Seek ไม่ถูก clamp (ได้ $CLAMPED)"

CTRL_ERR=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.set_playback('$ROOM_ID'::uuid, '$MEMBER'::uuid, 'PAUSE')" 2>&1 || true)
echo "$CTRL_ERR" | grep -q 'FORBIDDEN' \
  && pass "MEMBER คุม playback ไม่ได้ (allow_member_control=false)" \
  || fail "MEMBER คุม playback ได้ทั้งที่ปิดไว้"


# ---------------------------------------------------------------------------
section "6 · ลบเพลง"
# ---------------------------------------------------------------------------
WAITING_ID=$(psql_q -c "
  select id from public.queue_items
  where room_id='$ROOM_ID' and status='WAITING' order by position limit 1")

OTHER_DEL=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.remove_queue_item('$ROOM_ID'::uuid, '$GUEST'::uuid, '$WAITING_ID'::uuid)" 2>&1 || true)
echo "$OTHER_DEL" | grep -q 'FORBIDDEN' \
  && pass "ลบเพลงที่คนอื่นเพิ่ม → FORBIDDEN" \
  || fail "ลบเพลงของคนอื่นได้!"

psql_q -c "select public.remove_queue_item('$ROOM_ID'::uuid, '$MEMBER'::uuid, '$WAITING_ID'::uuid)" >/dev/null
REMOVED=$(psql_q -c "select status from public.queue_items where id='$WAITING_ID'")
[ "$REMOVED" = "REMOVED" ] \
  && pass "ผู้เพิ่มลบเพลงตัวเองได้ (soft delete)" \
  || fail "ลบเพลงตัวเองไม่ได้"

CUR_ID=$(psql_q -c "select queue_item_id from public.playback_states where room_id='$ROOM_ID'")
DEL_PLAYING=$(psql "$DB_URL" -X -q -t -A -c \
  "select public.remove_queue_item('$ROOM_ID'::uuid, '$OWNER'::uuid, '$CUR_ID'::uuid)" 2>&1 || true)
echo "$DEL_PLAYING" | grep -q 'FORBIDDEN' \
  && pass "ลบเพลงที่กำลังเล่นอยู่ไม่ได้ (ต้องใช้ Skip)" \
  || fail "ลบเพลงที่กำลังเล่นได้!"


# ---------------------------------------------------------------------------
section "7 · ★ RLS — ผู้ใช้เห็นเฉพาะห้องของตัวเอง"
# ---------------------------------------------------------------------------
INSIDER_SEES=$(psql_q -c "
  set local role authenticated;
  set local request.jwt.claims = '{\"sub\":\"$MEMBER\",\"role\":\"authenticated\"}';
  select count(*) from public.queue_items where room_id = '$ROOM_ID';")
[ "$INSIDER_SEES" -gt 0 ] \
  && pass "สมาชิกห้องอ่านคิวได้ ($INSIDER_SEES แถว)" \
  || fail "สมาชิกห้องอ่านคิวไม่ได้"

OUTSIDER_SEES=$(psql_q -c "
  set local role authenticated;
  set local request.jwt.claims = '{\"sub\":\"$OUTSIDER\",\"role\":\"authenticated\"}';
  select count(*) from public.queue_items where room_id = '$ROOM_ID';")
[ "$OUTSIDER_SEES" = "0" ] \
  && pass "★ คนนอกห้องอ่านคิวไม่ได้เลย (0 แถว) — Realtime ก็จะไม่ส่งให้เช่นกัน" \
  || fail "คนนอกห้องเห็นคิว $OUTSIDER_SEES แถว!"

OUTSIDER_ROOM=$(psql_q -c "
  set local role authenticated;
  set local request.jwt.claims = '{\"sub\":\"$OUTSIDER\",\"role\":\"authenticated\"}';
  select count(*) from public.rooms where id = '$ROOM_ID';")
[ "$OUTSIDER_ROOM" = "0" ] \
  && pass "คนนอกห้องอ่านข้อมูลห้องไม่ได้ (เดา code ตรง ๆ ไม่ได้)" \
  || fail "คนนอกห้องอ่านห้องได้!"

WRITE_ERR=$(psql "$DB_URL" -X -q -t -A -c "
  set local role authenticated;
  set local request.jwt.claims = '{\"sub\":\"$MEMBER\",\"role\":\"authenticated\"}';
  update public.queue_items set title = 'hacked' where room_id = '$ROOM_ID';" 2>&1 || true)
echo "$WRITE_ERR" | grep -qiE 'permission denied|denied' \
  && pass "★ สมาชิกห้องเขียนตาราง queue โดยตรงไม่ได้ (ไม่มี write policy)" \
  || fail "client เขียน DB ตรง ๆ ได้! (ได้: $WRITE_ERR)"

RPC_ERR=$(psql "$DB_URL" -X -q -t -A -c "
  set local role authenticated;
  set local request.jwt.claims = '{\"sub\":\"$MEMBER\",\"role\":\"authenticated\"}';
  select public.enqueue_track('$ROOM_ID'::uuid, '$OWNER'::uuid, 'TESTvideoZZ',
                              'Impersonate', 'Ch', NULL, 200);" 2>&1 || true)
echo "$RPC_ERR" | grep -qiE 'permission denied|denied' \
  && pass "★ client เรียก RPC ตรง ๆ เพื่อสวมรอยคนอื่นไม่ได้ (grant เฉพาะ service_role)" \
  || fail "client เรียก RPC ได้! (ได้: $RPC_ERR)"


# ---------------------------------------------------------------------------
section "8 · Rate limit"
# ---------------------------------------------------------------------------
psql_q -c "delete from public.rate_limits where bucket_key like 'test:%'" >/dev/null

RL_DIR=$(mktemp -d)
for i in $(seq 1 10); do
  psql "$DB_URL" -X -q -t -A -c \
    "select allowed from public.consume_rate_limit('test:concurrent', 5, 60, 1)" \
    >"$RL_DIR/$i" 2>&1 &
done
wait
ALLOWED_COUNT=$(cat "$RL_DIR"/* | grep -c '^t$' || true)
rm -rf "$RL_DIR"
[ "$ALLOWED_COUNT" = "5" ] \
  && pass "★ ยิง 10 request ขนานกันบนเพดาน 5 → ผ่านพอดี 5 (นับแบบ atomic)" \
  || fail "ผ่าน $ALLOWED_COUNT request (ควรเป็น 5)"

QUOTA=$(psql_q -c "select allowed from public.consume_rate_limit('test:quota', 10000, 86400, 101)")
[ "$QUOTA" = "t" ] \
  && pass "หักโควตา YouTube ทีละ 101 units ได้ (search 100 + videos 1)" \
  || fail "หักโควตาไม่สำเร็จ"


# ---------------------------------------------------------------------------
section "9 · Janitor — เพลงจบแต่ไม่มีใครรายงาน"
# ---------------------------------------------------------------------------
psql_q -c "
  update public.playback_states
  set is_playing = true, started_at = now() - interval '400 seconds', current_position = 0
  where room_id = '$ROOM_ID'" >/dev/null

BEFORE_ID=$(psql_q -c "select queue_item_id from public.playback_states where room_id='$ROOM_ID'")
ADVANCED=$(psql_q -c "select public.reconcile_stale_playback(20)")
AFTER_ID=$(psql_q -c "select queue_item_id from public.playback_states where room_id='$ROOM_ID'")

[ "$ADVANCED" -ge 1 ] && [ "$BEFORE_ID" != "$AFTER_ID" ] \
  && pass "janitor เดินหน้าคิวให้ห้องที่ค้าง ($ADVANCED ห้อง)" \
  || fail "janitor ไม่ได้เดินหน้าคิว"

psql_q -c "select public.reconcile_stale_playback(20)" >/dev/null
RERUN_ID=$(psql_q -c "select queue_item_id from public.playback_states where room_id='$ROOM_ID'")
[ "$RERUN_ID" = "$AFTER_ID" ] \
  && pass "รันซ้ำทันทีไม่แตะห้องนี้อีก (ไม่ข้ามเพลงรัว ๆ)" \
  || fail "janitor ข้ามเพลงซ้ำในรอบที่สอง"


# ---------------------------------------------------------------------------
section "10 · Invariant รวม"
# ---------------------------------------------------------------------------
psql_run <<SQL
do \$\$
declare v_n integer;
begin
  select count(*) into v_n from (
    select room_id from public.queue_items where status = 'PLAYING'
    group by room_id having count(*) > 1
  ) x;
  if v_n > 0 then raise exception 'พบห้องที่มีเพลง PLAYING มากกว่า 1 เพลง'; end if;

  select count(*) into v_n from (
    select room_id, position from public.queue_items
    group by room_id, position having count(*) > 1
  ) x;
  if v_n > 0 then raise exception 'พบ position ซ้ำ'; end if;

  select count(*) into v_n from public.playback_states
  where is_playing and (started_at is null or queue_item_id is null);
  if v_n > 0 then raise exception 'พบ playback ที่เล่นอยู่แต่ไม่มี anchor'; end if;

  select count(*) into v_n from (
    select room_id from public.room_members where role = 'OWNER'
    group by room_id having count(*) > 1
  ) x;
  if v_n > 0 then raise exception 'พบห้องที่มี OWNER มากกว่า 1 คน'; end if;
end
\$\$;
SQL
pass "invariant ทั้ง 4 ข้อยังเป็นจริงหลังทดสอบทุกอย่าง"


# ---------------------------------------------------------------------------
section "เก็บกวาด"
# ---------------------------------------------------------------------------
if [ "${KEEP:-0}" = "1" ]; then
  echo "  ข้ามการลบ (KEEP=1) — ห้องทดสอบ: $ROOM_CODE"
else
  psql_q -c "delete from auth.users where raw_user_meta_data ->> 'test_tag' = 'db-test'" >/dev/null
  psql_q -c "delete from public.rate_limits where bucket_key like 'test:%'" >/dev/null
  pass "ลบข้อมูลทดสอบแล้ว"
fi

printf '\n\033[32m\033[1mผ่านทั้งหมด\033[0m\n\n'

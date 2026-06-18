#!/usr/bin/env bash
# sync_standby_to_stage.sh — Chuyển dữ liệu chấm công + nhân viên + ca từ
# Standby DB (replica prod, container horilla-standby-db-1 / db horilla_prod)
# sang Stage DB (container horilla-db-1 / db horilla_stage), chạy trên HOST staging.
#
#   UPSERT (INSERT ON CONFLICT): employee/shift (giữ FK toàn vẹn)
#   REPLACE (delete + load):     attendance tables
#   Sau đó đối chiếu số bản ghi chấm công standby vs stage, ghi StandbySyncLog.
#
# Usage:
#   sudo bash sync_standby_to_stage.sh [--dry-run] [--trigger scheduled|manual]
set -uo pipefail

DRY=0; TRIGGER="scheduled"
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY=1;; --trigger) TRIGGER="$2"; shift;; esac; shift; done

SB="docker exec -i horilla-standby-db-1 psql -U horilla -d horilla_prod -tA"
SB_COPY="docker exec -i horilla-standby-db-1 psql -U horilla -d horilla_prod"
ST="docker exec -i horilla-db-1 psql -U horilla -d horilla_stage -tA"
ST_RUN="docker exec -i horilla-db-1 psql -U horilla -d horilla_stage -v ON_ERROR_STOP=1"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
START=$(date +%s)
declare -A ROWS

# Cột chung giữa standby và stage cho 1 bảng (xử lý lệch schema)
common_cols() {
  local t="$1"
  comm -12 \
    <($SB -c "SELECT column_name FROM information_schema.columns WHERE table_name='$t' ORDER BY 1" | sort) \
    <($ST -c "SELECT column_name FROM information_schema.columns WHERE table_name='$t' ORDER BY 1" | sort) \
    | paste -sd, -
}

upsert_table() {
  local t="$1" pk="$2"; local cols; cols=$(common_cols "$t")
  [ -z "$cols" ] && { echo "  ! $t: no common cols, skip"; return; }
  $SB_COPY -c "\copy (SELECT $cols FROM $t) TO STDOUT WITH CSV" > "$TMP/$t.csv"
  local n; n=$(wc -l < "$TMP/$t.csv" | tr -d ' '); ROWS[$t]=$n
  echo "  $t: $n rows (upsert, cols=$(echo "$cols" | tr ',' ' ' | wc -w))"
  [ "$DRY" = 1 ] && return
  local setc; setc=$(echo "$cols" | tr ',' '\n' | grep -v "^$pk$" | sed 's/.*/&=EXCLUDED.&/' | paste -sd, -)
  { echo "CREATE TEMP TABLE _t AS SELECT $cols FROM $t WITH NO DATA;"
    echo "COPY _t ($cols) FROM STDIN WITH CSV;"
    cat "$TMP/$t.csv"; echo "\\."
    echo "INSERT INTO $t ($cols) SELECT $cols FROM _t ON CONFLICT ($pk) DO UPDATE SET $setc;"
  } | $ST_RUN >/dev/null
}

replace_load() {  # load (after deletes done) — full replace
  local t="$1"; local cols; cols=$(common_cols "$t")
  $SB_COPY -c "\copy (SELECT $cols FROM $t) TO STDOUT WITH CSV" > "$TMP/$t.csv"
  local n; n=$(wc -l < "$TMP/$t.csv" | tr -d ' '); ROWS[$t]=$n
  echo "  $t: $n rows (replace)"
  [ "$DRY" = 1 ] && return
  { echo "COPY $t ($cols) FROM STDIN WITH CSV;"; cat "$TMP/$t.csv"; echo "\\."; } | $ST_RUN >/dev/null
}

echo "== sync_standby_to_stage (dry=$DRY) =="
echo "-- UPSERT employee + shifts --"
upsert_table base_employeeshift id
upsert_table base_employeeshiftschedule id
upsert_table employee_employee id
upsert_table employee_employeeworkinformation id
upsert_table attendance_employeeshiftplan id

echo "-- REPLACE attendance (truncate cascade) --"
if [ "$DRY" = 0 ]; then
  # CASCADE để dọn luôn các bảng phụ thuộc (workrecords, overtime, comments...)
  $ST_RUN -c "TRUNCATE attendance_attendance, attendance_attendanceactivity, attendance_attendancelatecomeearlyout CASCADE;" >/dev/null
fi
replace_load attendance_attendance
replace_load attendance_attendanceactivity
replace_load attendance_attendancelatecomeearlyout

# Reset sequence về max(id) cho MỌI bảng vừa nạp. COPY giữ nguyên id từ prod nên
# sequence của stage KHÔNG tự nhảy → INSERT mới của app (chấm công, late/early-out…)
# đụng PK đã tồn tại → "duplicate key ... _pkey" → 500. Bắt buộc reset sau mỗi sync.
if [ "$DRY" = 0 ]; then
  for t in base_employeeshift base_employeeshiftschedule employee_employee \
           employee_employeeworkinformation attendance_employeeshiftplan \
           attendance_attendance attendance_attendanceactivity \
           attendance_attendancelatecomeearlyout; do
    $ST_RUN -c "SELECT setval(pg_get_serial_sequence('$t','id'), (SELECT COALESCE(MAX(id),1) FROM $t));" >/dev/null 2>&1 \
      || echo "  ! setval $t failed (bỏ qua)"
  done
  echo "  ✓ reset sequences sau khi nạp"
fi

# Đối chiếu
SB_ATT=$($SB -c "SELECT count(*) FROM attendance_attendance")
ST_ATT=$($ST -c "SELECT count(*) FROM attendance_attendance")
SB_ACT=$($SB -c "SELECT count(*) FROM attendance_attendanceactivity")
ST_ACT=$($ST -c "SELECT count(*) FROM attendance_attendanceactivity")
MATCH=false; [ "$SB_ATT" = "$ST_ATT" ] && [ "$SB_ACT" = "$ST_ACT" ] && MATCH=true
DUR=$(( $(date +%s) - START ))

TABLES_JSON="{"; first=1
for k in "${!ROWS[@]}"; do [ $first = 1 ] || TABLES_JSON+=","; TABLES_JSON+="\"$k\":${ROWS[$k]}"; first=0; done
TABLES_JSON+="}"
RECON="{\"prod_attendance\":$SB_ATT,\"stage_attendance\":$ST_ATT,\"prod_activity\":$SB_ACT,\"stage_activity\":$ST_ACT,\"match\":$MATCH}"
STATUS=$([ "$DRY" = 1 ] && echo "success" || ([ "$MATCH" = true ] && echo "success" || echo "partial"))
MSG=$([ "$DRY" = 1 ] && echo "dry-run (chỉ đếm, không ghi)" || echo "sync hoàn tất")

echo "RECON: $RECON"
if [ "$DRY" = 0 ]; then
  PAYLOAD="{\"status\":\"$STATUS\",\"trigger\":\"$TRIGGER\",\"duration_seconds\":$DUR,\"tables\":$TABLES_JSON,\"reconciliation\":$RECON,\"message\":\"$MSG\"}"
  echo "$PAYLOAD" | docker exec -i horilla-web-1 python manage.py record_standby_sync --payload "$(cat)"
fi
echo "== done (dur ${DUR}s, match=$MATCH) =="

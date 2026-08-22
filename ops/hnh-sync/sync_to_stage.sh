#!/usr/bin/env bash
# sync_to_stage.sh — chạy trên MÁY LOCAL (stage). Copy dữ liệu chấm công/NV/ca từ
# Standby remote (100.112.134.39:5433) → Stage DB local (horilla-db-1/horilla_stage).
# Standby cần password (scram) — đọc từ ~/hnh-sync/.env (HNH_STANDBY_PW).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; [ -f "$DIR/.env" ] && source "$DIR/.env"
DRY=0; TRIGGER="scheduled"
while [ $# -gt 0 ]; do case "$1" in --dry-run) DRY=1;; --trigger) TRIGGER="$2"; shift;; esac; shift; done
PW="${HNH_STANDBY_PW:-}"
[ -z "$PW" ] && { echo "THIẾU HNH_STANDBY_PW trong ~/hnh-sync/.env"; exit 1; }
SB="docker exec -i -e PGPASSWORD=$PW horilla-db-1 psql -h 100.112.134.39 -p 5433 -U horilla -d horilla_prod -tA"
SB_COPY="docker exec -i -e PGPASSWORD=$PW horilla-db-1 psql -h 100.112.134.39 -p 5433 -U horilla -d horilla_prod"
ST="docker exec -i horilla-db-1 psql -U horilla -d horilla_stage -tA"
ST_RUN="docker exec -i horilla-db-1 psql -U horilla -d horilla_stage -v ON_ERROR_STOP=1"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; START=$(date +%s); declare -A ROWS
common_cols(){ local t="$1"; comm -12 <($SB -c "SELECT column_name FROM information_schema.columns WHERE table_name='$t' ORDER BY 1"|sort) <($ST -c "SELECT column_name FROM information_schema.columns WHERE table_name='$t' ORDER BY 1"|sort)|paste -sd, -; }
upsert_table(){ local t="$1" pk="$2" cols; cols=$(common_cols "$t"); [ -z "$cols" ] && { echo "  ! $t: no common cols"; return; }
  $SB_COPY -c "\copy (SELECT $cols FROM $t) TO STDOUT WITH CSV" > "$TMP/$t.csv"; local n; n=$(wc -l < "$TMP/$t.csv"|tr -d ' '); ROWS[$t]=$n; echo "  $t: $n rows"
  [ "$DRY" = 1 ] && return; local setc; setc=$(echo "$cols"|tr ',' '\n'|grep -v "^$pk$"|sed 's/.*/&=EXCLUDED.&/'|paste -sd, -)
  { echo "CREATE TEMP TABLE _t AS SELECT $cols FROM $t WITH NO DATA;"; echo "COPY _t ($cols) FROM STDIN WITH CSV;"; cat "$TMP/$t.csv"; echo "\."; echo "INSERT INTO $t ($cols) SELECT $cols FROM _t ON CONFLICT ($pk) DO UPDATE SET $setc;"; } | $ST_RUN >/dev/null; }
replace_load(){ local t="$1" cols; cols=$(common_cols "$t"); $SB_COPY -c "\copy (SELECT $cols FROM $t) TO STDOUT WITH CSV" > "$TMP/$t.csv"; local n; n=$(wc -l < "$TMP/$t.csv"|tr -d ' '); ROWS[$t]=$n; echo "  $t: $n rows (replace)"; [ "$DRY" = 1 ] && return; { echo "COPY $t ($cols) FROM STDIN WITH CSV;"; cat "$TMP/$t.csv"; echo "\."; } | $ST_RUN >/dev/null; }
echo "== sync_to_stage (dry=$DRY) @ $(date '+%Y-%m-%d %H:%M:%S') trigger=$TRIGGER =="

# Stage PHẢI có schema thì mới copy dữ liệu được. Nếu DB bị xoá / khởi tạo mới thì
# public schema rỗng -> common_cols() trả rỗng -> "COPY t () FROM STDIN" syntax error,
# mà script vẫn exit 0 nên Task Scheduler báo thành công. Đã âm thầm hỏng 20/08/2026.
NTAB=$($ST -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '[:space:]')
NTAB=${NTAB:-0}
if [ "$NTAB" -lt 50 ]; then
  echo "  ! stage chi co $NTAB bang -> chay migrate truoc khi sync"
  docker exec -i horilla-web-1 python manage.py migrate --no-input 2>&1 | tail -3
  NTAB=$($ST -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '[:space:]')
  NTAB=${NTAB:-0}
  echo "  sau migrate: $NTAB bang"
  if [ "$NTAB" -lt 50 ]; then
    echo "!! migrate that bai, stage van khong co schema - DUNG"
    exit 1
  fi
fi
for pair in "auth_user id" "base_employeeshift id" "base_employeeshiftschedule id" "employee_employee id" "employee_employeeworkinformation id" "attendance_employeeshiftplan id"; do upsert_table $pair; done
[ "$DRY" = 0 ] && $ST_RUN -c "TRUNCATE attendance_attendance, attendance_attendanceactivity, attendance_attendancelatecomeearlyout CASCADE;" >/dev/null
for t in attendance_attendance attendance_attendanceactivity attendance_attendancelatecomeearlyout; do replace_load "$t"; done
if [ "$DRY" = 0 ]; then for t in auth_user base_employeeshift base_employeeshiftschedule employee_employee employee_employeeworkinformation attendance_employeeshiftplan attendance_attendance attendance_attendanceactivity attendance_attendancelatecomeearlyout; do $ST_RUN -c "SELECT setval(pg_get_serial_sequence('$t','id'), (SELECT COALESCE(MAX(id),1) FROM $t));" >/dev/null 2>&1 || echo "  ! setval $t"; done; echo "  reset sequences"; fi
SB_ATT=$($SB -c "SELECT count(*) FROM attendance_attendance"); ST_ATT=$($ST -c "SELECT count(*) FROM attendance_attendance")
SB_ACT=$($SB -c "SELECT count(*) FROM attendance_attendanceactivity"); ST_ACT=$($ST -c "SELECT count(*) FROM attendance_attendanceactivity")
SB_ATT=${SB_ATT:-0}; ST_ATT=${ST_ATT:-0}; SB_ACT=${SB_ACT:-0}; ST_ACT=${ST_ACT:-0}
MATCH=false; [ "$SB_ATT" = "$ST_ATT" ] && [ "$SB_ACT" = "$ST_ACT" ] && MATCH=true; DUR=$(( $(date +%s) - START ))
TJ="{"; f=1; for k in "${!ROWS[@]}"; do [ $f = 1 ] || TJ+=","; TJ+="\"$k\":${ROWS[$k]}"; f=0; done; TJ+="}"
RC="{\"prod_attendance\":$SB_ATT,\"stage_attendance\":$ST_ATT,\"prod_activity\":$SB_ACT,\"stage_activity\":$ST_ACT,\"match\":$MATCH}"
STATUS=$([ "$MATCH" = true ] && echo success || echo partial); echo "RECON: $RC"
if [ "$DRY" = 0 ]; then P="{\"status\":\"$STATUS\",\"trigger\":\"$TRIGGER\",\"duration_seconds\":$DUR,\"tables\":$TJ,\"reconciliation\":$RC,\"message\":\"sync hoàn tất\"}"; echo "$P" | docker exec -i horilla-web-1 python manage.py record_standby_sync --payload "$(cat)" 2>&1 | tail -2; fi
echo "== done (dur ${DUR}s match=$MATCH) =="
# Task Scheduler chi doc exit code. match=false ma exit 0 = hong trong im lang.
if [ "$MATCH" != true ]; then
  echo "!! SYNC THAT BAI: prod_att=$SB_ATT stage_att=$ST_ATT prod_act=$SB_ACT stage_act=$ST_ACT"
  exit 1
fi

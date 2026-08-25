#!/usr/bin/env bash
# refresh_stb_db.sh — lam tuoi DB cua site qlns-stb tu standby replica.
# Chay tren hnhlocal (100.99.228.31), cron 02:00 hang dem. KHONG can sudo.
#
# Duong di du lieu:
#   prod --WAL lien tuc--> horilla-standby-db-1 (5433, read-only)
#        --pg_dump noi bo--> file tam --pg_restore--> horilla-db-1 (DB site)
#
# Dump tu REPLICA chu khong phai prod: prod khong chiu tai gi, va khong ton
# 250MB qua Tailscale vi ca hai container nam cung mot may.
#
# Luu y: replica da duoc dat max_standby_streaming_delay=15min (2026-08-25).
# Mac dinh 30s se khien pg_dump 2,2GB bi huy giua chung voi loi
# "canceling statement due to conflict with recovery".
#
# CANH BAO: script XOA VA TAO LAI DB cua site. Moi du lieu nhap tay tren
# qlns-stb (don thu, cham cong thu) se mat sau moi lan chay.
set -uo pipefail

REPLICA=horilla-standby-db-1     # container replica, DB horilla_prod
SITE=horilla-db-1                # container DB cua site
SITE_DB=horilla_stage
COMPOSE_DIR=/home/quanna/hnh/horilla
DUMPDIR=/home/quanna/hnh/dumps
LOG=/home/quanna/hnh/refresh_stb.log

say() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }
die() { say "LOI: $*"; exit 1; }

mkdir -p "$DUMPDIR"
TS=$(date '+%Y%m%d_%H%M%S')
DUMP="$DUMPDIR/stb_refresh_$TS.dump"

say "=== bat dau lam tuoi DB site qlns-stb ==="

# 1) Replica phai dang khoe. Lam tuoi tu mot replica dang tut hau = chep du lieu cu.
LAG=$(docker exec "$REPLICA" psql -U horilla -d horilla_prod -tAc \
  "SELECT coalesce(extract(epoch from now()-pg_last_xact_replay_timestamp())::bigint, -1);" 2>/dev/null | tr -dc '0-9-')
[ -n "$LAG" ] || die "khong doc duoc lag cua replica"
if [ "$LAG" -lt 0 ] || [ "$LAG" -gt 600 ]; then
  die "replica lag ${LAG}s (nguong 600s) - dung, khong lam tuoi bang du lieu cu"
fi
say "replica lag ${LAG}s - OK"

# 2) Dump tu replica
say "dump tu replica..."
docker exec "$REPLICA" pg_dump -U horilla -d horilla_prod -Fc --no-owner --no-privileges > "$DUMP"
rc=$?
[ $rc -eq 0 ] || { rm -f "$DUMP"; die "pg_dump that bai (rc=$rc)"; }
[ -s "$DUMP" ] || { rm -f "$DUMP"; die "file dump rong"; }
say "dump xong: $(du -h "$DUMP" | cut -f1)"

# 3) Doc muc luc archive truoc khi dap DB dang chay. Dump hong ma da drop DB
#    thi site chet han - nen kiem o day, khong doi den luc restore.
docker exec -i "$SITE" pg_restore -l < "$DUMP" > /dev/null 2>&1 \
  || { rm -f "$DUMP"; die "dump khong doc duoc bang pg_restore -l"; }
say "dump doc duoc - an toan de thay DB"

# 4) Dung web+bff de nha ket noi toi DB (drop database can 0 connection)
cd "$COMPOSE_DIR" || die "khong vao duoc $COMPOSE_DIR"
DC="docker compose --env-file .env.stb -f docker-compose.stage.yml -f docker-compose.stb.yml"
say "dung web + bff..."
$DC stop web bff >/dev/null 2>&1

# 5) Tao lai DB rong
docker exec "$SITE" psql -U horilla -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$SITE_DB' AND pid<>pg_backend_pid();" >/dev/null 2>&1
docker exec "$SITE" psql -U horilla -d postgres -c "DROP DATABASE IF EXISTS $SITE_DB;" >/dev/null 2>&1 \
  || { $DC start web bff >/dev/null 2>&1; die "khong drop duoc $SITE_DB"; }
docker exec "$SITE" psql -U horilla -d postgres -c "CREATE DATABASE $SITE_DB OWNER horilla;" >/dev/null 2>&1 \
  || { $DC start web bff >/dev/null 2>&1; die "khong tao lai duoc $SITE_DB"; }
say "da tao lai $SITE_DB rong"

# 6) Restore
docker cp "$DUMP" "$SITE:/tmp/refresh.dump" >/dev/null 2>&1 || die "khong cp duoc dump vao container"
docker exec "$SITE" pg_restore -U horilla -d "$SITE_DB" --no-owner --no-privileges -j 4 /tmp/refresh.dump >/dev/null 2>&1
rc=$?
docker exec "$SITE" rm -f /tmp/refresh.dump >/dev/null 2>&1
if [ $rc -ne 0 ]; then
  $DC start web bff >/dev/null 2>&1
  die "pg_restore that bai (rc=$rc) - DB site dang KHONG day du, can xu ly tay"
fi
say "restore xong"

# 7) Bat lai app
$DC start web bff >/dev/null 2>&1
say "da bat lai web + bff"

# 8) Doi chieu: so lieu site phai khop replica
read -r R_NV R_ATT <<< "$(docker exec "$REPLICA" psql -U horilla -d horilla_prod -tAc \
  "SELECT (SELECT count(*) FROM employee_employee)||' '||(SELECT count(*) FROM attendance_attendance);" 2>/dev/null)"
read -r S_NV S_ATT <<< "$(docker exec "$SITE" psql -U horilla -d "$SITE_DB" -tAc \
  "SELECT (SELECT count(*) FROM employee_employee)||' '||(SELECT count(*) FROM attendance_attendance);" 2>/dev/null)"
say "doi chieu  nhan_vien: replica=$R_NV site=$S_NV   cham_cong: replica=$R_ATT site=$S_ATT"

# 9) Don dump cu, giu 3 ban
ls -1t "$DUMPDIR"/stb_refresh_*.dump 2>/dev/null | tail -n +4 | while read -r f; do
  rm -f "$f" && say "  xoa dump cu: $(basename "$f")"
done

if [ "${S_NV:-0}" != "${R_NV:-1}" ]; then
  say "!! SO LIEU LECH - kiem tra lai"
  exit 1
fi
say "=== xong, DB site da tuoi ==="
exit 0

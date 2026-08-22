#!/usr/bin/env bash
# backup-db.sh — pg_dump dinh ky DB Horilla prod.
# Truoc 2026-08-22 KHONG he co backup nao cho horilla_prod: chi co replication
# sang standby, ma replica KHONG phai backup (xoa nham tren prod la replica xoa theo).
# Chay bang user naquan (co group docker) - KHONG can sudo.
set -uo pipefail

DIR=/opt/hnh/backups/db
KEEP=7                 # giu 7 ban ngay gan nhat (~2GB voi dump ~300MB)
MIN_FREE_GB=8          # khong dump neu / con it hon nguong nay
LOG=/opt/hnh/backups/db/backup-db.log

mkdir -p "$DIR"
TS=$(date '+%Y%m%d_%H%M%S')
OUT="$DIR/horilla_prod_$TS.dump"
say() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

# Prod dang 78% dia. Dump khi sap day se lam hong ca he thong -> chan truoc.
AVAIL=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
if [ "${AVAIL:-0}" -lt "$MIN_FREE_GB" ]; then
  say "LOI: chi con ${AVAIL}G trong / (nguong ${MIN_FREE_GB}G) - bo qua dump"
  exit 1
fi

say "bat dau dump horilla_prod (con ${AVAIL}G trong)"
if ! docker exec horilla-db-1 pg_dump -U horilla -d horilla_prod -Fc --no-owner > "$OUT" 2>>"$LOG"; then
  say "LOI: pg_dump that bai"
  rm -f "$OUT"
  exit 1
fi

if [ ! -s "$OUT" ]; then
  say "LOI: file dump rong"
  rm -f "$OUT"
  exit 1
fi

# Doc muc luc archive: dump hong/cut ngang se fail o day chu khong doi den luc restore.
if ! docker exec -i horilla-db-1 pg_restore -l < "$OUT" > /dev/null 2>>"$LOG"; then
  say "LOI: dump khong doc duoc bang pg_restore -l - xoa"
  rm -f "$OUT"
  exit 1
fi

SIZE=$(du -h "$OUT" | cut -f1)
say "OK: $(basename "$OUT") ($SIZE)"

# Don ban cu, giu $KEEP ban moi nhat
mapfile -t OLD < <(ls -1t "$DIR"/horilla_prod_*.dump 2>/dev/null | tail -n +$((KEEP + 1)))
for f in "${OLD[@]:-}"; do
  [ -n "$f" ] || continue
  rm -f "$f" && say "  xoa ban cu: $(basename "$f")"
done

say "tong thu muc backup: $(du -sh "$DIR" | cut -f1), so ban: $(ls -1 "$DIR"/horilla_prod_*.dump 2>/dev/null | wc -l)"
exit 0

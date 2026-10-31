#!/usr/bin/env bash
# db_pull_from_prod.sh — chạy trên MÁY LOCAL. Kéo bản pg_dump của horilla_prod
# từ prod về ổ D:, để backup không nằm cùng chỗ với dữ liệu gốc.
# Dump nằm trên prod là chống lỡ tay xoá dữ liệu; kéo về đây là chống mất cả máy prod.
# Cặp với: /opt/hnh/backups/backup-db.sh trên prod (cron 01:30 hằng ngày).
set -uo pipefail

KEY="D:/HNH2026/Cloud/es-hrm.pem"
PROD="naquan@100.99.164.24"
PROD_DIR="/opt/hnh/backups/db"
LOCAL_DIR="/d/HNH2026/Backups/horilla-db"
KEEP=7
LOG="$HOME/hnh-sync/db_pull.log"
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=15"
SCP="scp -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=15"
log(){ echo "[$(date '+%F %T')] $*" >> "$LOG"; [ -t 1 ] && echo "$*"; return 0; }

mkdir -p "$LOCAL_DIR"
log "=== Bat dau keo DB backup tu prod ==="

# Mới nhất trước: lỡ đứt giữa chừng thì bản quan trọng nhất đã về.
REMOTE=$($SSH "$PROD" "ls -1 $PROD_DIR/horilla_prod_*.dump 2>/dev/null | sort -r" 2>/dev/null)
if [ -z "$REMOTE" ]; then
  log "LOI: prod khong co file dump nao"
  exit 1
fi

NEW=0
while IFS= read -r rpath; do
  [ -n "$rpath" ] || continue
  base=$(basename "$rpath")
  lpath="$LOCAL_DIR/$base"
  # ssh/scp trong vòng `while read` mà không chặn stdin sẽ đọc hết danh sách
  # còn lại -> vòng lặp dừng sau file đầu. Lỗi này khiến D: chậm 6 ngày (đến 31/10/2026).
  rsize=$($SSH -n "$PROD" "stat -c %s '$rpath'" 2>/dev/null | tr -dc '0-9')
  if [ -f "$lpath" ]; then
    lsize=$(stat -c %s "$lpath" 2>/dev/null | tr -dc '0-9')
    [ "${lsize:-0}" = "${rsize:-1}" ] && continue
    log "  $base kich thuoc lech (local=${lsize:-0} prod=${rsize:-?}) - tai lai"
  fi
  if $SCP "$PROD:$rpath" "$lpath" </dev/null >/dev/null 2>&1; then
    lsize=$(stat -c %s "$lpath" 2>/dev/null | tr -dc '0-9')
    if [ "${lsize:-0}" != "${rsize:-1}" ]; then
      log "LOI: $base tai ve khong khop kich thuoc - xoa"
      rm -f "$lpath"
    else
      log "  OK $base ($(du -h "$lpath" | cut -f1))"
      NEW=$((NEW + 1))
    fi
  else
    log "LOI: khong tai duoc $base"
  fi
done <<< "$REMOTE"

# Don ban cu o local, giu $KEEP ban moi nhat THEO TEN (ngay dump), khong theo mtime
# — mtime la luc tai ve, tai bu ban cu se lam xoa nham ban moi.
ls -1 "$LOCAL_DIR"/horilla_prod_*.dump 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | while IFS= read -r f; do
  [ -n "$f" ] || continue
  rm -f "$f" && log "  xoa ban cu: $(basename "$f")"
done

CNT=$(ls -1 "$LOCAL_DIR"/horilla_prod_*.dump 2>/dev/null | wc -l | tr -d ' ')
LATEST=$(ls -1 "$LOCAL_DIR"/horilla_prod_*.dump 2>/dev/null | sort -r | head -1)
log "=== Xong: tai moi $NEW, tong $CNT ban, moi nhat $(basename "${LATEST:-khong-co}") ==="

# Khong co ban nao = mat backup, phai bao do cho Task Scheduler
[ "${CNT:-0}" -gt 0 ] || exit 1
exit 0

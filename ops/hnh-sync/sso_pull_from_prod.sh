#!/usr/bin/env bash
# sso_pull_from_prod.sh — chạy trên MÁY LOCAL (stage). KÉO backup SSO từ prod
# (100.99.164.24:/opt/hnh/sso/backups) về local, rồi ĐẨY health sso_backup đầy đủ
# (prod_latest + stage_latest/count/synced) lên prod API để tab Giám sát hiện đúng.
# Thay cho chiều cũ prod→rsync→stage (máy stage cũ 100.88.75.106 đã chết).
set -uo pipefail

KEY="D:/HNH2026/Cloud/es-hrm.pem"
PROD="naquan@100.99.164.24"
PROD_BDIR="/opt/hnh/sso/backups"
LOCAL_DIR="$HOME/hnh-sync/sso-backups"
API="https://qlns.hnhtravel.work"
LOG="$HOME/hnh-sync/sso_pull.log"
SSH="ssh -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=15"
SCP="scp -i $KEY -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=15"
log(){ echo "[$(date '+%F %T')] $*" >> "$LOG"; [ -t 1 ] && echo "$*"; return 0; }

mkdir -p "$LOCAL_DIR"
log "=== Bắt đầu kéo SSO backup từ prod ==="

# 1) Danh sách backup dir trên prod
PROD_DIRS=$($SSH "$PROD" "cd $PROD_BDIR 2>/dev/null && ls -d 20*/ 2>/dev/null | tr -d '/'" 2>/dev/null)
if [ -z "$PROD_DIRS" ]; then log "LỖI: không lấy được danh sách backup prod"; STATUS=error; fi
PROD_LATEST=$(echo "$PROD_DIRS" | sort | tail -1)

# 2) scp các dir chưa có ở local
newn=0
for d in $PROD_DIRS; do
  if [ ! -d "$LOCAL_DIR/$d" ] || [ ! -f "$LOCAL_DIR/$d/BACKUP_META.txt" ]; then
    if $SCP -r "$PROD:$PROD_BDIR/$d" "$LOCAL_DIR/" >/dev/null 2>&1; then
      log "  + kéo $d"; newn=$((newn+1))
    else
      log "  ! lỗi kéo $d"
    fi
  fi
done

# 3) Dọn dir local không còn trên prod (giữ khớp prod)
for d in "$LOCAL_DIR"/20*/; do
  [ -d "$d" ] || continue
  bn=$(basename "$d")
  echo "$PROD_DIRS" | grep -qx "$bn" || { rm -rf "$d"; log "  - xóa (prod đã bỏ) $bn"; }
done

# 4) Đối chiếu
STAGE_COUNT=$(ls -d "$LOCAL_DIR"/20*/ 2>/dev/null | wc -l | tr -d ' ')
STAGE_LATEST=$(ls -d "$LOCAL_DIR"/20*/ 2>/dev/null | sort | tail -1 | xargs -r basename)
SYNCED=false; [ -n "$STAGE_LATEST" ] && [ "$STAGE_LATEST" = "$PROD_LATEST" ] && SYNCED=true
# tuổi backup prod (giờ)
AGE=9999
if [ -n "$PROD_LATEST" ]; then
  TS=$(echo "$PROD_LATEST" | sed -E 's/([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2}).*/\1-\2-\3 \4:\5:\6/')
  EP=$(date -d "$TS" +%s 2>/dev/null || echo 0)
  [ "$EP" -gt 0 ] && AGE=$(( ($(date +%s) - EP) / 3600 ))
fi
if [ "$SYNCED" = true ] && [ "$AGE" -le 26 ]; then STATUS=ok
elif [ -z "$STAGE_LATEST" ]; then STATUS=error
else STATUS=warn; fi

log "prod_latest=$PROD_LATEST stage_latest=$STAGE_LATEST count=$STAGE_COUNT synced=$SYNCED age=${AGE}h new=$newn"

# 5) Đẩy health sso_backup lên prod (lấy token từ prod lúc chạy — không lưu local)
TOKEN=$($SSH "$PROD" "grep -oP '^STANDBY_SYNC_PUSH_TOKEN=\K.*' /opt/hnh/horilla/.env.prod" 2>/dev/null | tr -d '\r')
if [ -z "$TOKEN" ]; then log "  ! không lấy được token, bỏ qua push"; else
  D="{\"prod_latest\":\"$PROD_LATEST\",\"stage_latest\":\"$STAGE_LATEST\",\"stage_count\":$STAGE_COUNT,\"stage_synced\":$SYNCED,\"backup_age_hours\":$AGE,\"backup_count\":$STAGE_COUNT}"
  M="prod backup $PROD_LATEST (age ${AGE}h) | stage $STAGE_LATEST count $STAGE_COUNT synced=$SYNCED"
  H=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/base/system-health/" \
    -H "X-Sync-Token: $TOKEN" -H "Content-Type: application/json" \
    -d "{\"check_type\":\"sso_backup\",\"status\":\"$STATUS\",\"details\":$D,\"message\":\"$M\"}" 2>/dev/null)
  [ "$H" = "201" ] && log "  pushed sso_backup=$STATUS (201)" || log "  push FAIL http=$H"
fi
log "=== Xong (synced=$SYNCED) ==="

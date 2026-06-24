#!/usr/bin/env bash
# check_system_health.sh — Kiểm tra định kỳ 1h:
#   1. Replication lag Prod↔Standby
#   2. Trạng thái backup SSO (prod→stage)
# Kết quả push sang Prod API qua X-Sync-Token.
set -uo pipefail

PUSH_ENV='/opt/horilla/deploy/.sync_push_env'
[ -f "$PUSH_ENV" ] && source "$PUSH_ENV"

PROD_URL="${PROD_SYNC_URL:-https://qlns.hnhtravel.work}"
TOKEN="${PROD_SYNC_TOKEN:-}"
LOG="/opt/horilla/deploy/check_health.log"

log() { local _l="[$(date '+%Y-%m-%d %H:%M:%S')] $*"; echo "$_l" >> "$LOG"; [ -t 1 ] && echo "$_l"; return 0; }
push() {
  local TYPE="$1" STATUS="$2" DETAILS="$3" MSG="$4"
  if [ -z "$TOKEN" ]; then log "SKIP push: no token"; return; fi
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$PROD_URL/api/base/system-health/" \
    -H "X-Sync-Token: $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"check_type\":\"$TYPE\",\"status\":\"$STATUS\",\"details\":$DETAILS,\"message\":\"$MSG\"}" 2>/dev/null)
  [ "$HTTP" = "201" ] && log "  ✓ pushed $TYPE=$STATUS" || log "  ! push failed HTTP $HTTP"
}

# ── 1. Prod ↔ Standby replication ────────────────────────────────
log "=== Check Prod↔Standby replication ==="
STBY_RESULT=$(docker exec horilla-standby-db-1 psql -U horilla -d horilla_prod -tA -c \
  "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int,
          pg_last_xact_replay_timestamp()::text,
          pg_is_in_recovery()::text;" 2>/dev/null || echo "ERROR")

if [ "$STBY_RESULT" = "ERROR" ] || [ -z "$STBY_RESULT" ]; then
  push "prod_standby" "error" '{"lag_seconds":null,"is_standby":null}' "Không kết nối được Standby DB"
  log "  ! standby unreachable"
else
  LAG_SEC=$(echo "$STBY_RESULT" | cut -d'|' -f1 | tr -d ' ')
  LAST_REPLAY=$(echo "$STBY_RESULT" | cut -d'|' -f2 | tr -d ' ')
  IS_STBY=$(echo "$STBY_RESULT" | cut -d'|' -f3 | tr -d ' ')

  # Row counts
  STBY_ATT=$(docker exec horilla-standby-db-1 psql -U horilla -d horilla_prod -tA -c "SELECT COUNT(*) FROM attendance_attendance;" 2>/dev/null || echo "0")
  STBY_EMP=$(docker exec horilla-standby-db-1 psql -U horilla -d horilla_prod -tA -c "SELECT COUNT(*) FROM employee_employee;" 2>/dev/null || echo "0")
  # Prod is a separate server (100.99.164.24); query it over SSH. The standby
  # container above is the local replica. Do NOT query the stage-local db here.
  PROD_KEY=/opt/horilla/deploy/es-hrm.pem
  PROD_HOST=naquan@100.99.164.24
  PROD_COUNTS=$(ssh -i "$PROD_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$PROD_HOST" \
    'docker exec horilla-db-1 psql -U horilla -d horilla_prod -tA -c "SELECT COUNT(*) FROM attendance_attendance; SELECT COUNT(*) FROM employee_employee;"' 2>/dev/null)
  PROD_ATT=$(echo "$PROD_COUNTS" | sed -n 1p | tr -d ' ')
  PROD_EMP=$(echo "$PROD_COUNTS" | sed -n 2p | tr -d ' ')
  [[ "$PROD_ATT" =~ ^[0-9]+$ ]] || PROD_ATT=null
  [[ "$PROD_EMP" =~ ^[0-9]+$ ]] || PROD_EMP=null

  if [ -z "$LAG_SEC" ] || ! [[ "$LAG_SEC" =~ ^[0-9]+$ ]]; then LAG_SEC=0; fi
  if   [ "$LAG_SEC" -gt 300 ]; then STATUS="error"
  elif [ "$LAG_SEC" -gt 60  ]; then STATUS="warn"
  else STATUS="ok"; fi

  # Escalate to warn if the replica has diverged. Employees change rarely, so
  # any emp mismatch is a real signal. Attendance churns constantly; tolerate a
  # small drift from the few rows in flight during the lag window. Skip when prod
  # counts are null (SSH to prod failed) — can't compare, leave lag-based status.
  if [ "$STATUS" = "ok" ] && [[ "$PROD_ATT" =~ ^[0-9]+$ ]] && [[ "$PROD_EMP" =~ ^[0-9]+$ ]]; then
    ATT_DIFF=$(( PROD_ATT - STBY_ATT )); ATT_DIFF=${ATT_DIFF#-}
    if [ "$PROD_EMP" != "$STBY_EMP" ] || [ "$ATT_DIFF" -gt 50 ]; then
      STATUS="warn"
      log "  ! count mismatch: att prod=$PROD_ATT stby=$STBY_ATT | emp prod=$PROD_EMP stby=$STBY_EMP"
    fi
  fi

  DETAILS="{\"lag_seconds\":$LAG_SEC,\"last_replay\":\"$LAST_REPLAY\",\"is_standby\":\"$IS_STBY\",\"standby_attendance\":$STBY_ATT,\"standby_employee\":$STBY_EMP,\"prod_attendance\":$PROD_ATT,\"prod_employee\":$PROD_EMP}"
  MSG="lag ${LAG_SEC}s | att prod=${PROD_ATT} stby=${STBY_ATT} | emp prod=${PROD_EMP} stby=${STBY_EMP}"
  log "  lag=${LAG_SEC}s status=$STATUS"
  push "prod_standby" "$STATUS" "$DETAILS" "$MSG"
fi

# ── 2. SSO Backup status ─────────────────────────────────────────
log "=== Check SSO Backup ==="
STAGE_BACKUP_DIR="/opt/horilla/sso-backups"
PROD_BACKUP_DIR="/opt/hnh/sso/backups"

# Latest backup trên stage
STAGE_LATEST=$(ls -dt "$STAGE_BACKUP_DIR"/20*/ 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "")
STAGE_COUNT=$(ls -d "$STAGE_BACKUP_DIR"/20*/ 2>/dev/null | wc -l | tr -d ' ')

# Latest backup trên prod (qua SSH)
PROD_LATEST=$(ssh -i /opt/horilla/deploy/es-hrm.pem -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 \
  naquan@100.99.164.24 "ls -dt $PROD_BACKUP_DIR/20*/ 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo ''" 2>/dev/null || echo "SSH_ERROR")

# Kiểm tra tuổi của backup mới nhất trên stage
BACKUP_AGE_H=9999
if [ -n "$STAGE_LATEST" ] && [ "$STAGE_LATEST" != "SSH_ERROR" ]; then
  BACKUP_TS=$(echo "$STAGE_LATEST" | sed 's/\([0-9]\{8\}\)_\([0-9]\{6\}\)/\1 \2/' | sed 's/\(.\{4\}\)\(.\{2\}\)\(.\{2\}\) \(.\{2\}\)\(.\{2\}\)\(.\{2\}\)/\1-\2-\3 \4:\5:\6/')
  BACKUP_EPOCH=$(date -d "$BACKUP_TS" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  BACKUP_AGE_H=$(( (NOW_EPOCH - BACKUP_EPOCH) / 3600 ))
fi

SYNCED="false"
[ "$STAGE_LATEST" = "$PROD_LATEST" ] && SYNCED="true"

if   [ "$PROD_LATEST" = "SSH_ERROR" ]; then SSO_STATUS="warn"
elif [ "$BACKUP_AGE_H" -gt 26 ];       then SSO_STATUS="warn"
elif [ "$SYNCED" = "false" ];           then SSO_STATUS="warn"
else SSO_STATUS="ok"; fi

SSO_DETAILS="{\"stage_latest\":\"$STAGE_LATEST\",\"prod_latest\":\"$PROD_LATEST\",\"stage_count\":$STAGE_COUNT,\"backup_age_hours\":$BACKUP_AGE_H,\"stage_synced\":$SYNCED}"
SSO_MSG="stage: $STAGE_LATEST | prod: $PROD_LATEST | age: ${BACKUP_AGE_H}h | synced: $SYNCED"
log "  $SSO_MSG"
push "sso_backup" "$SSO_STATUS" "$SSO_DETAILS" "$SSO_MSG"

log "=== check_system_health done ==="

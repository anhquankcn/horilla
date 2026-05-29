#!/bin/bash
# E2E auth flow test for HNH PWA
#
# Tests the BFF ↔ Django ↔ Keycloak auth chain.
#
# Usage:
#   # Start services first:
#   cd pwa/bff && npm run dev          # BFF on :3000
#   cd pwa/frontend && npm run dev     # Vite on :5173
#   python manage.py runserver 0.0.0.0:8000  # Django
#
#   # Then run tests:
#   bash pwa/test-auth-flow.sh
#   bash pwa/test-auth-flow.sh https://qlns.hnhtravel.work   # staging

set -euo pipefail

BASE="${1:-http://localhost:5173}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'
PASS=0
FAIL=0

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $label"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label (expected=$expected, got=$actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== HNH PWA · E2E Auth Flow Test ==="
echo "Target: $BASE"
echo ""

# 0. Connectivity
echo "0. Service connectivity"
BFF_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$BASE/bff/health" 2>/dev/null || echo "000")
DJANGO_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:8000/health/" 2>/dev/null || echo "000")

if [ "$BFF_CODE" = "000" ]; then
  echo -e "  ${RED}✗${NC} BFF not reachable at $BASE/bff/health"
  echo "  Start BFF: cd pwa/bff && npm run dev"
  exit 1
fi

BFF_BODY=$(curl -s --max-time 3 "$BASE/bff/health" 2>/dev/null)
if echo "$BFF_BODY" | grep -q '"status":"ok"'; then
  echo -e "  ${GREEN}✓${NC} BFF responding at $BASE/bff/health"
  PASS=$((PASS+1))
else
  echo -e "  ${RED}✗${NC} BFF health endpoint returned unexpected response"
  echo "  Response: $BFF_BODY"
  FAIL=$((FAIL+1))
fi

check "Django at localhost:8000" "200" "$DJANGO_CODE"

# 1. /bff/auth/me without cookie → 401
echo ""
echo "1. Unauthenticated access"
ME_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$BASE/bff/auth/me" 2>/dev/null)
check "GET /bff/auth/me → 401 (no session)" "401" "$ME_CODE"

# 2. /bff/auth/login → redirect to Keycloak
echo ""
echo "2. Login redirect to Keycloak"
LOGIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 --max-redirs 0 "$BASE/bff/auth/login" 2>/dev/null || true)
check "GET /bff/auth/login → 302" "302" "$LOGIN_CODE"

LOGIN_LOC=$(curl -s -D - --max-time 3 --max-redirs 0 "$BASE/bff/auth/login" 2>/dev/null | grep -i "^location:" | head -1 | tr -d '\r')
if echo "$LOGIN_LOC" | grep -qi "sso.hnhtravel.work"; then
  echo -e "  ${GREEN}✓${NC} Redirects to Keycloak (sso.hnhtravel.work)"
  PASS=$((PASS+1))
else
  echo -e "  ${RED}✗${NC} Location header: ${LOGIN_LOC:-<empty>}"
  FAIL=$((FAIL+1))
fi

if echo "$LOGIN_LOC" | grep -q "code_challenge_method=S256"; then
  echo -e "  ${GREEN}✓${NC} PKCE S256 challenge in auth URL"
  PASS=$((PASS+1))
else
  echo -e "  ${YELLOW}?${NC} PKCE challenge not found in redirect URL"
fi

# 3. API proxy without auth → 401
echo ""
echo "3. API proxy (unauthenticated)"
API_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$BASE/bff/api/employee/me/" 2>/dev/null)
check "GET /bff/api/employee/me/ → 401" "401" "$API_CODE"

API2_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$BASE/bff/api/attendance/checking-in" 2>/dev/null)
check "GET /bff/api/attendance/checking-in → 401" "401" "$API2_CODE"

# 4. Django API directly (with JWT if provided)
echo ""
echo "4. Django API endpoints"
if [ -n "${HORILLA_JWT:-}" ]; then
  DJ_ME=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H "Authorization: Bearer $HORILLA_JWT" "http://localhost:8000/api/employee/me/" 2>/dev/null)
  check "Django /api/employee/me/ with JWT → 200" "200" "$DJ_ME"

  DJ_CLOCK=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H "Authorization: Bearer $HORILLA_JWT" "http://localhost:8000/api/attendance/checking-in" 2>/dev/null)
  check "Django /api/attendance/checking-in with JWT → 200" "200" "$DJ_CLOCK"

  DJ_LEAVE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H "Authorization: Bearer $HORILLA_JWT" "http://localhost:8000/api/leave/available-leave/" 2>/dev/null)
  check "Django /api/leave/available-leave/ with JWT → 200" "200" "$DJ_LEAVE"

  DJ_NOTIF=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H "Authorization: Bearer $HORILLA_JWT" "http://localhost:8000/api/notifications/list/all" 2>/dev/null)
  check "Django /api/notifications/list/all with JWT → 200" "200" "$DJ_NOTIF"

  DJ_TOUR=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H "Authorization: Bearer $HORILLA_JWT" "http://localhost:8000/api/tourism/schedules/" 2>/dev/null)
  check "Django /api/tourism/schedules/ with JWT → 200" "200" "$DJ_TOUR"
else
  echo -e "  ${YELLOW}!${NC} Set HORILLA_JWT for authenticated Django tests"
  echo "  Get a token: curl -X POST http://localhost:8000/api/auth/login/ -H 'Content-Type: application/json' -d '{\"username\":\"...\",\"password\":\"...\"}'"
fi

# Summary
echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
echo -e "${GREEN}All checks passed!${NC}"

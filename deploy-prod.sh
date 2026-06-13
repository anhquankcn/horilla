#!/usr/bin/env bash
# deploy-prod.sh — deploy Horilla HNH lên production server
# Chạy trên server production tại /opt/hnh/horilla
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
cd /opt/hnh/horilla

echo "=== HNH HRM Production Deploy ==="

# Symlink .env nếu chưa có
[ -L .env ] || [ -f .env ] || ln -s .env.prod .env

git fetch origin
BEFORE=$(git rev-parse HEAD)
git merge --ff-only origin/1.0
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "Already up to date, nothing to do."
  exit 0
fi

CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")
echo "$CHANGED"

REBUILD_WEB=false
REBUILD_PWA=false
REBUILD_BFF=false

echo "$CHANGED" | grep -qE '^(horilla|base|employee|attendance|leave|payroll|expenses|notifications|recruitment|onboarding|offboarding|asset|helpdesk|pms|project|training|promotion|tourism|eoffice|biometric|geofencing|horilla_api|horilla_audit|horilla_automations|horilla_backup|horilla_documents|horilla_meet|horilla_theme|horilla_views|templates|whatsapp|accessibility|Dockerfile|requirements|manage|docker/)' && REBUILD_WEB=true
echo "$CHANGED" | grep -qE '^pwa/frontend/' && REBUILD_PWA=true
echo "$CHANGED" | grep -qE '^pwa/bff/' && REBUILD_BFF=true

if $REBUILD_WEB; then
  echo "→ Django code changed → rebuild web + autoclock"
  $COMPOSE build web
  $COMPOSE up -d --no-deps web autoclock
fi

if $REBUILD_PWA; then
  echo "→ PWA frontend changed → rebuild pwa (no cache)"
  $COMPOSE build --no-cache pwa
  $COMPOSE up -d --no-deps pwa
fi

if $REBUILD_BFF; then
  echo "→ BFF changed → rebuild bff"
  $COMPOSE build bff
  $COMPOSE up -d --no-deps bff
fi

# Always restart nginx to pick up new container IPs
$COMPOSE up -d --no-deps nginx

# Run migrations
echo "Running migrations..."
$COMPOSE exec -T web python manage.py migrate --no-input

echo "=== Production deploy complete! ==="

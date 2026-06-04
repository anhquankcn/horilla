#!/usr/bin/env bash
# deploy.sh — deploy Horilla HNH lên server staging/production
# Usage:
#   ./deploy.sh          — deploy toàn bộ (web + pwa)
#   ./deploy.sh web      — chỉ rebuild web (Django)
#   ./deploy.sh pwa      — chỉ rebuild pwa (React)
#   ./deploy.sh migrate  — chỉ chạy migrate, không rebuild
set -euo pipefail

COMPOSE="sudo docker compose --env-file .env.stage -f docker-compose.stage.yml"
SERVICES="${1:-web pwa}"

cd /opt/horilla

echo "[1/4] git pull..."
sudo git pull

if [ "$SERVICES" = "migrate" ]; then
  echo "[2/4] Running migrations only..."
  $COMPOSE exec web python manage.py migrate
  echo "Done."
  exit 0
fi

echo "[2/4] Building & restarting: $SERVICES"
$COMPOSE up -d --no-deps --build $SERVICES

echo "[3/4] Running migrations..."
$COMPOSE exec -T web python manage.py migrate --no-input

echo "[4/4] Reloading nginx (pick up new container IPs)..."
sudo docker exec horilla-nginx-1 nginx -s reload

echo "Deploy done. Services: $SERVICES"

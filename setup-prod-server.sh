#!/usr/bin/env bash
# setup-prod-server.sh — Setup production server cho Horilla HNH
# Chạy 1 lần trên server production (100.99.164.24)
# Usage: bash setup-prod-server.sh
set -euo pipefail

echo "=== [1/5] Clone repo ==="
sudo mkdir -p /opt/hnh/horilla
sudo chown -R naquan:naquan /opt/hnh/horilla
cd /opt/hnh/horilla
if [ ! -d .git ]; then
  git clone https://github.com/anhquankcn/horilla.git .
  git checkout 1.0
else
  echo "Repo already cloned"
  git fetch origin
  git checkout 1.0
  git pull origin 1.0
fi

echo "=== [2/5] Create .env.prod ==="
if [ ! -f .env.prod ]; then
  cat > .env.prod << 'ENVEOF'
# === Horilla Production Environment ===
# DB
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_DB=horilla_prod
POSTGRES_USER=horilla

# Redis
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

# Django
SECRET_KEY=CHANGE_ME_DJANGO_SECRET
DEBUG=False
ALLOWED_HOSTS=qlns.hnhtravel.work,localhost

# BFF
BFF_COOKIE_SECRET=CHANGE_ME_BFF_SECRET

# Arkon integration
ARKON_BFF_URL=https://arkonbff.hnhtravel.work
ARKON_SERVICE_TOKEN=CHANGE_ME_ARKON_TOKEN
ENVEOF
  echo "Created .env.prod — EDIT SECRETS BEFORE DEPLOYING!"
else
  echo ".env.prod already exists"
fi
ln -sf .env.prod .env

echo "=== [3/5] Setup GitHub Actions self-hosted runner ==="
if [ ! -d /opt/actions-runner ]; then
  mkdir -p /opt/actions-runner && cd /opt/actions-runner
  # Download latest runner
  curl -o actions-runner-linux-x64.tar.gz -L \
    https://github.com/actions/runner/releases/download/v2.325.0/actions-runner-linux-x64-2.325.0.tar.gz
  tar xzf actions-runner-linux-x64.tar.gz
  rm actions-runner-linux-x64.tar.gz

  echo ""
  echo "============================================"
  echo "  MANUAL STEP: Configure the runner"
  echo "============================================"
  echo "1. Go to: https://github.com/anhquankcn/horilla/settings/actions/runners/new"
  echo "2. Copy the token"
  echo "3. Run: cd /opt/actions-runner && ./config.sh --url https://github.com/anhquankcn/horilla --token YOUR_TOKEN"
  echo "4. Install as service: sudo ./svc.sh install && sudo ./svc.sh start"
  echo "============================================"
else
  echo "Runner already installed at /opt/actions-runner"
fi

echo "=== [4/5] Cloudflare tunnel ingress ==="
echo ""
echo "============================================"
echo "  MANUAL STEP: Add ingress to Cloudflare tunnel"
echo "============================================"
echo "In Cloudflare Zero Trust dashboard → Tunnels → your tunnel:"
echo "  Public hostname: qlns.hnhtravel.work"
echo "  Service: http://localhost:8090"
echo "============================================"

echo "=== [5/5] First build ==="
cd /opt/hnh/horilla
echo "Run these commands after editing .env.prod:"
echo "  docker compose -f docker-compose.prod.yml build"
echo "  docker compose -f docker-compose.prod.yml up -d"
echo "  docker compose -f docker-compose.prod.yml exec -T web python manage.py migrate"
echo ""
echo "=== Setup complete! ==="

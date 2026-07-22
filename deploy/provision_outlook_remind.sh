#!/usr/bin/env bash
# Provision nhắc lịch bận Outlook: tạo M2MServiceAccount scope 'outlook:remind',
# ghi HNH_SERVICE_TOKEN vào .env.prod, restart bff để loop bật.
# Chạy trên PROD:  cd /opt/hnh/horilla && bash deploy/provision_outlook_remind.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root (/opt/hnh/horilla)

ENV_FILE=".env.prod"
[ -f "$ENV_FILE" ] || { echo "❌ Không thấy $ENV_FILE"; exit 1; }

# 1) Tạo/cập nhật service account + lấy token (token chỉ ghi ra file tạm, không in).
cat > /tmp/_prov_outlook.py <<'PY'
from base.models import M2MServiceAccount
raw = M2MServiceAccount.generate_token()
M2MServiceAccount.objects.update_or_create(
    slug="bff-outlook-remind",
    defaults={
        "name": "BFF Outlook Reminder",
        "description": "BFF poll Graph -> nhac lich ban truoc 15 phut",
        "token_hash": M2MServiceAccount.hash_token(raw),
        "token_prefix": raw[:12],
        "scopes": ["outlook:remind"],
        "allowed_cidrs": [],
        "status": "active",
    },
)
open("/tmp/_sa_token", "w").write(raw)
print("service account OK (slug=bff-outlook-remind, scope=outlook:remind)")
PY
docker exec -i horilla-web-1 python manage.py shell < /tmp/_prov_outlook.py
TOKEN="$(cat /tmp/_sa_token)"
rm -f /tmp/_prov_outlook.py /tmp/_sa_token

# 2) Ghi HNH_SERVICE_TOKEN vào .env.prod (idempotent).
grep -v '^HNH_SERVICE_TOKEN=' "$ENV_FILE" > "${ENV_FILE}.tmp" || true
echo "HNH_SERVICE_TOKEN=${TOKEN}" >> "${ENV_FILE}.tmp"
mv "${ENV_FILE}.tmp" "$ENV_FILE"
echo "✅ Đã ghi HNH_SERVICE_TOKEN vào $ENV_FILE (prefix ${TOKEN:0:12}...)"

# 3) Restart bff để nạp token + bật loop.
docker compose -f docker-compose.prod.yml up -d bff
sleep 4
echo "--- bff log (mong thấy 'Meeting reminder loop bật') ---"
docker logs horilla-bff-1 2>&1 | grep -iE "meeting reminder" | tail -2 || true

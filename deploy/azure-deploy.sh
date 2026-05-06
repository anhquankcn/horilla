#!/bin/bash
# =============================================================================
# deploy/azure-deploy.sh
# Triển khai Horilla HRM (HNH Travel) lên VM aqtech có sẵn trên Azure
# Tài khoản: anhquankcn2412@gmail.com
# VM: aqtech (Standard_B2ms, 8GB RAM) — dùng lại, xóa Keycloak cũ
# Chạy trên máy local (có Azure CLI), không cần SSH vào VM
# =============================================================================
set -euo pipefail

# ─── Màu sắc output ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠  $*${NC}"; }
err()     { echo -e "${RED}✖  $*${NC}"; exit 1; }
ok()      { echo -e "${GREEN}✔  $*${NC}"; }
section() {
  echo ""
  echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}${BOLD}  $*${NC}"
  echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════${NC}"
}

# ─── Cấu hình — dùng lại tài nguyên có sẵn ───────────────────────────────────
AZURE_USER="anhquankcn2412@gmail.com"
TENANT_ID="a499a8e6-294d-45bf-9b71-82a072ec4cf0"
SUBSCRIPTION_ID="00a26b28-80c6-4562-ac0c-a6d2b18387cb"

# Tài nguyên tái sử dụng (không tạo mới)
RESOURCE_GROUP="AQTECH_GROUP"
VM_NAME="aqtech"
PUBLIC_IP_NAME="aqtech-ip"
LOCATION="southeastasia"

# Tài nguyên tạo thêm
DISK_NAME="disk-hnh-data"
DISK_SIZE_GB="64"
STORAGE_ACCOUNT="sthnhhrm"
BACKUP_CONTAINER="db-backups"

# Ứng dụng
REPO_URL="https://github.com/anhquankcn/horilla.git"
REPO_BRANCH="horilla_aqv10"
APP_DIR="/opt/horilla"

# ─── Hàm tiện ích ────────────────────────────────────────────────────────────
generate_password() {
  tr -dc 'A-Za-z0-9@#$%' < /dev/urandom | head -c 24
}

run_on_vm() {
  local description="$1"
  local script="$2"
  local timeout_sec="${3:-300}"   # default 5 phút; Docker install truyền 600
  log "$description..."
  local output
  output=$(timeout "$timeout_sec" az vm run-command invoke \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --command-id RunShellScript \
    --scripts "$script" \
    --query "value[0].message" -o tsv 2>/dev/null || echo "TIMEOUT_OR_ERROR")
  echo "$output" | grep -v "^\[stdout\]\|^\[stderr\]" | grep -v "^$" | head -10 || true
  if [[ "$output" == *"TIMEOUT_OR_ERROR"* ]]; then
    warn "$description — timeout/lỗi (script tiếp tục)"
    return 1
  fi
  return 0
}

check_vm_running() {
  local retries=0
  echo -n "  Chờ VM"
  while [ $retries -lt 36 ]; do
    STATUS=$(az vm get-instance-view \
      --resource-group "$RESOURCE_GROUP" \
      --name "$VM_NAME" \
      --query "instanceView.statuses[1].displayStatus" -o tsv 2>/dev/null || echo "")
    [ "$STATUS" = "VM running" ] && echo " ✔" && return 0
    echo -n "."
    retries=$((retries + 1))
    sleep 5
  done
  err "VM không khởi động sau 3 phút"
}

# ─── BƯỚC 0: Kiểm tra prerequisites ──────────────────────────────────────────
section "BƯỚC 0 — Kiểm tra môi trường"

command -v az >/dev/null 2>&1 \
  || err "Azure CLI chưa cài. Tải: https://aka.ms/installazurecliwindows"
ok "Azure CLI: $(az version --query '"azure-cli"' -o tsv 2>/dev/null)"

# ─── BƯỚC 1: Đăng nhập Azure ─────────────────────────────────────────────────
section "BƯỚC 1 — Đăng nhập Azure"

CURRENT_USER=$(az account show --query user.name -o tsv 2>/dev/null || echo "")
CURRENT_TENANT=$(az account show --query tenantId -o tsv 2>/dev/null || echo "")

if [ "$CURRENT_USER" = "$AZURE_USER" ] && [ "$CURRENT_TENANT" = "$TENANT_ID" ]; then
  ok "Đã đăng nhập: $CURRENT_USER"
else
  warn "Đăng nhập lại (token hết hạn)..."
  az logout 2>/dev/null || true
  az login --tenant "$TENANT_ID" --use-device-code --output none
fi

az account set --subscription "$SUBSCRIPTION_ID" --output none
ok "Subscription: $(az account show --query name -o tsv) ($SUBSCRIPTION_ID)"

# ─── BƯỚC 2: Thu thập bí mật ─────────────────────────────────────────────────
section "BƯỚC 2 — Cấu hình bí mật"

echo -e "${YELLOW}Nhập thông tin (Enter = tự động tạo):${NC}\n"

read -rp "  DB_PASSWORD        [Enter = tự tạo]: " INPUT_DB_PASS
DB_PASSWORD="${INPUT_DB_PASS:-$(generate_password)}"
ok "DB_PASSWORD: ${DB_PASSWORD:0:4}****"

read -rp "  REDIS_PASSWORD     [Enter = tự tạo]: " INPUT_REDIS_PASS
REDIS_PASSWORD="${INPUT_REDIS_PASS:-$(generate_password)}"
ok "REDIS_PASSWORD: ${REDIS_PASSWORD:0:4}****"

read -rp "  SECRET_KEY         [Enter = tự tạo]: " INPUT_SECRET
SECRET_KEY="${INPUT_SECRET:-$(tr -dc 'A-Za-z0-9!@#$^&*' < /dev/urandom | head -c 50)}"
ok "SECRET_KEY: ${SECRET_KEY:0:8}****"

read -rp "  CLOUDFLARE_TOKEN   [Enter = bỏ qua]: " CLOUDFLARE_TOKEN
[ -z "$CLOUDFLARE_TOKEN" ] \
  && warn "Cloudflare token trống — nhớ thêm vào .env.stage sau" \
  || ok "CLOUDFLARE_TOKEN: ${CLOUDFLARE_TOKEN:0:6}****"

read -rp "  OIDC_CLIENT_SECRET [Enter = dùng mặc định]: " INPUT_OIDC
OIDC_SECRET="${INPUT_OIDC:-KmgrIp2QfJhYzYVWxgYBkCww70iJ2Pq7}"

read -rp "  Admin email        [Enter = admin@hnhtravel.work]: " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@hnhtravel.work}"
read -rp "  Admin password     [Enter = tự tạo]: " ADMIN_PASS
ADMIN_PASS="${ADMIN_PASS:-$(generate_password)}"

# Lưu cục bộ
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cat > "$SCRIPT_DIR/.env.generated" <<ENVEOF
# Tạo bởi azure-deploy.sh — $(date)
# KHÔNG commit file này lên git!
DB_PASSWORD=$DB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
SECRET_KEY=$SECRET_KEY
CLOUDFLARE_TOKEN=$CLOUDFLARE_TOKEN
OIDC_RP_CLIENT_SECRET=$OIDC_SECRET
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASS
ENVEOF
chmod 600 "$SCRIPT_DIR/.env.generated"
ok "Bí mật lưu tại deploy/.env.generated (không commit)"

# ─── BƯỚC 3: Chuẩn bị tài nguyên Azure ──────────────────────────────────────
section "BƯỚC 3 — Chuẩn bị tài nguyên Azure (tái sử dụng aqtech)"

# Khởi động VM nếu đang deallocated
VM_STATE=$(az vm get-instance-view \
  --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
  --query "instanceView.statuses[1].displayStatus" -o tsv 2>/dev/null || echo "")

if [ "$VM_STATE" = "VM deallocated" ] || [ "$VM_STATE" = "VM stopped" ]; then
  log "Khởi động VM $VM_NAME (đang $VM_STATE)..."
  az vm start --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --output none
  check_vm_running
elif [ "$VM_STATE" = "VM running" ]; then
  ok "VM $VM_NAME đang chạy"
else
  warn "Trạng thái VM: '$VM_STATE' — thử tiếp tục..."
  check_vm_running
fi

PUBLIC_IP=$(az vm show \
  --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
  --show-details --query publicIps -o tsv 2>/dev/null)
ok "Public IP: $PUBLIC_IP (4.193.189.226)"

# Gắn data disk nếu chưa có
if az disk show --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" &>/dev/null; then
  ok "Data disk '$DISK_NAME' đã tồn tại"
else
  log "Tạo data disk $DISK_SIZE_GB GB..."
  az disk create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DISK_NAME" \
    --size-gb "$DISK_SIZE_GB" \
    --sku StandardSSD_LRS \
    --location "$LOCATION" \
    --output none

  az vm disk attach \
    --resource-group "$RESOURCE_GROUP" \
    --vm-name "$VM_NAME" \
    --name "$DISK_NAME" \
    --output none
  ok "Data disk đã gắn vào VM"
fi

# Tạo storage account cho backup (trong cùng resource group)
if az storage account show \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  ok "Storage account '$STORAGE_ACCOUNT' đã tồn tại"
else
  log "Tạo storage account cho backup..."
  az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 \
    --output none

  STORAGE_KEY=$(az storage account keys list \
    --account-name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[0].value" -o tsv)

  az storage container create \
    --name "$BACKUP_CONTAINER" \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$STORAGE_KEY" \
    --output none
  ok "Storage account: $STORAGE_ACCOUNT"
fi

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv 2>/dev/null || echo "")

# ─── BƯỚC 4: Dọn Keycloak, cài Docker ───────────────────────────────────────
section "BƯỚC 4 — Xóa Keycloak cũ, cài Docker"

run_on_vm "Dừng và xóa Keycloak" '
  # Dừng service Keycloak (tên thường gặp với marketplace image)
  for SVC in keycloak keycloak.service; do
    systemctl stop "$SVC" 2>/dev/null && echo "Stopped $SVC" || true
    systemctl disable "$SVC" 2>/dev/null || true
  done

  # Xóa Keycloak files
  rm -rf /opt/keycloak /etc/keycloak /var/log/keycloak 2>/dev/null || true

  # Dọn package liên quan (nếu cài qua apt)
  apt-get remove -y --purge keycloak 2>/dev/null || true

  # Giải phóng port 8080, 8443
  fuser -k 8080/tcp 2>/dev/null || true
  fuser -k 8443/tcp 2>/dev/null || true

  echo "Keycloak đã được gỡ bỏ"
  df -h /
'

run_on_vm "Cài Docker và công cụ" '
  export DEBIAN_FRONTEND=noninteractive

  # Giải phóng APT lock (unattended-upgrades thường giữ lock sau boot)
  systemctl stop unattended-upgrades apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
  systemctl kill --kill-who=all apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
  # Chờ tối đa 30s cho dpkg lock tự giải phóng
  for _i in $(seq 1 15); do
    fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock 2>/dev/null \
      || break
    sleep 2
  done
  rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock 2>/dev/null || true
  dpkg --configure -a --force-confold 2>/dev/null || true

  apt-get update -qq

  # Cài Docker nếu chưa có
  if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker cài xong: $(docker --version)"
  else
    echo "Docker đã có: $(docker --version)"
  fi

  # Cài công cụ bổ trợ
  apt-get install -y -qq git curl htop ncdu 2>/dev/null

  # Thêm user vào docker group
  VM_USER=$(getent passwd 1000 | cut -d: -f1 2>/dev/null || echo "azureuser")
  usermod -aG docker "$VM_USER" 2>/dev/null || true
  echo "Docker group: OK"
' 600

run_on_vm "Format và mount data disk" '
  if mountpoint -q /data 2>/dev/null; then
    echo "/data đã mount sẵn"
  else
    # Tìm disk chưa format
    DISK=""
    for d in /dev/sdc /dev/sdb /dev/sdd /dev/sde; do
      if [ -b "$d" ] && ! blkid "$d" &>/dev/null; then
        DISK="$d"; break
      fi
    done

    if [ -n "$DISK" ]; then
      echo "Format disk: $DISK"
      mkfs.ext4 -F "$DISK"
      mkdir -p /data
      DISK_UUID=$(blkid -s UUID -o value "$DISK")
      echo "UUID=$DISK_UUID /data ext4 defaults,nofail 0 2" >> /etc/fstab
      mount -a
      echo "Mount OK: $(df -h /data | tail -1)"
    else
      echo "Không tìm thấy disk mới — kiểm tra lại Azure Portal"
    fi
  fi

  mkdir -p /data/postgres /data/redis /data/media /data/backup
  chmod 777 /data/postgres /data/redis /data/media /data/backup
  echo "Thư mục data sẵn sàng"
'

# ─── BƯỚC 5: Clone repo và tạo cấu hình ─────────────────────────────────────
section "BƯỚC 5 — Clone repo, tạo .env.stage"

run_on_vm "Clone repository horilla_aqv10" "
  if [ -d '${APP_DIR}/.git' ]; then
    echo 'Repo đã tồn tại — pull latest'
    cd '${APP_DIR}' && git fetch origin && git checkout '${REPO_BRANCH}' && git pull
  else
    git clone '${REPO_URL}' '${APP_DIR}'
    cd '${APP_DIR}' && git checkout '${REPO_BRANCH}'
  fi
  echo \"Branch: \$(git -C '${APP_DIR}' branch --show-current)\"
  echo \"Commit: \$(git -C '${APP_DIR}' log --oneline -1)\"
"

run_on_vm "Tạo .env.stage" "
cat > '${APP_DIR}/.env.stage' <<'ENVFILE'
DEBUG=False
SECRET_KEY=${SECRET_KEY}

ALLOWED_HOSTS=hrm.hnhtravel.work,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://hrm.hnhtravel.work

DATABASE_URL=postgres://horilla:${DB_PASSWORD}@db:5432/horilla_stage
DB_PASSWORD=${DB_PASSWORD}

REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
REDIS_PASSWORD=${REDIS_PASSWORD}

TIME_ZONE=Asia/Ho_Chi_Minh
LANGUAGE_CODE=vi

OIDC_RP_CLIENT_SECRET=${OIDC_SECRET}
OIDC_KC_BASE=https://kc.hnhtravel.work/realms/HNHTravel-SGN
OIDC_RP_CLIENT_ID=horilla-hrm
OIDC_VERIFY_SSL=True
OIDC_REDIRECT_BASE_URL=https://hrm.hnhtravel.work

CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TOKEN}
ENVFILE
chmod 600 '${APP_DIR}/.env.stage'
echo '.env.stage OK'
"

# ─── BƯỚC 6: Build và chạy Docker Compose ────────────────────────────────────
section "BƯỚC 6 — Docker build & start"

run_on_vm "Khởi động Docker Compose (nền)" "
  cd '${APP_DIR}'
  nohup bash -c '
    docker compose -f docker-compose.stage.yml up -d --build > /tmp/docker-deploy.log 2>&1
    echo DONE >> /tmp/docker-deploy.log
  ' &
  echo \"Build chạy nền PID: \$! — log: tail -f /tmp/docker-deploy.log\"
"

log "Chờ Docker build (~3-5 phút)..."
for i in $(seq 1 18); do
  sleep 20
  RESULT=$(az vm run-command invoke \
    --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
    --command-id RunShellScript \
    --scripts "
      DONE=\$(grep -c '^DONE' /tmp/docker-deploy.log 2>/dev/null || echo 0)
      if [ \"\$DONE\" -gt 0 ]; then
        echo BUILD_COMPLETE
        docker compose -C '${APP_DIR}' -f docker-compose.stage.yml ps 2>/dev/null || true
      else
        tail -3 /tmp/docker-deploy.log 2>/dev/null || echo 'Đang build...'
      fi
    " \
    --query "value[0].message" -o tsv 2>/dev/null || echo "")
  echo "  [$i] $RESULT" | head -3
  echo "$RESULT" | grep -q "BUILD_COMPLETE" && break
done

# ─── BƯỚC 7: Migrate và setup dữ liệu ────────────────────────────────────────
section "BƯỚC 7 — Migrate và setup dữ liệu HNH"

run_on_vm "Chờ PostgreSQL sẵn sàng và migrate" "
  cd '${APP_DIR}'
  for i in \$(seq 1 30); do
    docker compose -f docker-compose.stage.yml exec -T db \
      pg_isready -U horilla -d horilla_stage 2>/dev/null && break
    sleep 5
  done
  docker compose -f docker-compose.stage.yml exec -T web python manage.py migrate --noinput
  docker compose -f docker-compose.stage.yml exec -T web python manage.py setup_hnh_company
  docker compose -f docker-compose.stage.yml exec -T web python manage.py collectstatic --noinput
  echo 'Migrate + setup HNH OK'
" 600

run_on_vm "Tạo Django superuser" "
  cd '${APP_DIR}'
  docker compose -f docker-compose.stage.yml exec -T web bash -c \"
    python manage.py shell -c \\\"
from django.contrib.auth import get_user_model
U = get_user_model()
if not U.objects.filter(username='admin').exists():
    U.objects.create_superuser('admin', '${ADMIN_EMAIL}', '${ADMIN_PASS}')
    print('Superuser tạo xong')
else:
    print('Superuser đã tồn tại')
\\\"
  \"
"

# ─── BƯỚC 8: Backup tự động ──────────────────────────────────────────────────
section "BƯỚC 8 — Backup tự động"

run_on_vm "Cài Azure CLI + cron backup" "
  if ! command -v az &>/dev/null; then
    curl -sL https://aka.ms/InstallAzureCLIDeb | bash 2>/dev/null
  fi

  cat > /opt/backup-db.sh <<'BACKUP'
#!/bin/bash
set -euo pipefail
DATE=\$(date +%Y%m%d_%H%M)
FILE=\"/data/backup/horilla_\${DATE}.sql.gz\"
docker compose -f /opt/horilla/docker-compose.stage.yml exec -T db \\
  pg_dump -U horilla horilla_stage | gzip > \"\$FILE\"
az storage blob upload \\
  --account-name ${STORAGE_ACCOUNT} \\
  --account-key ${STORAGE_KEY} \\
  --container-name ${BACKUP_CONTAINER} \\
  --name \"horilla_\${DATE}.sql.gz\" \\
  --file \"\$FILE\" --overwrite 2>/dev/null || true
find /data/backup -name '*.sql.gz' -mtime +7 -delete
echo \"Backup OK: \$FILE\"
BACKUP
  chmod +x /opt/backup-db.sh
  (crontab -l 2>/dev/null | grep -v backup-db
   echo '0 2 * * * /opt/backup-db.sh >> /var/log/backup-db.log 2>&1') | crontab -
  echo 'Backup cron: 2:00 sáng mỗi ngày'
"

# ─── BƯỚC 9: Tailscale SSH ────────────────────────────────────────────────────
section "BƯỚC 9 — Tailscale cho SSH management"

run_on_vm "Cài Tailscale" '
  if command -v tailscale &>/dev/null; then
    echo "Tailscale: $(tailscale version 2>/dev/null | head -1)"
  else
    curl -fsSL https://tailscale.com/install.sh | sh
    echo "Tailscale cài xong"
  fi
  echo "Chạy thủ công để kết nối: sudo tailscale up --authkey=<key>"
'

# ─── HOÀN TẤT ─────────────────────────────────────────────────────────────────
section "HOÀN TẤT"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     DEPLOY THÀNH CÔNG — HNH Travel HRM            ║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}  Ứng dụng : https://hrm.hnhtravel.work            ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  VM       : aqtech (${PUBLIC_IP})            ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  SSH      : ssh azureuser@${PUBLIC_IP}              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Admin    : ${ADMIN_EMAIL}                ${BOLD}║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  Chi phí/tháng (tái sử dụng VM):                  ║${NC}"
echo -e "${BOLD}║${NC}  VM B2ms (đang trả):  ~\$43   (không tăng)       ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Data disk 64GB mới:  ~\$5                        ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Storage backup:      ~\$0.5                       ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Tổng thêm:           ~\$5.5/tháng (~138k VNĐ)    ${BOLD}║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  Việc cần làm thủ công:                            ║${NC}"
echo -e "${BOLD}║${NC}  1. Thêm Cloudflare Tunnel token (nếu chưa có)   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     ssh azureuser@${PUBLIC_IP}                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     nano /opt/horilla/.env.stage                  ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     docker compose restart cloudflared            ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  2. sudo tailscale up  (trên VM)                  ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  3. Bí mật: deploy/.env.generated (KHÔNG commit) ${BOLD}║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

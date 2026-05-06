#!/bin/bash
# =============================================================================
# deploy/azure-deploy.sh
# Triển khai Horilla HRM (HNH Travel) lên VM hnhstage đã có sẵn
# Tài khoản Azure: anhquankcn2412@gmail.com
# VM: hnhstage · Resource group: hnhwork · IP: 13.67.32.245
# SSH user: naquan · Key: D:\HNH2026\Cloud\*.pem
# Chạy từ Git Bash hoặc WSL trên Windows
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

# ─── Cấu hình ─────────────────────────────────────────────────────────────────
AZURE_USER="anhquankcn2412@gmail.com"
TENANT_ID="a499a8e6-294d-45bf-9b71-82a072ec4cf0"
SUBSCRIPTION_ID="00a26b28-80c6-4562-ac0c-a6d2b18387cb"

RESOURCE_GROUP="hnhwork"
VM_NAME="hnhstage"
PUBLIC_IP="13.67.32.245"         # Azure public IP (chỉ để hiển thị)
SSH_HOST="100.88.75.106"          # Tailscale IP — dùng cho SSH
ADMIN_USER="naquan"
LOCATION="southeastasia"

# Key .pem (Git Bash path: D:\HNH2026\Cloud\naquan.pem → /d/HNH2026/Cloud/naquan.pem)
SSH_KEY="/d/HNH2026/Cloud/naquan.pem"

# Data disk & backup
DISK_NAME="disk-hnh-data"
DISK_SIZE_GB="64"
STORAGE_ACCOUNT="sthnhhrm"
BACKUP_CONTAINER="db-backups"

# Ứng dụng
REPO_URL="https://github.com/anhquankcn/horilla.git"
REPO_BRANCH="horilla_aqv10"
APP_DIR="/opt/horilla"

# ─── Hàm tiện ích ─────────────────────────────────────────────────────────────
generate_password() {
  tr -dc 'A-Za-z0-9@#$%' < /dev/urandom | head -c 24
}

# Chạy script trên VM qua SSH
# $1 = mô tả, $2 = script bash, $3 = timeout giây (mặc định 300)
run_on_vm() {
  local description="$1"
  local script="$2"
  local timeout_sec="${3:-300}"
  log "$description..."
  echo "$script" | timeout "$timeout_sec" ssh \
    -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=30 \
    -o BatchMode=yes \
    "${ADMIN_USER}@${SSH_HOST}" \
    "sudo bash -s"
}

# ─── BƯỚC 0: Kiểm tra prerequisites ──────────────────────────────────────────
section "BƯỚC 0 — Kiểm tra môi trường"

command -v az >/dev/null 2>&1 \
  || err "Azure CLI chưa cài. Tải: https://aka.ms/installazurecliwindows"
ok "Azure CLI: $(az version --query '"azure-cli"' -o tsv 2>/dev/null)"

command -v ssh >/dev/null 2>&1 || err "ssh không tìm thấy trong PATH"
ok "SSH: $(ssh -V 2>&1 | head -1)"

# Kiểm tra file key tồn tại
if [ ! -f "$SSH_KEY" ]; then
  err "Không tìm thấy file key: $SSH_KEY\nKiểm tra lại đường dẫn SSH_KEY ở đầu script"
fi
chmod 600 "$SSH_KEY" 2>/dev/null || true
ok "SSH key: $SSH_KEY"

# Kiểm tra kết nối SSH đến VM
log "Kiểm tra kết nối SSH qua Tailscale ($SSH_HOST)..."
if ! timeout 15 ssh \
    -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=10 \
    -o BatchMode=yes \
    "${ADMIN_USER}@${SSH_HOST}" \
    "echo SSH_OK" 2>/dev/null | grep -q "SSH_OK"; then
  err "Không kết nối được SSH: ${ADMIN_USER}@${SSH_HOST}\nKiểm tra Tailscale đang chạy trên cả 2 máy"
fi
ok "SSH đến hnhstage OK"

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
ok "Subscription: $(az account show --query name -o tsv)"

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
VM_PUBLIC_IP=$PUBLIC_IP
SSH_CMD=ssh -i "$SSH_KEY" ${ADMIN_USER}@${SSH_HOST}
ENVEOF
chmod 600 "$SCRIPT_DIR/.env.generated"
ok "Bí mật lưu tại deploy/.env.generated (không commit)"

# ─── BƯỚC 3: Gắn data disk (Azure CLI) ───────────────────────────────────────
section "BƯỚC 3 — Data disk 64GB"

# Kiểm tra resource group hnhwork có tồn tại không
az group show --name "$RESOURCE_GROUP" --output none 2>/dev/null \
  || err "Resource group '$RESOURCE_GROUP' không tồn tại. Kiểm tra lại Azure Portal."

if az disk show --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" &>/dev/null; then
  ATTACHED=$(az disk show \
    --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" \
    --query "managedBy" -o tsv 2>/dev/null || echo "")
  if [ -n "$ATTACHED" ] && [[ "$ATTACHED" == *"$VM_NAME"* ]]; then
    ok "Data disk '$DISK_NAME' đã gắn vào $VM_NAME"
  elif [ -n "$ATTACHED" ]; then
    warn "Data disk đang gắn vào VM khác — tạo disk mới: disk-hnh-data-2"
    DISK_NAME="disk-hnh-data-2"
    az disk create \
      --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" \
      --size-gb "$DISK_SIZE_GB" --sku StandardSSD_LRS \
      --location "$LOCATION" --output none
    az vm disk attach \
      --resource-group "$RESOURCE_GROUP" --vm-name "$VM_NAME" \
      --name "$DISK_NAME" --output none
    ok "Data disk $DISK_NAME gắn OK"
  else
    log "Gắn disk $DISK_NAME vào $VM_NAME..."
    az vm disk attach \
      --resource-group "$RESOURCE_GROUP" --vm-name "$VM_NAME" \
      --name "$DISK_NAME" --output none
    ok "Data disk gắn OK"
  fi
else
  log "Tạo data disk $DISK_SIZE_GB GB ($DISK_NAME)..."
  az disk create \
    --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" \
    --size-gb "$DISK_SIZE_GB" --sku StandardSSD_LRS \
    --location "$LOCATION" --output none
  az vm disk attach \
    --resource-group "$RESOURCE_GROUP" --vm-name "$VM_NAME" \
    --name "$DISK_NAME" --output none
  ok "Data disk tạo và gắn OK"
fi

# ─── BƯỚC 4: Storage account backup (Azure CLI) ───────────────────────────────
section "BƯỚC 4 — Storage account backup"

if az storage account show \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  ok "Storage account '$STORAGE_ACCOUNT' đã tồn tại"
else
  log "Tạo storage account $STORAGE_ACCOUNT..."
  az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 \
    --output none

  STORAGE_KEY_TMP=$(az storage account keys list \
    --account-name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[0].value" -o tsv)

  az storage container create \
    --name "$BACKUP_CONTAINER" \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$STORAGE_KEY_TMP" \
    --output none
  ok "Storage account $STORAGE_ACCOUNT OK"
fi

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv 2>/dev/null || echo "")

# ─── BƯỚC 5: Cài Docker, mount data disk ─────────────────────────────────────
section "BƯỚC 5 — Cài Docker & mount data disk"

run_on_vm "Giải phóng APT lock, cài Docker" '
  export DEBIAN_FRONTEND=noninteractive

  # Dừng unattended-upgrades (giữ dpkg lock sau boot)
  systemctl stop unattended-upgrades apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
  systemctl kill --kill-who=all apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
  for _i in $(seq 1 15); do
    fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock \
      2>/dev/null || break
    sleep 2
  done
  rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock 2>/dev/null || true
  dpkg --configure -a --force-confold 2>/dev/null || true

  apt-get update -qq
  apt-get install -y -qq git curl htop ncdu fuse

  if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
  fi
  echo "Docker: $(docker --version)"
  usermod -aG docker naquan 2>/dev/null || true
  echo "Docker setup OK"
' 600

run_on_vm "Format và mount data disk tại /data" '
  if mountpoint -q /data 2>/dev/null; then
    echo "/data đã mount — bỏ qua"
  else
    DISK=""
    for d in /dev/sdc /dev/sdb /dev/sdd /dev/sde; do
      if [ -b "$d" ] && ! blkid "$d" &>/dev/null; then
        DISK="$d"; break
      fi
    done

    if [ -n "$DISK" ]; then
      echo "Format $DISK → ext4"
      mkfs.ext4 -F "$DISK"
      mkdir -p /data
      UUID=$(blkid -s UUID -o value "$DISK")
      echo "UUID=$UUID /data ext4 defaults,nofail 0 2" >> /etc/fstab
      mount -a
      echo "Mount OK: $(df -h /data | tail -1)"
    else
      echo "Không tìm thấy disk chưa format:"
      lsblk
    fi
  fi

  mkdir -p /data/postgres /data/redis /data/media /data/backup
  chmod 777 /data/postgres /data/redis /data/media /data/backup
  echo "/data sẵn sàng"
'

# ─── BƯỚC 6: Clone repo và tạo .env.stage ────────────────────────────────────
section "BƯỚC 6 — Clone repo, tạo .env.stage"

run_on_vm "Clone repository $REPO_BRANCH" "
  if [ -d '${APP_DIR}/.git' ]; then
    echo 'Repo tồn tại — pull latest'
    cd '${APP_DIR}' && git fetch origin && git checkout '${REPO_BRANCH}' && git pull
  else
    git clone '${REPO_URL}' '${APP_DIR}'
    cd '${APP_DIR}' && git checkout '${REPO_BRANCH}'
  fi
  echo \"Branch: \$(git -C '${APP_DIR}' branch --show-current)\"
  echo \"Commit:  \$(git -C '${APP_DIR}' log --oneline -1)\"
"

run_on_vm "Tạo .env.stage" "
cat > '${APP_DIR}/.env.stage' << 'ENVFILE'
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

# ─── BƯỚC 7: Docker build & start ────────────────────────────────────────────
section "BƯỚC 7 — Docker build & start"

run_on_vm "Khởi động Docker Compose (nền)" "
  cd '${APP_DIR}'
  rm -f /tmp/docker-deploy.log
  nohup bash -c '
    docker compose -f docker-compose.stage.yml up -d --build \
      > /tmp/docker-deploy.log 2>&1
    echo DONE >> /tmp/docker-deploy.log
  ' &
  disown
  echo \"Build bắt đầu (PID \$!) — theo dõi: tail -f /tmp/docker-deploy.log\"
"

log "Chờ Docker build (tối đa 10 phút)..."
for i in $(seq 1 30); do
  sleep 20
  RESULT=$(timeout 30 ssh \
    -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=10 \
    -o BatchMode=yes \
    "${ADMIN_USER}@${SSH_HOST}" \
    "sudo bash -s" <<'POLL' 2>/dev/null || echo "polling...")
if grep -q '^DONE' /tmp/docker-deploy.log 2>/dev/null; then
  echo "BUILD_COMPLETE"
  cd /opt/horilla && docker compose -f docker-compose.stage.yml ps 2>/dev/null | head -10
elif grep -qi 'error\|failed' /tmp/docker-deploy.log 2>/dev/null; then
  echo "BUILD_ERROR"
  tail -5 /tmp/docker-deploy.log
else
  LINES=$(wc -l < /tmp/docker-deploy.log 2>/dev/null || echo 0)
  echo "Building... [${LINES} lines]"
  tail -2 /tmp/docker-deploy.log 2>/dev/null || echo "Starting..."
fi
POLL

  echo "  [$i/30] $RESULT"
  echo "$RESULT" | grep -q "BUILD_COMPLETE" && break
  echo "$RESULT" | grep -q "BUILD_ERROR" \
    && warn "Build lỗi — SSH vào VM kiểm tra: tail -f /tmp/docker-deploy.log" \
    && break
done

# ─── BƯỚC 8: Migrate và setup dữ liệu ────────────────────────────────────────
section "BƯỚC 8 — Migrate, setup dữ liệu HNH"

run_on_vm "Chờ PostgreSQL và migrate" "
  cd '${APP_DIR}'
  for i in \$(seq 1 30); do
    docker compose -f docker-compose.stage.yml exec -T db \
      pg_isready -U horilla -d horilla_stage 2>/dev/null && break
    echo \"Chờ DB... (\$i/30)\"; sleep 5
  done
  docker compose -f docker-compose.stage.yml exec -T web \
    python manage.py migrate --noinput
  docker compose -f docker-compose.stage.yml exec -T web \
    python manage.py setup_hnh_company
  docker compose -f docker-compose.stage.yml exec -T web \
    python manage.py collectstatic --noinput
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

# ─── BƯỚC 9: Backup tự động ──────────────────────────────────────────────────
section "BƯỚC 9 — Backup tự động"

run_on_vm "Cài Azure CLI + cron backup 2:00 sáng" "
  if ! command -v az &>/dev/null; then
    curl -sL https://aka.ms/InstallAzureCLIDeb | bash 2>/dev/null
  fi

  cat > /opt/backup-db.sh << 'BACKUP'
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
  echo 'Cron backup: 2:00 sáng mỗi ngày'
" 600

# ─── BƯỚC 10: Tailscale ───────────────────────────────────────────────────────
section "BƯỚC 10 — Tailscale cho SSH management"

run_on_vm "Cài Tailscale" '
  if command -v tailscale &>/dev/null; then
    echo "Tailscale: $(tailscale version 2>/dev/null | head -1)"
  else
    curl -fsSL https://tailscale.com/install.sh | sh
    echo "Tailscale cài xong"
  fi
  echo "Kết nối: sudo tailscale up --authkey=<key>"
'

# ─── HOÀN TẤT ─────────────────────────────────────────────────────────────────
section "HOÀN TẤT"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     DEPLOY THÀNH CÔNG — HNH Travel HRM              ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}  Ứng dụng : https://hrm.hnhtravel.work               ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  VM       : hnhstage ($PUBLIC_IP)                ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  SSH      : ssh -i $SSH_KEY ${ADMIN_USER}@${SSH_HOST}   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Admin    : $ADMIN_EMAIL                         ${BOLD}║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  Việc cần làm thủ công sau deploy:                   ║${NC}"
echo -e "${BOLD}║${NC}  1. Cloudflare Zero Trust → Tunnels → Public Hostname ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     hrm.hnhtravel.work → nginx:80                ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  2. Nếu CLOUDFLARE_TOKEN trống:                   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     ssh → nano /opt/horilla/.env.stage            ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     → docker compose restart cloudflared          ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  3. sudo tailscale up --authkey=<key>  (trên VM) ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  4. Bí mật: deploy/.env.generated (KHÔNG commit) ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

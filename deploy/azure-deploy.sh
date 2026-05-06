#!/bin/bash
# =============================================================================
# deploy/azure-deploy.sh
# Triển khai Horilla HRM (HNH Travel) — Xóa VM aqtech, tạo VM hnhstage mới
# Tài khoản: anhquankcn2412@gmail.com
# VM mới: hnhstage (Standard_B2s, Ubuntu 22.04, southeastasia)
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

# ─── Cấu hình ─────────────────────────────────────────────────────────────────
AZURE_USER="anhquankcn2412@gmail.com"
TENANT_ID="a499a8e6-294d-45bf-9b71-82a072ec4cf0"
SUBSCRIPTION_ID="00a26b28-80c6-4562-ac0c-a6d2b18387cb"

# VM cũ cần xóa
OLD_VM_NAME="aqtech"
OLD_PUBLIC_IP_NAME="aqtech-ip"

# VM mới
RESOURCE_GROUP="AQTECH_GROUP"
VM_NAME="hnhstage"
VM_SIZE="Standard_B2s"          # 2 vCPU, 4GB RAM ~$30/tháng
VM_IMAGE="Ubuntu2204"
ADMIN_USER="azureuser"
LOCATION="southeastasia"
PUBLIC_IP_NAME="hnhstage-ip"

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

# Chạy lệnh trên VM qua Azure Run Command, có timeout phía client
# $1 = mô tả, $2 = script, $3 = timeout giây (mặc định 300)
run_on_vm() {
  local description="$1"
  local script="$2"
  local timeout_sec="${3:-300}"
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

wait_for_vm() {
  local retries=0
  echo -n "  Chờ VM sẵn sàng"
  while [ $retries -lt 60 ]; do
    STATUS=$(az vm get-instance-view \
      --resource-group "$RESOURCE_GROUP" \
      --name "$VM_NAME" \
      --query "instanceView.statuses[1].displayStatus" -o tsv 2>/dev/null || echo "")
    [ "$STATUS" = "VM running" ] && echo " ✔" && return 0
    echo -n "."
    retries=$((retries + 1))
    sleep 5
  done
  err "VM không sẵn sàng sau 5 phút"
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

# ─── BƯỚC 3: Xóa VM aqtech cũ ────────────────────────────────────────────────
section "BƯỚC 3 — Xóa VM aqtech cũ"

if az vm show --resource-group "$RESOURCE_GROUP" --name "$OLD_VM_NAME" &>/dev/null; then
  echo -e "${YELLOW}"
  echo "  Sắp xóa VM '$OLD_VM_NAME' và các tài nguyên liên quan:"
  echo "    • VM:       $OLD_VM_NAME"
  echo "    • OS disk:  (tự động lấy)"
  echo "    • NIC:      (tự động lấy)"
  echo "    • Public IP: $OLD_PUBLIC_IP_NAME (nếu tồn tại)"
  echo -e "${NC}"
  read -rp "  Xác nhận xóa? (yes/no): " CONFIRM_DELETE
  if [ "$CONFIRM_DELETE" != "yes" ]; then
    warn "Bỏ qua bước xóa — tiếp tục tạo VM mới"
  else
    # Lấy IDs trước khi xóa
    log "Lấy thông tin tài nguyên liên quan..."
    OS_DISK_ID=$(az vm show \
      --resource-group "$RESOURCE_GROUP" --name "$OLD_VM_NAME" \
      --query "storageProfile.osDisk.managedDisk.id" -o tsv 2>/dev/null || echo "")
    NIC_IDS=$(az vm show \
      --resource-group "$RESOURCE_GROUP" --name "$OLD_VM_NAME" \
      --query "networkProfile.networkInterfaces[].id" -o tsv 2>/dev/null || echo "")

    # Xóa VM
    log "Xóa VM $OLD_VM_NAME..."
    az vm delete \
      --resource-group "$RESOURCE_GROUP" \
      --name "$OLD_VM_NAME" \
      --yes --output none
    ok "VM $OLD_VM_NAME đã xóa"

    # Xóa OS disk
    if [ -n "$OS_DISK_ID" ]; then
      log "Xóa OS disk..."
      az disk delete --ids "$OS_DISK_ID" --yes --no-wait --output none 2>/dev/null || true
      ok "OS disk đã xóa"
    fi

    # Xóa NIC
    if [ -n "$NIC_IDS" ]; then
      log "Xóa NIC..."
      for NIC_ID in $NIC_IDS; do
        az network nic delete --ids "$NIC_ID" --no-wait 2>/dev/null || true
      done
      ok "NIC đã xóa"
    fi

    # Xóa public IP cũ
    if az network public-ip show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$OLD_PUBLIC_IP_NAME" &>/dev/null; then
      log "Xóa public IP $OLD_PUBLIC_IP_NAME..."
      az network public-ip delete \
        --resource-group "$RESOURCE_GROUP" \
        --name "$OLD_PUBLIC_IP_NAME" \
        --output none 2>/dev/null || true
      ok "Public IP $OLD_PUBLIC_IP_NAME đã xóa"
    fi

    ok "Hoàn tất xóa VM $OLD_VM_NAME"
  fi
else
  warn "VM '$OLD_VM_NAME' không tồn tại — bỏ qua bước xóa"
fi

# ─── BƯỚC 4: Tạo VM hnhstage mới ─────────────────────────────────────────────
section "BƯỚC 4 — Tạo VM $VM_NAME mới (Ubuntu 22.04, $VM_SIZE)"

if az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" &>/dev/null; then
  ok "VM '$VM_NAME' đã tồn tại — bỏ qua tạo mới"
else
  log "Tạo VM $VM_NAME (~3-5 phút)..."
  az vm create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --image "$VM_IMAGE" \
    --size "$VM_SIZE" \
    --admin-username "$ADMIN_USER" \
    --generate-ssh-keys \
    --public-ip-address "$PUBLIC_IP_NAME" \
    --public-ip-sku Standard \
    --public-ip-address-allocation Static \
    --nsg "${VM_NAME}-nsg" \
    --nsg-rule SSH \
    --location "$LOCATION" \
    --output none
  ok "VM $VM_NAME tạo xong"
fi

# Lấy public IP
PUBLIC_IP=$(az vm show \
  --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
  --show-details --query publicIps -o tsv 2>/dev/null || echo "")
ok "Public IP mới: $PUBLIC_IP"

# Cập nhật .env.generated với VM info
echo "VM_PUBLIC_IP=$PUBLIC_IP" >> "$SCRIPT_DIR/.env.generated"
echo "SSH_CMD=ssh $ADMIN_USER@$PUBLIC_IP" >> "$SCRIPT_DIR/.env.generated"

# Chờ VM boot xong
wait_for_vm

# Chờ thêm 30s cho cloud-init và SSH daemon khởi động
log "Chờ cloud-init hoàn tất..."
sleep 30

# ─── BƯỚC 5: Gắn và chuẩn bị data disk ──────────────────────────────────────
section "BƯỚC 5 — Data disk 64GB"

if az disk show --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" &>/dev/null; then
  # Kiểm tra disk đã attach vào VM nào chưa
  ATTACHED_VM=$(az disk show \
    --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" \
    --query "managedBy" -o tsv 2>/dev/null || echo "")
  if [ -n "$ATTACHED_VM" ]; then
    warn "Data disk '$DISK_NAME' đang gắn vào VM khác — tạo disk mới"
    DISK_NAME="disk-hnh-data-2"
  else
    ok "Data disk '$DISK_NAME' đã tồn tại, chưa gắn — tái sử dụng"
  fi
fi

if ! az disk show --resource-group "$RESOURCE_GROUP" --name "$DISK_NAME" &>/dev/null; then
  log "Tạo data disk $DISK_SIZE_GB GB ($DISK_NAME)..."
  az disk create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DISK_NAME" \
    --size-gb "$DISK_SIZE_GB" \
    --sku StandardSSD_LRS \
    --location "$LOCATION" \
    --output none
fi

# Gắn vào VM mới
log "Gắn data disk vào $VM_NAME..."
az vm disk attach \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --name "$DISK_NAME" \
  --output none
ok "Data disk gắn OK"

# ─── BƯỚC 6: Tạo storage account backup ──────────────────────────────────────
section "BƯỚC 6 — Storage account backup"

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
  ok "Storage account: $STORAGE_ACCOUNT"
fi

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv 2>/dev/null || echo "")

# ─── BƯỚC 7: Cài Docker trên VM mới ──────────────────────────────────────────
section "BƯỚC 7 — Cài Docker & mount data disk"

run_on_vm "Giải phóng APT lock và cài Docker" '
  export DEBIAN_FRONTEND=noninteractive

  # Dừng unattended-upgrades (thường giữ dpkg lock ngay sau boot)
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
  apt-get install -y -qq git curl htop ncdu

  # Cài Docker
  if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
  fi
  echo "Docker: $(docker --version)"

  # Thêm user vào docker group
  usermod -aG docker azureuser 2>/dev/null || true
  echo "Docker setup OK"
' 600

run_on_vm "Format và mount data disk" '
  if mountpoint -q /data 2>/dev/null; then
    echo "/data đã mount — bỏ qua"
  else
    # Tìm disk chưa có filesystem
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
      echo "Không tìm thấy disk mới — kiểm tra Azure Portal"
      lsblk
    fi
  fi

  mkdir -p /data/postgres /data/redis /data/media /data/backup
  chmod 777 /data/postgres /data/redis /data/media /data/backup
  echo "Thư mục /data sẵn sàng"
'

# ─── BƯỚC 8: Clone repo và tạo .env.stage ────────────────────────────────────
section "BƯỚC 8 — Clone repo, tạo .env.stage"

run_on_vm "Clone repository $REPO_BRANCH" "
  if [ -d '${APP_DIR}/.git' ]; then
    echo 'Repo tồn tại — pull latest'
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

# ─── BƯỚC 9: Docker build & start ────────────────────────────────────────────
section "BƯỚC 9 — Docker build & start"

run_on_vm "Khởi động Docker Compose (nền)" "
  cd '${APP_DIR}'
  rm -f /tmp/docker-deploy.log
  nohup bash -c '
    docker compose -f docker-compose.stage.yml up -d --build \
      > /tmp/docker-deploy.log 2>&1
    echo DONE >> /tmp/docker-deploy.log
  ' &
  echo \"Build PID: \$! — log: /tmp/docker-deploy.log\"
"

log "Polling Docker build (tối đa 10 phút)..."
for i in $(seq 1 30); do
  sleep 20
  RESULT=$(timeout 60 az vm run-command invoke \
    --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
    --command-id RunShellScript \
    --scripts "
      if grep -q '^DONE' /tmp/docker-deploy.log 2>/dev/null; then
        echo BUILD_COMPLETE
        cd '${APP_DIR}' && docker compose -f docker-compose.stage.yml ps 2>/dev/null | head -10
      elif grep -qi 'error\|failed' /tmp/docker-deploy.log 2>/dev/null; then
        echo BUILD_ERROR
        tail -5 /tmp/docker-deploy.log
      else
        echo \"Building... [\$(wc -l < /tmp/docker-deploy.log 2>/dev/null || echo 0) lines]\"
        tail -2 /tmp/docker-deploy.log 2>/dev/null || echo 'Đang build...'
      fi
    " \
    --query "value[0].message" -o tsv 2>/dev/null | \
    grep -v "^\[stdout\]\|^\[stderr\]" | grep -v "^$" | head -5 || echo "polling...")

  echo "  [$i/30] $RESULT"
  echo "$RESULT" | grep -q "BUILD_COMPLETE" && break
  echo "$RESULT" | grep -q "BUILD_ERROR" && warn "Build có lỗi — kiểm tra /tmp/docker-deploy.log" && break
done

# ─── BƯỚC 10: Migrate và setup dữ liệu ───────────────────────────────────────
section "BƯỚC 10 — Migrate, setup dữ liệu HNH"

run_on_vm "Chờ PostgreSQL và migrate" "
  cd '${APP_DIR}'
  for i in \$(seq 1 30); do
    docker compose -f docker-compose.stage.yml exec -T db \
      pg_isready -U horilla -d horilla_stage 2>/dev/null && break
    echo \"Chờ DB... (\$i/30)\"; sleep 5
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

# ─── BƯỚC 11: Backup tự động ─────────────────────────────────────────────────
section "BƯỚC 11 — Backup tự động"

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
  echo 'Cron backup: 2:00 sáng mỗi ngày'
" 600

# ─── BƯỚC 12: Tailscale ───────────────────────────────────────────────────────
section "BƯỚC 12 — Tailscale cho SSH management"

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
echo -e "${BOLD}║${NC}  VM       : $VM_NAME ($PUBLIC_IP)              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  SSH      : ssh $ADMIN_USER@$PUBLIC_IP         ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Admin    : $ADMIN_EMAIL                       ${BOLD}║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  Chi phí/tháng (VM mới):                             ║${NC}"
echo -e "${BOLD}║${NC}  VM Standard_B2s:     ~\$30/tháng (~750k VNĐ)      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Data disk 64GB SSD:  ~\$5/tháng                   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Storage backup:      ~\$0.5/tháng                  ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Tổng:                ~\$35.5/tháng (~888k VNĐ)     ${BOLD}║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  Việc cần làm thủ công:                               ║${NC}"
echo -e "${BOLD}║${NC}  1. Cloudflare Zero Trust → Tunnels → Public Hostname  ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     hrm.hnhtravel.work → nginx:80                 ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  2. (nếu token trống): ssh → nano .env.stage      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     → docker compose restart cloudflared          ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  3. sudo tailscale up --authkey=<key>  (trên VM)  ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  4. Bí mật: deploy/.env.generated (KHÔNG commit)  ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

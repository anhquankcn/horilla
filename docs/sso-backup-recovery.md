# SSO Backup & Recovery — HNH Keycloak

Hệ thống SSO của Hồng Ngọc Hà chạy Keycloak 26.2 trên production server `100.99.164.24`.

## Kiến trúc

| Thành phần | Chi tiết |
|-----------|---------|
| Keycloak | 26.2, container `HNHSSO` |
| Realm | `HNHTravel-SGN` |
| Database | PostgreSQL 18, container `hnhsso_postgres`, volume `sso_kc_pgdata` |
| Clients | `horilla-hrm`, `horilla-hrm-pwa` |
| Frontend | Cloudflare Tunnel → `https://sso.hnhtravel.work` |
| Config dir | `/opt/hnh/sso/` trên prod |

## Scripts

Tất cả scripts nằm tại `/opt/hnh/sso/`:

| Script | Mục đích |
|--------|---------|
| `backup-sso.sh` | Full backup: PG dump + realm JSON + users + clients |
| `sync-to-stage.sh` | Rsync backup sang stage `100.88.75.106:/opt/horilla/sso-backups/` |
| `restore-sso.sh` | Restore từ backup, tự verify sau khi xong |
| `check-sso.sh` | Health check: container + HTTP + realm + PG |

## Lịch tự động (crontab trên prod)

```
0    2 * * *  /opt/hnh/sso/backup-sso.sh     # backup 02:00 hàng ngày
*/15 * * * *  /opt/hnh/sso/check-sso.sh      # health check mỗi 15 phút
```

Backup tự động sync sang stage sau mỗi lần chạy. Giữ 14 ngày, tự dọn cũ hơn.

### Cài crontab lần đầu

```bash
ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24
(crontab -l 2>/dev/null; echo "# HNH SSO backup 02:00 + sync sang stage
0 2 * * * /opt/hnh/sso/backup-sso.sh >> /opt/hnh/sso/backups/backup.log 2>&1
# HNH SSO health check 15 phut
*/15 * * * * /opt/hnh/sso/check-sso.sh >> /opt/hnh/sso/backups/sso-alert.log 2>&1") | crontab -
```

## Nội dung mỗi backup

Lưu tại `/opt/hnh/sso/backups/YYYYMMDD_HHMMSS/`:

```
keycloak_db.dump          # PostgreSQL custom-format dump (compressed)
realm-HNHTravel-SGN.json  # Cấu hình realm: clients, flows, policies
users-list.json           # Danh sách users (email, tên, enabled)
clients-list.json         # Clients và redirect URIs
BACKUP_META.txt           # Metadata: số user, size, timestamp
```

Stage mirror: `/opt/horilla/sso-backups/` trên `100.88.75.106`.

## Backup thủ công (trước khi thay đổi lớn)

```bash
ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24 "bash /opt/hnh/sso/backup-sso.sh"
```

## Recovery

### Trường hợp 1: KC crash, DB còn nguyên

```bash
ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24
cd /opt/hnh/sso
docker compose -f docker-compose.sso.yml --env-file .env.sso up -d
```

### Trường hợp 2: Database corrupt

```bash
ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24
# Dùng backup mới nhất:
bash /opt/hnh/sso/restore-sso.sh
# Hoặc chỉ định ngày cụ thể:
bash /opt/hnh/sso/restore-sso.sh backups/20260623_091320
```

Script tự động: stop KC → drop DB → restore dump → start KC → verify realm + client → in link test.

### Trường hợp 3: Mất server, rebuild từ đầu

```bash
# Lấy backup từ stage về server mới:
scp -r naquan@100.88.75.106:/opt/horilla/sso-backups/YYYYMMDD_HHMMSS /opt/hnh/sso/backups/
# Copy docker-compose + .env.sso (giữ secrets an toàn, không commit)
# Restore:
bash /opt/hnh/sso/restore-sso.sh backups/YYYYMMDD_HHMMSS
```

### Trường hợp 4: Xóa nhầm user trong KC

User vẫn có trong `users-list.json` của backup. Import lại thủ công qua Admin UI:
`https://sso.hnhtravel.work/admin` → Realm `HNHTravel-SGN` → Users → Add user.

## Monitoring

```bash
# Xem health check log:
tail -20 /opt/hnh/sso/backups/sso-alert.log

# Xem backup log:
tail -20 /opt/hnh/sso/backups/backup.log

# Chạy health check ngay:
bash /opt/hnh/sso/check-sso.sh

# Xem danh sách backup hiện có:
ls -lt /opt/hnh/sso/backups/ | grep '^d'
```

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Xử lý |
|-----|------------|-------|
| `403 No matching Horilla account` | Email KC khác email Django User | Vào Django Admin → Users → sửa email khớp KC |
| `invalid_token` trong KC log | Token hết hạn (bình thường) | Không cần xử lý |
| KC không start sau restore | DB chưa sẵn sàng khi KC khởi | Chạy lại `docker compose up -d keycloak` sau 30s |
| `docker compose restart` không nhận env mới | Restart không reload `.env.sso` | Dùng `docker compose --force-recreate up -d` |

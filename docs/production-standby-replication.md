# PostgreSQL Streaming Replication — Production → Standby

## Kiến trúc

```
Production (100.99.164.24)              Staging (100.88.75.106)
┌──────────────────┐                   ┌──────────────────────────┐
│  horilla_prod     │                   │  horilla_stage (port 5432)│
│  postgres:16      │ ── WAL stream ──► │  standby_db  (port 5433) │
│  port 5432        │    Tailscale      │  postgres:16 (read-only) │
│  (Tailscale only) │                   └──────────────────────────┘
└──────────────────┘
```

## Thông tin kết nối

| Thành phần | Server | IP Tailscale | Port | DB Name |
|-----------|--------|-------------|------|---------|
| Production DB (primary) | ecs-hrm | 100.99.164.24 | 5432 | horilla_prod |
| Standby DB (replica) | hnhstage | 100.88.75.106 | 5433 | horilla_prod (read-only) |
| Staging DB (dev/test) | hnhstage | 100.88.75.106 | 5432 | horilla_stage |

## Replication User

- Username: `replicator`
- Password: `hnh_repl_2026_secure`
- Replication slot: `standby_staging`
- pg_hba: cho phép Tailscale subnet `100.64.0.0/10`

## Files cấu hình

| File | Server | Mô tả |
|------|--------|-------|
| `/opt/hnh/horilla/docker-compose.prod.yml` | Production | DB expose port `100.99.164.24:5432` |
| `/opt/horilla/docker-compose.standby.yml` | Staging | Standby container port 5433 |
| Volume `horilla_standby_pgdata` | Staging | Data từ pg_basebackup |

## Kiểm tra trạng thái

### Từ Production — xem replication lag
```bash
ssh -i es-hrm.pem naquan@100.99.164.24
docker exec horilla-db-1 psql -U horilla -d horilla_prod -c "
SELECT client_addr, state, sent_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes
FROM pg_stat_replication;"
```

### Từ Staging — xem standby đang recovery
```bash
ssh -i naquan.pem naquan@100.88.75.106
docker exec horilla-standby-db-1 psql -U horilla -d horilla_prod -c "SELECT pg_is_in_recovery();"
# Kết quả: t = đang là standby (read-only)
```

### Kết nối để chạy báo cáo (read-only)
```bash
psql -h 100.88.75.106 -p 5433 -U horilla -d horilla_prod
# Hoặc từ ứng dụng: host=100.88.75.106 port=5433 dbname=horilla_prod
```

## Failover khi Production sập

### Bước 1: Promote standby thành primary
```bash
ssh -i naquan.pem naquan@100.88.75.106
docker exec horilla-standby-db-1 pg_ctl promote -D /var/lib/postgresql/data
# pg_is_in_recovery() sẽ chuyển từ t → f
```

### Bước 2: Trỏ Horilla web sang standby DB
```bash
# Sửa .env.stage hoặc tạo .env.failover
DB_HOST=standby-db   # hoặc localhost
DB_PORT=5433
DB_NAME=horilla_prod

# Restart web
cd /opt/horilla
docker compose up -d --no-deps web autoclock bff
```

### Bước 3: Đổi DNS
- Cloudflare Dashboard → `qlns.hnhtravel.work` → trỏ về staging tunnel
- Hoặc: Cloudflare tunnel staging thêm ingress `qlns.hnhtravel.work → localhost:8080`

### Bước 4: Thông báo
- NV xóa cache PWA (service worker)
- Kiểm tra SSO login hoạt động

## Khôi phục sau Failover

Khi production server sửa xong:

### Cách 1: Production trở lại làm primary
```bash
# Trên staging: dump DB đã promote
docker exec horilla-standby-db-1 pg_dump -U horilla -Fc horilla_prod > /tmp/failover.dump

# Chuyển dump về production
scp /tmp/failover.dump naquan@100.99.164.24:/tmp/

# Trên production: restore
docker exec horilla-db-1 psql -U horilla -d postgres -c "DROP DATABASE horilla_prod;"
docker exec horilla-db-1 psql -U horilla -d postgres -c "CREATE DATABASE horilla_prod OWNER horilla;"
docker cp /tmp/failover.dump horilla-db-1:/tmp/
docker exec horilla-db-1 pg_restore -U horilla -d horilla_prod --no-owner /tmp/failover.dump

# Đổi DNS về production
# Tạo lại standby (xem mục Tạo lại Standby)
```

### Cách 2: Staging trở thành production mới
- Giữ nguyên staging làm production
- Server cũ trở thành standby mới (đảo vai trò)

## Tạo lại Standby (khi cần reset)

```bash
# Trên staging: xóa volume cũ
cd /opt/horilla
sudo docker compose -f docker-compose.standby.yml down
docker volume rm horilla_standby_pgdata

# Chạy pg_basebackup lại
docker run --rm \
  -e PGPASSWORD=hnh_repl_2026_secure \
  -v horilla_standby_pgdata:/var/lib/postgresql/data \
  postgres:16-alpine \
  pg_basebackup \
    -h 100.99.164.24 -p 5432 -U replicator \
    -D /var/lib/postgresql/data \
    -Fp -Xs -P -R \
    -S standby_staging

# Start lại
sudo docker compose -f docker-compose.standby.yml up -d
```

## Lưu ý

- Standby DB là **read-only** — không thể INSERT/UPDATE/DELETE
- Replication qua **Tailscale** — chỉ hoạt động khi cả 2 server online trên Tailscale
- Nếu staging offline > vài giờ, WAL có thể bị xóa trên production → cần tạo lại standby
- Replication slot `standby_staging` giữ WAL cho đến khi standby bắt kịp — nếu standby chết lâu, disk production sẽ đầy
- Monitor disk production: `docker exec horilla-db-1 psql -U horilla -c "SELECT slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_bytes FROM pg_replication_slots;"`

## Ngày thiết lập

- **2026-06-13**: Setup streaming replication production → staging
- Replication user: `replicator`, slot: `standby_staging`
- Lag tại thời điểm setup: **0 bytes**

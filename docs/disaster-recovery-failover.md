# Kịch bản Dự phòng (DR / Failover) — Khi máy Production gặp sự cố

> Mục tiêu: khi **Production (100.99.164.24)** chết, đưa hệ thống chạy tạm bằng:
> **DB Standby được promote** + **App chạy trên Stage (máy local)** + **SSO chạy trên máy Standby**.
> Thời gian khôi phục mục tiêu (RTO): ~15–30 phút. Mất dữ liệu (RPO): gần 0 (replication realtime, lag ~vài giây).

---

## 0. Sơ đồ hạ tầng

| Vai trò | Máy | Tailscale IP | Thành phần |
|---|---|---|---|
| **Production** (primary) | prod | `100.99.164.24` | Horilla app (web/pwa/bff/nginx), `horilla-db-1` (PG16, **primary**), Keycloak `HNHSSO`+`hnhsso_postgres`, `cloudflared` (tunnel token) |
| **Standby** | standby | `100.112.134.39` | `horilla-standby-db-1` (PG16, **replica realtime**, cổng `5433`, đang recovery), nginx-proxy-manager, zalo, gateway |
| **Stage** | máy local | `100.71.141.71` | Horilla app stack đầy đủ (`docker-compose.stage.yml`: web/pwa/bff/nginx/db/redis/cloudflared), DB `horilla_stage` |

**Backup sẵn có để DR:**
- **DB**: Standby là bản sao realtime của prod (không cần restore — chỉ promote).
- **SSO**: backup Keycloak kéo về local hằng giờ tại `~/hnh-sync/sso-backups/20*/` (có `keycloak_db.dump`, `realm-HNHTravel-SGN.json`). Script `restore-sso.sh` (bản trên prod: `/opt/hnh/sso/restore-sso.sh`).

**Khóa SSH (Windows, thư mục `D:\HNH2026\Cloud\`):**
- Prod: `es-hrm.pem` → `naquan@100.99.164.24`
- Standby: `naquanlv.pem` → `naquan@100.112.134.39`

**Cloudflare Tunnel:** dạng **token** (`CLOUDFLARE_TUNNEL_TOKEN`), ingress (qlns/sso → service) **quản lý trên Cloudflare Zero Trust Dashboard**, KHÔNG có file config local. Đây là điểm phải chỉnh tay khi failover.

---

## 1. Xác nhận Production thực sự chết (đừng failover nhầm)

```bash
# Từ máy local (Git Bash):
ssh -i "D:/HNH2026/Cloud/es-hrm.pem" -o ConnectTimeout=8 naquan@100.99.164.24 "echo alive; docker ps --format '{{.Names}} {{.Status}}'"
curl -s -o /dev/null -w "%{http_code}\n" https://qlns.hnhtravel.work/health/
```
- SSH timeout + site 5xx/không phản hồi trong >5 phút → tiến hành failover.
- Nếu chỉ 1 container chết (vd web) → **KHÔNG failover**, chỉ restart container đó trên prod.

---

## 2. PROMOTE Standby DB → Primary (cho ghi)

```bash
ssh -i "D:/HNH2026/Cloud/naquanlv.pem" naquan@100.112.134.39
# Promote replica thành primary (read-write):
docker exec horilla-standby-db-1 psql -U horilla -d horilla_prod -c "SELECT pg_promote();"
# Chờ ~5s, kiểm tra: phải trả về 'f' (không còn recovery)
docker exec horilla-standby-db-1 psql -U horilla -d horilla_prod -tAc "SELECT pg_is_in_recovery();"
```
- `f` = đã là primary, ghi được. `standby.signal` tự xóa.
- DB giờ: host `100.112.134.39`, cổng `5433`, db `horilla_prod`, user `horilla` (password = **giống prod**, vì là bản sao). Lấy password: `~/hnh-sync/.env` (`HNH_STANDBY_PW`) hoặc prod `.env.prod` (`DB_PASSWORD`).
- ⚠ **Sau khi promote KHÔNG thể tự re-attach lại prod cũ làm replica** — muốn quay về prod phải rebuild replication (xem mục 7 Failback).

---

## 3. Trỏ App Stage → Standby DB đã promote

Trên **máy local**, sửa DB target của stage web sang standby vừa promote:

```bash
cd C:/Users/NAQuan/source/repos/anhquankcn/horilla
# Sao lưu .env stage hiện tại
cp .env.stage .env.stage.bak
```
Thêm/sửa các biến DB trong `.env.stage` (và `.env` — vì compose đọc `.env`):
```
DB_ENGINE=django.db.backends.postgresql
DB_NAME=horilla_prod
DB_USER=horilla
DB_PASSWORD=<password horilla của prod/standby>
DB_HOST=100.112.134.39
DB_PORT=5433
# Nếu settings ưu tiên DATABASE_URL, đặt luôn:
DATABASE_URL=postgres://horilla:<password>@100.112.134.39:5433/horilla_prod
```
Khởi động lại app stage (web/pwa/bff) trỏ DB mới — **KHÔNG chạy `db` local nữa**:
```bash
cp .env.stage .env
docker compose -f docker-compose.stage.yml up -d --force-recreate web pwa bff
docker exec horilla-nginx-1 nginx -s reload
# Kiểm tra web nối được DB standby:
docker exec horilla-web-1 python manage.py showmigrations base | tail -3
docker exec horilla-web-1 python manage.py shell -c "from employee.models import Employee; print('emp:', Employee.objects.count())"
```
> Lưu ý: KHÔNG chạy `migrate` (DB standby đã có schema prod đầy đủ, cùng code). Chỉ chạy migrate nếu code stage MỚI HƠN prod.

---

## 4. Chạy SSO (Keycloak) trên máy Standby

SSO cần chạy ở máy standby (`100.112.134.39`) với hostname `sso.hnhtravel.work`.

```bash
# 4a. Copy compose SSO + backup mới nhất lên standby (từ máy local)
LATEST=$(ls -dt ~/hnh-sync/sso-backups/20*/ | head -1)
scp -i "D:/HNH2026/Cloud/es-hrm.pem" naquan@100.99.164.24:/opt/hnh/sso/docker-compose.sso.yml /tmp/
scp -i "D:/HNH2026/Cloud/es-hrm.pem" naquan@100.99.164.24:/opt/hnh/sso/restore-sso.sh /tmp/
scp -i "D:/HNH2026/Cloud/naquanlv.pem" -r /tmp/docker-compose.sso.yml /tmp/restore-sso.sh "$LATEST" naquan@100.112.134.39:~/hnh-sso/

# 4b. Trên standby: dựng Keycloak + kc-postgres rồi restore
ssh -i "D:/HNH2026/Cloud/naquanlv.pem" naquan@100.112.134.39
cd ~/hnh-sso
# .env cần: KC_DB_PASSWORD, KC_BOOTSTRAP_ADMIN_PASSWORD (lấy từ prod .env.sso)
docker compose -f docker-compose.sso.yml up -d kc-postgres
sleep 15
# Restore DB Keycloak từ dump:
docker exec -i hnhsso_postgres pg_restore -U postgres -d keycloak_db --clean --if-exists < 20*/keycloak_db.dump
docker compose -f docker-compose.sso.yml up -d keycloak   # HNHSSO, nghe 127.0.0.1:8080
# Kiểm tra:
curl -s http://127.0.0.1:8080/health/ready
```
- Keycloak giữ `KC_HOSTNAME=sso.hnhtravel.work` (không đổi). Realm `HNHTravel-SGN`, client `horilla-hrm` + `horilla-hrm-pwa` đã có trong dump.

---

## 5. Định tuyến Cloudflare (điểm mấu chốt)

Tunnel dạng token → sửa **ingress trên Cloudflare Zero Trust Dashboard**
(Networks → Tunnels → tunnel HNH → Public Hostname):

| Hostname | Trỏ tới (Service) |
|---|---|
| `qlns.hnhtravel.work` | `http://nginx:80` **nếu cloudflared chạy trên Stage** (cùng docker network), hoặc `http://100.71.141.71:80` |
| `sso.hnhtravel.work` | `http://100.112.134.39:8080` (Keycloak trên standby, qua tailscale) |

Chạy cloudflared trên **Stage** bằng chính token prod (stage compose đã có sẵn service `cloudflared`):
```bash
# Trên máy local — đảm bảo CLOUDFLARE_TUNNEL_TOKEN trong .env đúng token prod:
grep CLOUDFLARE_TUNNEL_TOKEN .env || echo "CLOUDFLARE_TUNNEL_TOKEN=<token prod>" >> .env
docker compose -f docker-compose.stage.yml up -d cloudflared
```
> Cùng 1 tunnel token chạy nhiều nơi = HA replica; khi prod chết, cloudflared trên stage phục vụ. Ingress trong dashboard quyết định hostname → service. Chỉ cần sửa 2 dòng ingress như bảng trên.
>
> **Cách khác (nếu ngại đổi ingress):** tạm đổi **DNS** của `qlns`/`sso` (Cloudflare DNS) trỏ CNAME sang tunnel/hostname DR. Nhưng với token-tunnel, sửa Public Hostname như trên là gọn nhất.

---

## 6. Kiểm tra hệ thống DR đã sống

```bash
curl -s -o /dev/null -w "qlns=%{http_code}\n" https://qlns.hnhtravel.work/health/
curl -s -o /dev/null -w "sso=%{http_code}\n"  https://sso.hnhtravel.work/realms/HNHTravel-SGN/.well-known/openid-configuration
```
- Đăng nhập thử qua HNHSSO trên `qlns.hnhtravel.work`.
- Chấm công / xem dữ liệu → xác nhận ghi được vào DB standby đã promote.
- **Thông báo team**: hệ thống đang chạy chế độ DR (stage app + standby DB), hiệu năng có thể thấp hơn.

---

## 7. FAILBACK — Đưa về Production khi prod hồi phục

⚠ Dữ liệu MỚI phát sinh trong lúc DR nằm ở **standby (đã promote)**. Phải đưa ngược về prod, không được để prod cũ (dữ liệu cũ) ghi đè.

1. **Ngừng ghi**: dừng app stage (`docker compose -f docker-compose.stage.yml stop web pwa bff`).
2. **Đồng bộ dữ liệu mới** từ standby(promoted) → prod DB:
   - Cách an toàn: `pg_dump` từ standby → `pg_restore` vào prod (DB trống/mới), HOẶC
   - Dừng prod DB cũ, `pg_basebackup` từ standby về prod để prod thành replica → rồi promote prod (đảo vai trò), hoặc rebuild prod từ dump standby.
3. **Rebuild replication** prod→standby (standby lại thành replica): trên standby, xóa data cũ, `pg_basebackup -h <prod> -U replicator -D data -R` (tạo lại `standby.signal` + `primary_conninfo`), start lại. Xem `docs/production-standby-replication.md`.
4. **Cloudflare**: đổi ingress `qlns`/`sso` trỏ lại prod (`http://web:8000` / `http://HNHSSO:8080`). Tắt cloudflared trên stage.
5. **Khôi phục stage**: `cp .env.stage.bak .env.stage; cp .env.stage .env` (trỏ DB về `horilla_stage` local), recreate web/pwa/bff. Bật lại scheduled task `HNH-Stage-Sync` + `HNH-SSO-Sync` nếu đã tạm dừng.
6. Bật lại cron trên prod (nhắc họp, backup SSO, `send_meeting_reminders`). Kiểm tra `HNH-SSO-Sync` kéo backup bình thường.

---

## 8. Checklist nhanh (dán vào lúc sự cố)

```
[ ] 1. Xác nhận prod chết (ssh timeout + site down >5')
[ ] 2. Promote standby: pg_promote() → pg_is_in_recovery()=f
[ ] 3. Sửa .env.stage + .env: DB_HOST=100.112.134.39 DB_PORT=5433 DB_NAME=horilla_prod
[ ] 4. up -d --force-recreate web pwa bff (stage) → showmigrations OK
[ ] 5. SSO trên standby: kc-postgres → pg_restore keycloak_db.dump → keycloak up
[ ] 6. Cloudflare ingress: qlns→stage nginx, sso→100.112.134.39:8080
[ ] 7. up -d cloudflared (stage)
[ ] 8. curl health qlns + sso = 200, đăng nhập thử
[ ] 9. Báo team đang chạy DR
```

## Lưu ý / rủi ro
- Promote standby là **một chiều** — chuẩn bị kỹ Failback (mục 7) trước khi làm ngược.
- Password `horilla` trên standby = của prod (bản sao). SSO admin/DB password lấy từ prod `.env.sso`.
- Stage máy local phải **luôn bật** + tailscale online thì DR mới dùng được.
- Nếu code stage cũ hơn prod → có thể lệch schema; giữ stage cùng commit với prod (đã theo quy trình deploy song song).
- Tài liệu liên quan: `docs/production-standby-replication.md`, `docs/sso-backup-recovery.md`.
```

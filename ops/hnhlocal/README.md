# hnhlocal — standby replica + site qlns-stb

Máy dựng 2026-08-25. Thay thế standby cũ `100.112.134.39` (đã tắt cùng ngày).

## Truy cập

```bash
ssh hnhstage            # alias trong ~/.ssh/config
# HostName 100.99.228.31 (Tailscale, node "hnh-1") · User quanna · IdentityFile ~/.ssh/hnhlocal
```

Ubuntu 26.04, 4 vCPU, 14 GB RAM, 98 GB đĩa. LAN `172.16.15.90`.

> ⚠️ **`sudo` cần mật khẩu.** Không cài được gói, không tạo được systemd unit, không tạo
> được thư mục ở `/`. Nhưng `quanna` có group `docker` → làm mọi thứ bằng container.
> Đó là lý do `docker-compose.stb.yml` bỏ hết bind mount `/data/*` sang named volume.

## Hai thứ chạy trên máy

### 1. Standby replica (DR)

`~/hnh-standby/docker-compose.standby.yml` — container `horilla-standby-db-1`, cổng
**5433**, volume external `horilla_standby_pgdata`, slot trên prod là `standby_hnhlocal`.

Dựng lại từ đầu (chạy trên hnhlocal, KHÔNG cần sudo — chown ngay trong container):

```bash
docker volume create horilla_standby_pgdata
docker run --rm -v horilla_standby_pgdata:/pgdata -e PGPASSWORD="$(cat ~/.pgpass_repl)" postgres:16 \
  bash -c 'pg_basebackup -h 100.99.164.24 -p 5432 -U replicator -D /pgdata -Fp -Xs -P -R -S standby_hnhlocal -C \
           && chown -R postgres:postgres /pgdata && chmod 700 /pgdata'
docker compose -f ~/hnh-standby/docker-compose.standby.yml up -d
```

Bỏ `-C` nếu slot đã tồn tại. Mật khẩu `replicator` nằm ở `~/.pgpass_repl` trên máy này.

> **Bẫy đã gặp:** basebackup lần đầu chết ở 99% vì trong PGDATA của prod có file
> `pg_hba.conf.bak.20260822` do root tạo, `postgres` không đọc được. `pg_basebackup`
> copy mọi file trong data dir nên vấp. Đã chuyển sang `/var/lib/postgresql/confbak/`.
> **Đừng bao giờ để file backup config bên trong PGDATA.**
>
> **Bẫy thứ hai:** `pg_basebackup ... | tail -5 && echo OK` sẽ in OK dù hỏng, vì pipe
> nuốt exit code. Kiểm `$?` ngay sau lệnh, đừng qua pipe.

### 2. Site https://qlns-stb.hnhtravel.work

```bash
cd ~/hnh/horilla
docker compose --env-file .env.stb -f docker-compose.stage.yml -f docker-compose.stb.yml up -d
```

- `.env.stb` copy từ `.env.stage` của máy Windows, đổi 4 giá trị: `ALLOWED_HOSTS`,
  `CSRF_TRUSTED_ORIGINS`, `OIDC_REDIRECT_BASE_URL`, `CLOUDFLARE_TUNNEL_TOKEN`.
  **Secret (`SECRET_KEY`, `BFF_COOKIE_SECRET`, `DB_PASSWORD`) dùng chung với stage cũ** —
  chấp nhận cho nội bộ, sinh mới nếu cho người ngoài xem.
- `.env.stage` là **symlink** → `.env.stb`, vì `docker-compose.stage.yml` khai cứng
  `env_file: .env.stage`. Thiếu symlink này thì container `web` không có biến nào.
- nginx nghe **8080** trên host. Tunnel trỏ vào đúng cổng này.
- `cloudflared` chạy bằng **systemd trên host** (do anh Quân cài, token ở
  `/etc/cloudflared/token`), KHÔNG phải container trong compose. Kiểm tra:
  `curl -s localhost:20241/ready` → `{"status":200,"readyConnections":4,...}`.

### Dữ liệu

Restore **một lần** từ `pg_dump` prod ngày 25/08 (250 MB) — không streaming, dữ liệu
đứng yên. Muốn tươi thì kéo dump mới rồi `pg_restore` lại.

```bash
docker cp <dump> horilla-db-1:/tmp/prod.dump
docker exec horilla-db-1 pg_restore -U horilla -d horilla_stage --no-owner --no-privileges -j 4 /tmp/prod.dump
```

Kiểm chứng 25/08: 416 bảng, 385 nhân viên / 385 tài khoản khớp đúng prod.
**Đây là lần đầu bản backup pg_dump được restore thử và xác nhận dùng được.**

> **Thiếu media.** Dump chỉ có DB, không có `media/` → ảnh nhân viên 404. Cần thì
> rsync riêng từ prod.

## Keycloak

Realm `HNHTravel-SGN`, phải khai redirect URI cho **cả hai** client:

| Client | Dùng cho | Trạng thái 25/08 |
|--------|----------|------------------|
| `horilla-hrm-pwa` | BFF / app PWA — đường đăng nhập chính | ✅ đã khai |
| `horilla-hrm` | Django admin | ❌ **chưa khai** — vào trang admin sẽ lỗi |

Kiểm nhanh không cần quyền admin — gọi thẳng endpoint authorize và xem có
`Invalid parameter: redirect_uri` không:

```bash
curl -s "https://sso.hnhtravel.work/realms/HNHTravel-SGN/protocol/openid-connect/auth?client_id=horilla-hrm-pwa&redirect_uri=<urlencoded>&response_type=code&scope=openid&state=x" \
  | grep -i "Invalid parameter"
```

Luôn kèm một **ca đối chứng** bằng URI của site đang chạy được (vd `qlns-stage`) để
biết cách kiểm đúng, chứ không phải endpoint từ chối tất cả.

## Ảnh hưởng khi tắt standby cũ

`ops/hnh-sync/sync_to_stage.sh` từng trỏ `100.112.134.39`, đã đổi sang `100.99.228.31`.
Nhớ copy sang `~/hnh-sync/` trên máy Windows mới có hiệu lực — thư mục `ops/` chỉ là
bản lưu vết, không phải bản đang chạy.

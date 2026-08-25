# ops/ — Script vận hành backup & đồng bộ

Bản sao có version của các script hạ tầng. Trước 2026-08-22 chúng chỉ tồn tại trên
đúng **một máy Windows và một server**, không git, không review, không ai khác có.
Chính máy Windows đó là stage — và nó đã tự xoá sạch DB một lần hôm 20/08/2026.

> ⚠️ Đây là **bản sao để lưu vết**, không phải bản đang chạy. Sửa ở đây thì phải copy
> sang vị trí thật (bảng dưới) mới có hiệu lực, và ngược lại. Chưa có cơ chế tự đồng bộ.

## Chạy ở đâu

| Script | Máy | Vị trí thật | Lịch |
|--------|-----|-------------|------|
| `prod/backup-db.sh` | prod `100.99.164.24` | `/opt/hnh/backups/backup-db.sh` | cron `naquan`: `30 1 * * *` |
| `hnh-sync/db_pull_from_prod.sh` | local Windows | `~/hnh-sync/` | Task `HNH-DB-Backup-Pull`, 02:15 hằng ngày |
| `hnh-sync/sync_to_stage.sh` | local Windows | `~/hnh-sync/` | Task `HNH-Stage-Sync`, mỗi 6h (01:23/07:23/13:23/19:23) |
| `hnh-sync/sso_pull_from_prod.sh` | local Windows | `~/hnh-sync/` | Task `HNH-SSO-Sync`, hằng giờ |
| `hnhlocal/docker-compose.standby.yml` | hnhlocal `100.99.228.31` | `~/hnh-standby/` | chạy thường trực |
| `hnhlocal/docker-compose.stb.yml` | hnhlocal | `~/hnh/horilla/` | chạy thường trực |
| `prod/fix_pg_hba.sh` | prod | `/tmp/` (chạy 1 lần) | thủ công — xem mục dưới |

> **2026-08-25:** standby chuyển từ `100.112.134.39` sang **hnhlocal `100.99.228.31`**
> (slot `standby_hnhlocal`). Standby cũ đã tắt, slot `standby_staging` đã drop.
> Site mới `https://qlns-stb.hnhtravel.work` cũng chạy trên máy đó — xem `hnhlocal/README.md`.

## Backup DB (dựng 2026-08-22)

Hai tầng, chống hai thứ khác nhau:

1. **`prod/backup-db.sh`** — `pg_dump -Fc` → `/opt/hnh/backups/db/horilla_prod_*.dump`.
   DB 2,1 GB → dump ~242 MB. Giữ 7 bản. Chặn chạy nếu `/` còn <8 GB (prod ~78%).
   Verify bằng `pg_restore -l` ngay sau dump; hỏng thì xoá file + `exit 1`.
   Không cần `sudo`: user `naquan` có group `docker` và ghi được `/opt/hnh`.
   *Chống: lỡ tay xoá dữ liệu trên prod.*
2. **`hnh-sync/db_pull_from_prod.sh`** — kéo về `D:\HNH2026\Backups\horilla-db\`, giữ 7 bản,
   so khớp byte size sau khi tải. Để ở D: vì C: chỉ còn ~23 GB.
   *Chống: mất luôn cả máy prod.*

Khôi phục:
```bash
pg_restore -U horilla -d <db_dich> --no-owner horilla_prod_YYYYmmdd_HHMMSS.dump
```

> **Chưa từng restore thử.** Dump đọc được bằng `pg_restore -l`, nhưng chưa ai nạp ra một
> DB trống để xác nhận dùng được. Backup chưa restore thử thì vẫn chỉ là file.

## Đồng bộ stage

`sync_to_stage.sh` copy **dữ liệu 9 bảng** từ standby `100.112.134.39:5433` (replica
read-only của prod) về stage local: `auth_user`, `employee_employee`,
`employee_employeeworkinformation`, `base_employeeshift`, `base_employeeshiftschedule`,
`attendance_employeeshiftplan`, `attendance_attendance`, `attendance_attendanceactivity`,
`attendance_attendancelatecomeearlyout`.

Cần `~/hnh-sync/.env` chứa `HNH_STANDBY_PW` — **không commit file này**.

Ba lỗi đã sửa 2026-08-22 sau sự cố mất DB stage:
- Tự chạy `migrate` khi stage có <50 bảng. Trước đó DB trắng → `common_cols` rỗng →
  `COPY t () FROM STDIN` syntax error, script bó tay.
- `exit 1` khi `match=false`. Trước luôn `exit 0` nên Task Scheduler báo `Result: 0`
  cho cả 6 lượt hỏng liên tiếp — đó là lý do sự cố âm thầm 2 ngày.
- Chuẩn hoá count rỗng → 0. Query lỗi trả `""` sinh JSON hỏng `"stage_attendance":,`
  khiến `record_standby_sync` báo `Bad payload`, tab Giám sát không thấy gì.

## `fix_pg_hba.sh` — replication prod → standby

Chạy 1 lần ngày 2026-08-22. Standby chết âm thầm từ 07/08, log lặp:

```
FATAL: no pg_hba.conf entry for replication connection from
       host "172.20.0.1", user "replicator"
```

Docker `EnableUserlandProxy=true` trên prod che IP nguồn Tailscale của standby thành
gateway bridge `172.20.0.1`, trong khi `pg_hba.conf` chỉ có `100.64.0.0/10`.
**Cùng root cause với lỗi máy vân tay 403.**

⚠️ Dòng `host all all all scram-sha-256` không cứu được: trong `pg_hba`, `replication`
là database keyword riêng, `all` **không** bao gồm nó. Nên app connect bình thường,
chỉ replication chết.

Script thêm `host replication replicator 172.20.0.1/32 md5` rồi `pg_reload_conf()`
(reload, không restart). Chạy lại nhiều lần không nhân đôi rule. Backup:
`pg_hba.conf.bak.20260822`.

Giữ script lại vì lỗi này sẽ tái diễn nếu dựng lại standby hoặc đổi mạng docker prod.

## Cảnh báo: slot replication

Nếu bỏ hẳn standby thì **phải** `pg_drop_replication_slot('standby_staging')`. Slot mồ côi
giữ WAL vô hạn — hồi 22/08 nó đã ôm 13 GB trong khi `/` của prod ở mức 78%. Không dọn thì
đĩa đầy → Postgres ngừng ghi → HRM chết.

Kiểm tra:
```sql
SELECT slot_name, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_giu
FROM pg_replication_slots;
```

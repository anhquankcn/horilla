---
status: completed
branch: horilla_aqv10
timestamp: 2026-06-23T22:47:07+07:00
files_modified: []
---

## Working on: Monitoring Prod↔Standby + SSO Backup + Password Reset Tracking

### Summary

Ba tính năng mới đã hoàn thành và deploy production trong session này:
1. **Giám sát định kỳ** Prod↔Standby replication lag + trạng thái backup SSO (mỗi 1h), xem được trên tab mới trong trang Đồng bộ DB của PWA.
2. **Ghi nhận lần gửi đặt lại mật khẩu gần nhất** cho từng nhân viên, hiển thị trong Tab Tài khoản của tính năng Nhân sự.
3. **SSH key từ máy local lên stage** để stage có thể so sánh backup SSO với prod trực tiếp.

Tất cả code đã commit, push, promote lên 1.0, và deploy thành công. Migration chạy OK trên prod.

### Decisions Made

- **`SystemHealthLog` model trong `base` app** — lưu kết quả kiểm tra (check_type: prod_standby / sso_backup), POST endpoint dùng `X-Sync-Token` (tránh SimpleJWT chặn Bearer token).
- **Script `check_system_health.sh` chạy trên stage** — push kết quả sang prod API; không chạy trên prod để tránh query chéo server. Crontab `0 * * * *` đã cài trên stage (azurestage / 100.88.75.106).
- **SSH key `es-hrm.pem` đặt tại `/opt/horilla/deploy/es-hrm.pem`** (chmod 600) trên stage — dùng để SSH vào prod kiểm tra thư mục backup SSO `/opt/hnh/sso/backups/`.
- **`last_password_reset_sent_at` / `last_password_reset_sent_by` trong `HNHEmployeeProfile`** — chỉ ghi khi admin bấm "Reset mật khẩu về Hnh@1234" (action=reset_password), không ghi khi resend_welcome hoặc tự đổi mật khẩu.
- **PWA DbSyncPage** refactored thành 3 tabs: "Đồng bộ DB" (lịch sử sync), "Prod↔Standby" (lag/row counts), "Backup SSO" (tuổi backup, synced status).

### Remaining Work

Không còn pending — toàn bộ đã shipped:

1. ~~Script `check_system_health.sh` → chmod +x, test run~~ ✓ DONE
2. ~~Crontab stage: `0 * * * *`~~ ✓ DONE
3. ~~PWA 3 tabs (Đồng bộ DB / Prod↔Standby / Backup SSO)~~ ✓ DONE
4. ~~Migration `employee.0007_hnh_profile_password_reset_tracking`~~ ✓ DONE
5. ~~Deploy production~~ ✓ DONE (migration ran OK)

### Notes

**Crontab trên stage (azurestage 100.88.75.106):**
```
0 5,13 * * * bash /opt/horilla/deploy/sync_standby_to_stage.sh >> /opt/horilla/deploy/sync.log 2>&1
0 * * * *    bash /opt/horilla/deploy/check_system_health.sh >> /opt/horilla/deploy/check_health.log 2>&1
```

**Kết quả test cuối (23/06 15:17):**
- Replication lag: 3s → `ok`, pushed ✓
- SSO backup: stage=prod=`20260623_091320`, age=6h, synced=true → `ok`, pushed ✓

**SSO backup check lưu ý:**
- Stage SSH vào prod dùng key `/opt/horilla/deploy/es-hrm.pem` (user `naquan@100.99.164.24`)
- Nếu SSH fail → status=`warn`, không error — thiết kế chủ động vì prod SSH là optional
- Backup dir prod: `/opt/hnh/sso/backups/` — chỉ có 2 thư mục ngày 23/06, chưa có backup cũ hơn (crontab prod 02:00 chưa chạy đủ ngày)

**API endpoints mới (đã deploy prod):**
- `GET /api/base/system-health/?type=prod_standby` — lịch sử kiểm tra replication (72 entries)
- `GET /api/base/system-health/?type=sso_backup` — lịch sử kiểm tra backup SSO
- `POST /api/base/system-health/` — nhận push từ stage (X-Sync-Token auth)

**Password reset tracking:**
- Field: `HNHEmployeeProfile.last_password_reset_sent_at`, `.last_password_reset_sent_by`
- Chỉ ghi khi PATCH `/api/employee/<pk>/kc-account/` với `action=reset_password`
- GET endpoint trả thêm `last_password_reset_sent_at` (ISO string) và `last_password_reset_sent_by_name` (tên user)
- PWA: component `PasswordResetInfo` trong `ProfileTabs.tsx`, hiển thị dưới các CheckItem trong card trạng thái

**Commits session này:**
- `907eb164c` feat(employee): ghi nhận lần gửi đặt lại mật khẩu gần nhất
- `8f29c6a4c` feat(monitoring): theo dõi replication Prod↔Standby + backup SSO
- `8f43f2529` fix(api): StandbySyncLogView dùng X-Sync-Token thay Authorization
- `53eab9c1b` feat(api): StandbySyncLogView nhận POST từ stage để mirror log sang prod
- `a6e3a78b6` fix(onboard): phân biệt email tồn tại vs nhân viên bị vô hiệu hóa

**SSH aliases máy local:**
- Stage: `ssh -i ~/CloudSrv/naquan.pem naquan@100.88.75.106` (hoặc `azurestage`)
- Prod: `ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24` (hoặc `hnhlive`)

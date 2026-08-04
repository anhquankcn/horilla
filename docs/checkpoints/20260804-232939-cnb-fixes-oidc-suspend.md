---
status: completed
branch: horilla_aqv10
timestamp: 2026-08-04T23:29:39+0700
files_modified: []
head_commit: 807d75d7c
---

## Working on: C&B leave/auth/suspend fixes (prod)

### Summary

Chuỗi fix cho C&B trên Horilla HNH (prod qlns.hnhtravel.work), tất cả đã commit +
push + deploy prod. Làm việc sạch: working tree clean, branch `horilla_aqv10` đồng
bộ hoàn toàn với origin tại `807d75d7c`. Không có việc dở dang.

### Decisions Made

- **Hoàn phép khi C&B hủy đơn đã duyệt** (commit 343b9e5b2): thêm field
  `balance_refunded` + helper `_refund_leave_balance`, cộng lại đúng
  `approved_available_days/carryforward` vào `AvailableLeave`. Tab "Đã Xóa" trong
  PWA. Hồi tố tháng 7: 55 đơn = 52.21 ngày đã hoàn (đã xuất Excel cho C&B).
- **OIDC login khớp qua email công việc** (commit e855f6ac4): 39 NV active có
  username vai trò cũ (admin3@, ca.sales1@…) không login được → thêm fallback match
  qua `EmployeeWorkInformation.email` (duy nhất 1 NV active + User active) ở CẢ 2
  luồng: `OIDCLoginAPIView` (PWA) + `filter_users_by_claims` (browser). Anh CHỐT:
  username theo vai trò là chuẩn cố ý về sau, fallback là cầu nối chính thức.
- **Endpoint Tạm nghỉ riêng** (commit 807d75d7c): root cause = `Employee.save()`
  (models.py ~664) có guard ép is_active=True khi get_archive_condition()!=False
  trong request context → PWA PUT is_active=false trả 200 nhưng vô hiệu.
  `SuspendEmployeeView` dùng queryset `.update()` bypass guard, chặn chỉ khi còn cấp
  dưới ACTIVE (400+blocking_reports), gỡ FK cấp dưới đã nghỉ, tắt Employee+User+KC.
  Lê Hồng Nhân (HNH00344) đã suspend thành công (verify ca thật).

### Remaining Work

Không còn việc bắt buộc. Backlog tuỳ chọn (chưa xác nhận):
1. Lỗi Arkon M2M `/api/m2m/integrations/arkon/internal/` trả 400 lặp lại (eOffice
   user-facing vẫn 200 nên không chặn user) — soi riêng khi rảnh.
2. Lỗi migration test-DB prod `base_company.latitude does not exist` khiến
   `manage.py test` không chạy sạch — vá để CI test được.
3. Mạng WiFi văn phòng không reach Cloudflare (IPv6/DNS/firewall) — chờ anh chạy thử
   đổi DNS 8.8.8.8 / tắt IPv6 để chốt nguyên nhân.
4. Stage server 100.88.75.106 đã chết (SSH timeout) — không test được trên stage.

### Notes

- **BẪY quan trọng:** test `Employee.save()` qua `manage.py shell` bị đánh lừa — shell
  không có thread-local request nên guard is_active không chạy. Phải test qua HTTP
  (APIClient) mới tái hiện. Muốn đổi is_active chắc chắn persist → dùng `.update()`.
- Deploy prod: `docker-compose.prod.yml`, `.env`→`.env.prod`, path `/opt/hnh/horilla`,
  key `es-hrm.pem@100.99.164.24`. deploy.sh trong repo là bản CŨ trỏ stage — không dùng.
  Deploy tay: `sudo git pull && docker compose -f docker-compose.prod.yml up -d
  --no-deps --build web pwa && docker exec horilla-nginx-1 nginx -s reload`.
- Memory đã lưu: project_employee_suspend.md (guard is_active), project_oidc_fixes.md
  (fallback work email + role usernames intentional).

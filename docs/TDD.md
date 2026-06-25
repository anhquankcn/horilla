# Technical Design Document (TDD)
## Horilla HRM — Công ty Du lịch Hồng Ngọc Hà (HNH Travel)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-06-25 |
| Branch | `horilla_aqv10` |
| Nguồn | Sinh từ codebase (39 Django apps, PWA React/Vite, Keycloak, Postgres) |

> Tài liệu thiết kế kỹ thuật. Yêu cầu nghiệp vụ xem [SRS.md](./SRS.md). Mọi secret dùng placeholder `<env>` — không ghi giá trị thật.

---

## 1. Kiến trúc tổng thể

```
                         Internet (HTTPS)
                              │
                    ┌─────────▼──────────┐
                    │  Cloudflare Tunnel  │  (cloudflared container)
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │       nginx         │  reverse proxy / SPA fallback
                    └───┬─────────┬───────┘
          /pwa, /bff    │         │  /api, /admin, /oidc
              ┌─────────▼──┐   ┌──▼─────────────┐
              │  PWA (dist) │   │   Django web    │  gunicorn
              │  React/Vite │   │  (horilla)      │
              └──────┬──────┘   └──┬───────┬──────┘
            /bff/*   │             │       │
              ┌──────▼──────┐      │       │
              │  BFF (Node)  │──────┘       │
              │  Fastify     │  proxy /api  │
              └──────┬───────┘              │
                     │ OIDC                 │ ORM
            ┌────────▼─────────┐    ┌───────▼────────┐   ┌─────────┐
            │  Keycloak (KC)   │    │  PostgreSQL 16  │   │  Redis  │
            │  HNHTravel-SGN   │    │  horilla_prod   │   │ cache/q │
            └──────────────────┘    └────────┬────────┘   └─────────┘
                     ▲                        │ streaming replication
            Microsoft 365 IdP        ┌────────▼────────┐
                                     │ Standby replica  │ (stage host)
                                     └──────────────────┘
```

**Thành phần:**
- **Django monolith** (`horilla`) — server-rendered admin + REST API (`horilla_api`) + business logic. Chạy bằng gunicorn.
- **PWA** (`pwa/frontend`) — React 18 + Vite, build tĩnh, phục vụ tại `/pwa/`.
- **BFF** (`pwa/bff`) — Node Fastify: điều phối OIDC (PKCE), proxy `/bff/api/*` → `/api/*` với JWT server-side (httpOnly cookie), tránh CORS cho PWA.
- **Keycloak** — IdP tập trung (realm HNHTravel-SGN, client horilla-hrm), liên kết Microsoft 365.
- **PostgreSQL 16** — dữ liệu chính; có standby replica (streaming) phục vụ giám sát + đồng bộ sang stage.
- **Redis** — cache + queue. **nginx** — reverse proxy. **cloudflared** — expose qua Cloudflare Tunnel.

---

## 2. Technology Stack

| Lớp | Công nghệ |
|-----|-----------|
| Backend | Python / Django, Django REST Framework, SimpleJWT, mozilla_django_oidc, python-keycloak |
| Frontend | React 18.3, Vite 6, TypeScript 5.8 (strict), Tailwind CSS 3.4, react-router v7, vite-plugin-pwa (Workbox) |
| BFF | Node.js, Fastify, Undici |
| Auth/SSO | Keycloak 26.2 (OIDC, RS256), Microsoft 365 federation |
| DB / Cache | PostgreSQL 16, Redis |
| Hạ tầng | Docker Compose, nginx, Cloudflare Tunnel |
| Tích hợp | SMTP (Gmail), VAPID Web Push, biometric (pyzk/Dahua), geofencing, wttr.in |

---

## 3. Mô hình dữ liệu (Data Model)

Hệ thống gồm **39 Django apps**. Module cốt lõi và quan hệ:

```
Company ──< Department ──< JobPosition ──< JobRole
   │         (M2M)
   ├──< EmployeeShift ──< EmployeeShiftSchedule (day, start/end, core_start/end, min_hour, coefficient)
   └──< MultipleApprovalCondition

Employee (1-1 auth.User, FK WorkLevel)
   ├── 1-1 EmployeeWorkInformation (department, job_position, reporting_manager, shift, company, salary)
   ├── 1-1 HNHEmployeeProfile (CCCD, BHXH, thuế, hộ khẩu, last_password_reset_sent_at/by)
   ├── 1-1 EmployeeBankDetails
   ├──< AttendanceActivity / Attendance / GPSCheckInLog / LateComeEarlyOut / OverTime
   ├──< LeaveRequest ──< LeaveRequestConditionApproval (sequence, manager)
   │                  └──< LeaveRequestWatcher
   ├──< AvailableLeave (×LeaveType)
   ├──< TrialContract / OfficialContract / PerformanceContract (kế thừa ContractBase)
   │        └──< ContractKPIAppendix (Phụ lục 1)
   └──< MonthlyPayrollEntry / Payslip / LoanAccount / Reimbursement

CBLeaveManager (company?, department?, manager)  — config C&B duyệt phép, match cụ thể nhất thắng
```

**Model HNH-custom đáng chú ý:**
- `WorkLevel` — cấp bậc 1–8 + quyền lợi (BHXH, BHNT, WFH, phụ cấp) theo cấp.
- `HNHEmployeeProfile` — mở rộng hồ sơ (CCCD, BHXH, thuế, hộ khẩu, theo dõi reset mật khẩu).
- `EmployeeShiftSchedule.core_start_time/core_end_time` — giờ lõi tính trễ/sớm (ALD26 = 08:00/17:30), tách khỏi khung ca.
- `CBLeaveManager` + `LeaveRequestWatcher` — C&B cố định + người theo dõi đơn nghỉ.
- `HNHCompensatoryProposal` — đề xuất phép bù manager→C&B.
- `TrialContract / OfficialContract / PerformanceContract / ContractKPIAppendix / MonthlyPayrollEntry` — hệ thống hợp đồng & lương HNH.
- `SystemHealthLog` (base) — log giám sát replication + backup SSO.

Migration được quản lý chuẩn Django; các thay đổi gần đây: `leave.0007` (CBLeaveManager + Watcher, seed C&B toàn cục), `base.0037` (core times + seed ALD26 08:00/17:30).

---

## 4. Thiết kế API

API REST nằm trong `horilla_api/`, nhóm theo module: `attendance`, `leave`, `employee`, `payroll`, `base`, `notifications`, `asset`, `expenses`, `m2m`, `auth`...

### 4.1 Xác thực
- **Người dùng (web/mobile):** Keycloak OIDC. PWA dùng **BFF flow**: PKCE → exchange code → lưu **SimpleJWT** trong httpOnly cookie; `/bff/api/*` proxy kèm JWT server-side. Backend xác thực qua `horilla/oidc_backend.py` (`HorillaOIDCBackend`): map KC claims → Horilla user theo email→email / email→username / preferred_username→username.
- **M2M (service-to-service):** `horilla_api/m2m_auth.py` — 3 lớp: IP CIDR allowlist + token SHA256 (`X-HNH-Service-Token`) + scope `resource:action` (vd `attendance:write`).
- **Permission classes:** `IsAuthenticated`, `ManagerPermission` / `manager_permission_required`, helper nghiệp vụ `_can_onboard` (nhóm C&B/admin), `_is_cnb`, `require_m2m_scope(...)`.

### 4.2 Nhóm endpoint chính (đại diện)

| Nhóm | Endpoint tiêu biểu |
|------|--------------------|
| Attendance | `POST /api/attendance/clock-in/`, `clock-out/`, `biometric-punch/`, `GET /api/attendance/export-monthly/[/xlsx/]` (from_date/to_date/page/page_size) |
| Leave | `POST /api/leave/user-request-days/`, `user-request-hours/`, `pwa-approve/<id>/`, `GET /api/leave/cb-managers/`, `select-candidates/`, `watching/`, `available-managers/` |
| Employee | `GET /api/employee/me/`, `directory/`, `POST /api/employee/onboard/`, `<pk>/kc-account/` (GET/POST/PATCH), `<pk>/kc-account/identity/` (GET preview / POST apply) |
| Payroll | `GET /api/payroll/my-payslip/`, `payroll-management/`, `contract/` |
| Base | `GET /api/base/system-health/`, `weather/`, `keycloak/sync-*` |
| Notifications | `GET /api/notifications/summary/`, `push/vapid-key/`, `POST push/subscribe/`, announcements feed/like |
| M2M | `GET /api/m2m/whoami/`, `employees/`, `attendance/`, `accounts/<id>/rotate/` |

Tất cả dùng DRF, JSON. Endpoint list quan trọng dùng `annotate()` để tránh N+1.

---

## 5. Thuật toán & Logic nghiệp vụ trọng yếu

### 5.1 Chấm công (clock-in/out) — `horilla_api/api_views/attendance/views.py`
1. `_clock_device_guard`: chặn **desktop** (403) và **thiếu ảnh camera** (400 "Bắt buộc bật camera"). → "không chấm được" thường là **lỗi camera**, không phải GPS.
2. Tạo `AttendanceActivity`, lưu GPS + ảnh selfie, device/UA.
3. `_check_geofence`: chỉ **flag** `geo_valid` (True/False/None), **KHÔNG chặn** chấm công.
4. Logger `hnh.clock` (INFO→stdout) ghi `CLOCK IN/OUT ok` + `CLOCK BLOCKED reason=...` kèm user/device/UA để chẩn đoán (`docker logs ... | grep CLOCK`).
5. **Gia cố PWA** (`ClockModal.tsx`): capture ảnh ≤720px (giảm RAM, tránh iOS reload/"văng"); chống chấm lặp <45s qua `localStorage` (sống sót qua reload).

### 5.2 Tính công ngày
- **ALD26** (`recompute_ald26_day`): gom mọi clock_in/out trong ngày, sắp xếp; ≥2 lượt → công = (lượt cuối − lượt đầu), không trừ trưa; 1 lượt → NCO (ra=NULL); 0 lượt → vắng. `minimum_working_hour` 09:35 = 100% công.
- **Giờ lõi**: đi trễ tính theo `core_start_time || start_time` (+ grace), về sớm theo `core_end_time || end_time`. ALD26 = 08:00/17:30 dù khung ca 00:00–23:58.
- **One-way shifts**: ca có `check_mode` clock_in_only/clock_out_only tính theo mép ca tương ứng.

### 5.3 Lương (payroll) — `payroll/views/contract_hnh_views.py`
- **G/H** theo loại HĐ (xem SRS FR-5.2). Bảng lương tháng `MonthlyPayrollEntry` tính cột J→AK:
  - LCB thực nhận J = G×(F/E); LHS Pool K = H−G−L+I; OT T = Σ(giờ×đơn giá/giờ×hệ số); KPI thực nhận V = KPI%×K; Gross thực tế AB; BHXH 8% / BHYT 1.5% / BHTN 1% (có **trần**); **thuế TNCN lũy tiến 7 bậc**; giảm trừ bản thân 11tr + NPT; thực lĩnh AK.
- Công thức đồng bộ **Python (server) + JavaScript (realtime UI)**.
- Tuân thủ trần BHXH/BHYT, BHTN và bậc thuế theo Luật VN (cấu hình qua management command `setup_hnh_payroll`).

### 5.4 Duyệt nghỉ phép
- Đơn tạo ra sinh `LeaveRequestConditionApproval` cho từng người duyệt; **C&B cố định** (`resolve_cb_manager`) luôn được chèn server-side vào approver + watcher.
- **Bất kỳ 1 người duyệt** approve → `LeaveRequest.status="approved"` (PWA flow); guard thẩm quyền: chỉ reporting manager / approver có ConditionApproval / C&B / staff được duyệt.
- Watcher lưu `LeaveRequestWatcher`, notify khi tạo/duyệt/từ chối.

### 5.5 Import & đồng bộ
- Import chấm công Excel (`attendance/views/hnh_import.py`): match badge_id, parse ngày/giờ, bỏ ngày vắng, chống trùng (badge_id, date).
- Sync standby→stage (`deploy/sync_standby_to_stage.sh`): upsert `auth_user` → employee/shift → replace attendance; reset sequence; đối chiếu số bản ghi.

---

## 6. Thiết kế Frontend (PWA)

- **Cấu trúc:** `main.tsx` (AuthProvider → BrowserRouter → App) → `App.tsx` routing → `AppShell` (TopBar + BottomNav/SideNav) → 77 pages.
- **State:** React Context (`AuthProvider`, `ToastProvider`) + local useState. Không lưu JWT ở client — **cookie auth** (`credentials: 'include'`), API base `/bff`.
- **Hooks lib:** `useApi` (fetch), `useClock` (chấm công), `useGeolocation` (GPS + geofence HNH office), `useNotificationPolling` (15s + âm thanh + badge), `useAutoClockOut`, `useTablet`.
- **Theme:** `lib/theme.ts` — màu HNH (navy #142B6F, red #c0222b, gold). Mobile-first, safe-area.
- **PWA:** vite-plugin-pwa (Workbox autoUpdate), `manifest.webmanifest`, custom `push-sw.js` (Web Push), install banner iOS/Android, offline cache fonts, pull-to-refresh.
- **Component dùng chung:** `ClockModal` (GPS+camera+minimap), `ProfileTabs` (Overview/Contracts/Leave/Account), `ui/*` (Icon, Badge, Toast, Avatar...).

---

## 7. Tích hợp

| Tích hợp | Thiết kế |
|----------|----------|
| Keycloak | OIDC login (BFF PKCE) + Admin REST (`keycloak_service.py`: create/rename/reset/disable user; toggle realm editUsernameAllowed khi đổi username). Sync role/user. |
| Máy chấm công | `biometric_ingest.py` nhận M2M punch (Ronald Jack pyzk / Dahua), dedup 120s, match badge_id. |
| Email | SMTP động (`DynamicEmailConfiguration`, ưu tiên Gmail) — welcome, reset, bảng lương. |
| Geofencing | `geofencing/utils.check_geofence(lat, lng, company)` — validate vùng văn phòng. |
| Web Push | VAPID; `push.ts` subscribe; `push-sw.js` hiển thị + click→điều hướng. |
| Weather | Proxy `/api/base/weather/` → wttr.in (tránh CORS iOS). |
| App nội bộ | M2M integration config (token/base_url) + embed session handoff (Arkon, EOffice, 1StopShop, IAM, AppVMB). |

---

## 8. Thiết kế Bảo mật

- **SSO-only**: local login tắt; bắt buộc Keycloak OIDC (RS256, JWKS, clock skew 5'). `oidc_backend` không tự tạo user.
- **M2M 3 lớp**: IP CIDR (Wireguard/Docker/localhost) + token SHA256 + scope. Token rotate được.
- **Chấm công**: bắt buộc camera + chặn desktop; GPS flag (không lộ vị trí làm hard gate); log device/UA để truy vết.
- **Secrets**: qua biến môi trường (`OIDC_RP_CLIENT_SECRET`, `KC_ADMIN_*`, `EMAIL_*`, `VAPID_*`, `DATABASE_URL`...). Không commit `.env`/`.env.stage`. KC admin creds chỉ truy cập qua container env, không in ra.
- **Proxy SSL**: `SECURE_PROXY_SSL_HEADER`, `USE_X_FORWARDED_*` cho Cloudflare→nginx.
- **Audit**: `horilla_audit` / `auditlog` ghi lịch sử thay đổi.

---

## 9. Triển khai & Hạ tầng

### 9.1 Topology

| | Production | Stage |
|---|-----------|-------|
| Server | `100.99.164.24` (hnhlive) | `100.88.75.106` (azurestage) |
| Key SSH | `es-hrm.pem` | `naquan.pem` |
| Checkout | `/opt/hnh/horilla` | `/opt/horilla` |
| Compose | `docker-compose.prod.yml` | `docker-compose.stage.yml` |
| DB | `horilla_prod` | `horilla_stage` (+ standby replica của prod) |
| Site | qlns.hnhtravel.work | qlns-stage.hnhtravel.work |
| Keycloak | container `HNHSSO` (chung cho cả 2 môi trường) | (trỏ về prod KC) |

Cả 2 deploy từ branch **`horilla_aqv10`**. Container: web, db (postgres:16), redis, nginx, cloudflared (+ pwa, bff).

### 9.2 Quy trình deploy
1. Local: commit + `git push origin horilla_aqv10`.
2. Server: `cd <checkout> && git pull --ff-only`.
3. `docker compose -f <compose> build web` (+ `build --no-cache pwa` nếu đổi frontend).
4. `docker compose ... up -d`.
5. `docker compose ... exec web python manage.py migrate`.
- Stage có `deploy.sh` tự so HEAD trước/sau pull để quyết rebuild web/pwa/bff. Prod chạy thủ công.
- **Quy tắc:** test migration trên stage trước prod; deploy 1 commit = deploy cả branch tích lũy → luôn kiểm `git log HEAD..origin/horilla_aqv10`.

### 9.3 Cấu hình hệ thống (`horilla/settings.py`)
- `LANGUAGE_CODE="vi"`, `TIME_ZONE="Asia/Ho_Chi_Minh"`, `WHITE_LABELLING=True`, `THEME_APP="horilla_theme"`.
- OIDC: `KC_BASE` (realm HNHTravel-SGN), `OIDC_RP_CLIENT_ID="horilla-hrm"`, `OIDC_REDIRECT_BASE_URL`, `LOGIN_REDIRECT_URL="/pwa/"`.
- KC Admin: `KC_SERVER_URL`, `KC_REALM`, `KC_ADMIN_*` (qua env).
- `LOGGING`: logger `hnh.clock` (INFO→stdout) cho chẩn đoán chấm công.
- DB Postgres qua `DATABASE_URL`/`DB_*`. `.env` symlink → `.env.prod`/`.env.stage`.

---

## 10. Vận hành (Operations)

### 10.1 Management commands chính
| Command | Mục đích |
|---------|----------|
| `setup_hnh_company` | Khởi tạo công ty, phòng ban, vị trí, ca, loại nghỉ |
| `setup_hnh_payroll` | FilingStatus thuế TNCN 7 bậc + deductions/allowances chuẩn |
| `setup_ald26` / `backfill_ald26` | Tạo ca ALD26 + gán NV / recompute công 1 tháng |
| `import_hnh_employees` | Import DSNV từ Excel |
| `setup_hnh_leave_types` | Loại nghỉ Nhóm 2 |
| `record_standby_sync` | Ghi log đồng bộ standby |

### 10.2 Giám sát & backup
- `SystemHealthLog`: cron stage (mỗi 1h) kiểm tra replication prod↔standby (so row count thật qua SSH) + tuổi backup SSO; push log sang prod (`X-Sync-Token`).
- Backup SSO (Keycloak) cron prod 02:00 → sync sang stage.
- Sync standby→stage cron 05:00/13:00.

### 10.3 Chẩn đoán nhanh
- Lỗi chấm công: `docker compose -f docker-compose.prod.yml logs web | grep CLOCK`.
- Lưu ý: `GPSCheckInLog` là **legacy, rỗng** — không dùng chẩn đoán; dùng `attendance_attendanceactivity` + log `hnh.clock`.

---

## Phụ lục: cập nhật bản dịch
```bash
python manage.py makemessages -l vi --ignore=node_modules --ignore=venv
python manage.py compilemessages -l vi
```

> Tài liệu này phản ánh codebase tại 2026-06-25 (branch `horilla_aqv10`). Một số chi tiết công thức/endpoint cần đối chiếu trực tiếp với mã nguồn khi triển khai thay đổi.

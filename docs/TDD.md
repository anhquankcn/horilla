# Technical Design Document (TDD)
## Horilla HRM — Công ty Du lịch Hồng Ngọc Hà (HNH Travel)

| | |
|---|---|
| Phiên bản | 1.1 |
| Ngày | 2026-07-12 |
| Branch | `horilla_aqv10` |
| Nguồn | Sinh từ codebase (39 Django apps, PWA React/Vite, Keycloak, Postgres); cập nhật tính năng 06–07/2026 |

> Tài liệu thiết kế kỹ thuật. Yêu cầu nghiệp vụ xem [SRS.md](./SRS.md); đặc tả chức năng xem [FRD.md](./FRD.md); bối cảnh kinh doanh xem [BRD.md](./BRD.md). Mọi secret dùng placeholder `<env>` — không ghi giá trị thật.

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
                     │ OIDC + MS Graph      │ ORM
            ┌────────▼─────────┐    ┌───────▼────────┐   ┌─────────┐
            │  Keycloak (KC)   │    │  PostgreSQL 16  │   │  Redis  │
            │  HNHTravel-SGN   │    │  horilla_prod   │   │cache/q/ss│
            └──────────────────┘    └────────┬────────┘   └─────────┘
                     ▲                        │ streaming replication
            Microsoft 365 IdP        ┌────────▼────────┐
            + Outlook Calendar       │ Standby replica  │ (stage host)
                                     └──────────────────┘
```

**Thành phần:**
- **Django monolith** (`horilla`) — server-rendered admin + REST API (`horilla_api`) + business logic. gunicorn.
- **PWA** (`pwa/frontend`) — React 18 + Vite, build tĩnh, phục vụ tại `/pwa/`.
- **BFF** (`pwa/bff`) — Node Fastify: điều phối OIDC (PKCE), proxy `/bff/api/*` → `/api/*` với JWT server-side (httpOnly cookie), tránh CORS; giữ **Outlook refresh_token** per-user để gọi Microsoft Graph.
- **Keycloak** — IdP tập trung (realm HNHTravel-SGN, client horilla-hrm), liên kết Microsoft 365.
- **PostgreSQL 16** — dữ liệu chính; standby replica (streaming) phục vụ giám sát + đồng bộ stage.
- **Redis** — cache + queue + **session persist** (BFF), giúp deploy web không buộc re-login. **nginx** — reverse proxy. **cloudflared** — Cloudflare Tunnel.

---

## 2. Technology Stack

| Lớp | Công nghệ |
|-----|-----------|
| Backend | Python / Django, Django REST Framework, SimpleJWT, mozilla_django_oidc, python-keycloak |
| Frontend | React 18.3, Vite 6, TypeScript 5.8 (strict), Tailwind CSS 3.4, react-router v7, vite-plugin-pwa (Workbox) |
| BFF | Node.js, Fastify, Undici; Microsoft Graph (Calendars.Read) |
| Auth/SSO | Keycloak 26.2 (OIDC, RS256), Microsoft 365 federation |
| DB / Cache | PostgreSQL 16, Redis |
| Hạ tầng | Docker Compose, nginx, Cloudflare Tunnel |
| Tích hợp | SMTP (Gmail), VAPID Web Push, biometric (pyzk/Dahua), geofencing, Microsoft Graph, wttr.in |

---

## 3. Mô hình dữ liệu (Data Model)

Hệ thống gồm **39 Django apps**. Module cốt lõi và quan hệ:

```
Company ──< Department ──< JobPosition ──< JobRole
   │         (M2M)
   ├──< EmployeeShift ──< EmployeeShiftSchedule (day, start/end, core_start/end, min_hour, coefficient, check_mode)
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
OutlookToken (1-1 User) — refresh_token mã hóa (Fernet) cho Microsoft Graph
CalendarToken (1-1 User) — token feed .ics cá nhân
```

**Model HNH-custom đáng chú ý:**
- `WorkLevel` — cấp bậc 1–8 + quyền lợi (BHXH, BHNT, WFH, phụ cấp) theo cấp.
- `HNHEmployeeProfile` — mở rộng hồ sơ (CCCD, BHXH, thuế, hộ khẩu, theo dõi reset mật khẩu).
- `EmployeeShiftSchedule.core_start_time/core_end_time` — giờ lõi tính trễ/sớm (ALD26 = 08:00/17:30), tách khỏi khung ca.
- `CBLeaveManager` + `LeaveRequestWatcher` — C&B cố định + người theo dõi đơn nghỉ.
- `HNHCompensatoryProposal` — đề xuất phép bù manager→C&B.
- `TrialContract / OfficialContract / PerformanceContract / ContractKPIAppendix / MonthlyPayrollEntry` — hệ hợp đồng & lương HNH.
- `OutlookToken` / `CalendarToken` — tích hợp lịch (Outlook + feed .ics).
- `SystemHealthLog` (base) — log giám sát replication + backup SSO.

Migration chuẩn Django; thay đổi gần đây: `leave.0007+` (CBLeaveManager + Watcher, seed C&B toàn cục), `base.0037+` (core times + seed ALD26 08:00/17:30), `base.0039` (OutlookToken), `base.0040` (AppFeature leave-approver-config).

---

## 4. Thiết kế API

API REST trong `horilla_api/`, **16 nhóm**: `asset, attendance, auth, base, calendar, employee, eoffice, expenses, helpdesk, leave, m2m, notifications, payroll, project, tourism, wc2026`.

### 4.1 Xác thực
- **Người dùng (web/mobile):** Keycloak OIDC. PWA dùng **BFF flow**: PKCE → exchange code → SimpleJWT trong httpOnly cookie; `/bff/api/*` proxy kèm JWT server-side. Backend map claims → user (`oidc_backend`): email→email / email→username / preferred_username→username.
- **M2M:** `m2m_auth.py` — **3 lớp**: IP CIDR allowlist + token SHA256 (`X-HNH-Service-Token`) + scope `resource:action`.
- **Permission classes:** `IsAuthenticated`, `ManagerPermission`, helper nghiệp vụ `_can_onboard` (nhóm C&B/admin), `_is_cnb`, `require_m2m_scope(...)`.

### 4.2 Nhóm endpoint chính (đại diện)

| Nhóm | Endpoint tiêu biểu |
|------|--------------------|
| Attendance | `POST clock-in/`, `clock-out/`, `biometric-punch/`; `GET export-monthly/[/xlsx/]`, `activity-overview/` (24 slot/giờ), `activity-detail/` (self) |
| Leave | `POST user-request-days/`, `user-request-hours/`, `pwa-approve/<id>/`, `pwa-reject/<id>/`; `GET hnh-approved-leaves/?status=`, `hnh-leave-overview/`, `cb-managers/`, `watching/`; `DELETE user-request/<id>/`; `POST hnh-cancel-approved/<id>/` |
| Employee | `GET me/`, `me/day-detail/`, `directory/`; `POST onboard/`, `<pk>/kc-account/`, `<pk>/kc-account/identity/` |
| Payroll | `GET my-payslip/`, `payroll-management/`, `contract/` |
| Calendar | `GET events/`, `token/`, `outlook-token/`; BFF `/bff/api/calendar/outlook`, `/bff/outlook/status` |
| Base | `GET system-health/`, `weather/`, `keycloak/sync-*` |
| Notifications | `GET summary/`, `push/vapid-key/`; `POST push/subscribe/`; announcements feed/like |
| M2M | `GET whoami/`, `employees/`, `attendance/`; `accounts/<id>/rotate/` |

Tất cả DRF/JSON. Endpoint list quan trọng dùng `annotate()` tránh N+1.

---

## 5. Thuật toán & Logic nghiệp vụ trọng yếu

### 5.1 Chấm công — `horilla_api/api_views/attendance/views.py`
1. `_clock_device_guard`: chặn **desktop** (403) + **thiếu ảnh camera** (400). → "không chấm được" thường là **lỗi camera**, không phải GPS.
2. Tạo `AttendanceActivity`, lưu GPS + ảnh selfie, device/UA.
3. `_check_geofence`: chỉ **flag** `geo_valid`, **KHÔNG chặn**; ngoài vùng → **notify quản lý** (`notify.send` kèm `redirect=reverse("attendance-view")` — bắt buộc truyền redirect, tránh TypeError receiver WhatsApp).
4. Logger `hnh.clock` ghi `CLOCK IN/OUT ok` + `CLOCK BLOCKED reason=...`.
5. **Gia cố PWA** (`ClockModal`): ảnh ≤720px (giảm RAM iOS); chống chấm lặp <45s qua localStorage.

### 5.2 Tính công ngày
- **ALD26** (`recompute_ald26_day`): gom clock in/out, sắp xếp; ≥2 lượt → công = (cuối − đầu), không trừ trưa; 1 lượt → NCO; 0 → vắng. Min 09:35 = 100%.
- **Giờ lõi**: trễ theo `core_start_time || start_time` (+grace), sớm theo `core_end_time || end_time`. ALD26 = 08:00/17:30.
- **One-way shifts**: `check_mode` clock_in_only/clock_out_only tính theo mép ca.

### 5.3 Lương — `payroll/views/contract_hnh_views.py`
- **G/H** theo loại HĐ (SRS FR-5.2). `MonthlyPayrollEntry` tính cột J→AK: LCB thực nhận, LHS Pool, OT (Σ giờ×đơn giá×hệ số), KPI, Gross thực tế, BHXH 8%/BHYT 1.5%/BHTN 1% (có trần), **thuế TNCN lũy tiến 7 bậc**, giảm trừ bản thân + NPT, thực lĩnh.
- Công thức đồng bộ **Python (server) + JavaScript (realtime UI)**; cấu hình qua `setup_hnh_payroll`.

### 5.4 Duyệt nghỉ phép
- Đơn sinh `LeaveRequestConditionApproval` cho từng approver; **C&B cố định** (`resolve_cb_manager`) chèn server-side vào approver + watcher.
- **Bất kỳ 1 approver** approve → `status="approved"`; guard `_can_approve_leave`: reporting manager / ConditionApproval / **nhóm C&B (toàn tổ chức)** / staff.
- C&B xem đơn `requested` toàn tổ chức qua `HNHApprovedLeavesView?status=requested` (không phụ thuộc routing per-employee); duyệt tại chỗ qua `pwa-approve`/`pwa-reject`.
- Watcher lưu `LeaveRequestWatcher`, notify khi tạo/duyệt/từ chối/hủy. NV xóa đơn `requested` của mình (`EmployeeLeaveRequestUpdateDeleteAPIView`).

### 5.5 Lịch & Outlook *(mới 07/2026)*
- Lịch tổng hợp: `CalendarEventsView` trả sự kiện HRM (nghỉ phép + lễ, all_day). Outlook merge **client-side** qua BFF (`/bff/api/calendar/outlook` → Microsoft Graph `calendarView`), token per-user (`OutlookToken`, Fernet).
- **Timeline 24h cá nhân** (`me/day-detail` + `activity-detail` + Outlook): lồng lượt chấm + sự kiện có giờ vào **đúng khung giờ** (map theo `HH`); sự kiện Outlook cả ngày ở dải trên.
- **Hoạt động chấm công**: `AttendanceActivityOverviewView` sinh **24 slot/giờ** (đếm cả clock_in + clock_out mỗi khung), FE tách sáng/chiều; view list gom theo NV → chuỗi lượt chấm (`flattenPunches`).

### 5.6 Import & đồng bộ
- Import chấm công Excel (`attendance/views/hnh_import.py`): match badge_id, bỏ ngày vắng, chống trùng (badge_id, date).
- Sync standby→stage (`deploy/sync_standby_to_stage.sh`): upsert auth_user → employee/shift → replace attendance; reset sequence; đối chiếu row count.

---

## 6. Thiết kế Frontend (PWA)

- **Cấu trúc:** `main.tsx` (AuthProvider → BrowserRouter → App) → `App.tsx` (**81 routes**) → `AppShell` (TopBar + BottomNav/SideNav) → **81 pages**.
- **State:** React Context (`AuthProvider`, `ToastProvider`) + local useState. **Không lưu JWT client** — cookie auth (`credentials:'include'`), API base `/bff`.
- **Hooks lib:** `useApi`, `useClock`, `useGeolocation`, `useNotificationPolling` (15s + âm thanh + badge), `useAutoClockOut`, `useOutlookEvents`, `useTablet`.
- **Theme:** `lib/theme.ts` — màu HNH (navy #142B6F, red #c0222b, gold). Mobile-first, safe-area.
- **PWA:** vite-plugin-pwa (Workbox autoUpdate), manifest, `push-sw.js` (Web Push), install banner iOS/Android, offline cache, pull-to-refresh.
- **Component dùng chung:** `ClockModal` (GPS+camera+minimap), `AttendanceActivityDetail` (`flattenPunches` → chuỗi lượt chấm, dùng chung CC Tháng + timeline + Home), `ProfileTabs`, `ui/*`.
- **Màn hình chính (mới 07/2026):** `AttendanceActivity` (grid 24h + list chuỗi lượt), `DayDetail` (timeline 24h lồng Outlook + chấm công), `LeaveManagement` (C&B duyệt đơn chờ), `LeaveOverview` (tổng quan phép + modal chi tiết đơn).

---

## 7. Tích hợp

| Tích hợp | Thiết kế |
|----------|----------|
| Keycloak | OIDC login (BFF PKCE) + Admin REST (`keycloak_service.py`: create/rename/reset/disable; toggle `editUsernameAllowed` khi đổi username). Sync role/user. |
| Máy chấm công | `biometric_ingest.py` nhận M2M punch (Ronald Jack pyzk / Dahua), dedup 120s, match badge_id. |
| Email | SMTP động (`DynamicEmailConfiguration`, ưu tiên Gmail) — welcome, reset, bảng lương. |
| Geofencing | `geofencing/utils.check_geofence(lat, lng, company)`. |
| Web Push | VAPID; `push.ts` subscribe; `push-sw.js` hiển thị + điều hướng. |
| Outlook | BFF Microsoft Graph (Calendars.Read), refresh_token per-user (`OutlookToken`, Fernet). |
| Weather | Proxy `/api/base/weather/` → wttr.in (tránh CORS iOS). |
| App nội bộ | M2M integration config + embed session handoff (Arkon, EOffice, 1StopShop, IAM, AppVMB). |

---

## 8. Thiết kế Bảo mật

- **SSO-only**: local login tắt; Keycloak OIDC (RS256, JWKS, clock skew 5'). `oidc_backend` không tự tạo user.
- **M2M 3 lớp**: IP CIDR (Wireguard/Docker/localhost) + token SHA256 + scope. Token rotate được.
- **Chấm công**: bắt buộc camera + chặn desktop; GPS flag (không dùng làm hard gate); log device/UA để truy vết.
- **Secrets**: qua env (`OIDC_RP_CLIENT_SECRET`, `KC_ADMIN_*`, `EMAIL_*`, `VAPID_*`, `DATABASE_URL`, Outlook Fernet key). Không commit `.env`/`.env.stage`.
- **Proxy SSL**: `SECURE_PROXY_SSL_HEADER`, `USE_X_FORWARDED_*` cho Cloudflare→nginx.
- **Audit**: `horilla_audit`/`auditlog` ghi lịch sử thay đổi (đổi định danh, reset mật khẩu, chỉnh số dư phép).

---

## 9. Triển khai & Hạ tầng

### 9.1 Topology

| | Production | Stage |
|---|-----------|-------|
| Server | `100.99.164.24` | `100.88.75.106` |
| Key SSH (Windows) | `D:\HNH2026\Cloud\es-hrm.pem` | `D:\HNH2026\Cloud\naquan.pem` |
| Checkout | `/opt/hnh/horilla` | `/opt/horilla` |
| Compose | `docker-compose.prod.yml` | `docker-compose.stage.yml` |
| DB | `horilla_prod` | `horilla_stage` (+ standby replica của prod) |
| Site | qlns.hnhtravel.work | qlns-stage.hnhtravel.work |
| Keycloak | container `HNHSSO` (chung) | (trỏ về prod KC) |

Cả 2 deploy từ branch `horilla_aqv10`. Container: web, db (postgres:16), redis, nginx, cloudflared (+ pwa, bff).

### 9.2 Quy trình deploy
1. Local: commit + `git push origin horilla_aqv10`.
2. Server: `cd <checkout> && sudo git pull --ff-only`.
3. `docker compose -f <compose> up -d --no-deps --build web pwa` (chọn service theo thay đổi: chỉ web nếu đổi Django, chỉ pwa nếu đổi frontend, cả hai nếu đụng cả).
4. `docker exec horilla-nginx-1 nginx -s reload` (lấy IP container mới).
5. Nếu có migration: `docker compose ... exec -T web python manage.py migrate --no-input`.
- **Lưu ý:** `deploy.sh` trên prod thực chất là bản của stage (hardcode `/opt/horilla` + `docker-compose.stage.yml`) → **KHÔNG chạy trên prod**; deploy prod thủ công theo các bước trên. Web `build: .` (code bake vào image) → sửa .py/.tsx PHẢI rebuild. Đổi frontend → người dùng cần hard refresh PWA. Đụng web/pwa (không bff) → không buộc re-login (Redis session).
- **Quy tắc:** test migration trên **stage trước prod**; deploy 1 commit = deploy cả branch tích lũy → kiểm `git log HEAD..origin/horilla_aqv10`.

### 9.3 Cấu hình hệ thống (`horilla/settings.py`)
- `LANGUAGE_CODE="vi"`, `TIME_ZONE="Asia/Ho_Chi_Minh"`, `WHITE_LABELLING=True`, `THEME_APP="horilla_theme"`.
- OIDC: `KC_BASE` (realm HNHTravel-SGN), `OIDC_RP_CLIENT_ID="horilla-hrm"`, `OIDC_REDIRECT_BASE_URL`, `LOGIN_REDIRECT_URL="/pwa/"`.
- KC Admin: `KC_SERVER_URL`, `KC_REALM`, `KC_ADMIN_*` (env).
- `LOGGING`: logger `hnh.clock` (INFO→stdout) cho chẩn đoán chấm công.
- DB Postgres qua `DATABASE_URL`/`DB_*`. `.env` symlink → `.env.prod`/`.env.stage`.

---

## 10. Vận hành (Operations)

### 10.1 Management commands chính
| Command | Mục đích |
|---------|----------|
| `setup_hnh_company` | Khởi tạo công ty, phòng ban, vị trí, ca, loại nghỉ |
| `setup_hnh_payroll` | FilingStatus thuế TNCN 7 bậc + deductions/allowances |
| `setup_ald26` / `backfill_ald26` | Tạo ca ALD26 + gán NV / recompute công 1 tháng |
| `import_hnh_employees` | Import DSNV từ Excel |
| `setup_hnh_leave_types` | Loại nghỉ Nhóm 2 |
| `record_standby_sync` | Ghi log đồng bộ standby |

### 10.2 Giám sát & backup
- `SystemHealthLog`: cron stage (mỗi 1h) kiểm tra replication prod↔standby (so row count qua SSH) + tuổi backup SSO; push log sang prod (`X-Sync-Token`).
- Backup SSO (Keycloak) cron prod 02:00 → sync sang stage. Sync standby→stage cron 05:00/13:00.

### 10.3 Chẩn đoán nhanh
- Lỗi chấm công: `docker compose -f docker-compose.prod.yml logs web | grep CLOCK`.
- Lưu ý: `GPSCheckInLog` là **legacy, rỗng** — dùng `attendance_attendanceactivity` + log `hnh.clock`.

---

## Phụ lục: cập nhật bản dịch
```bash
python manage.py makemessages -l vi --ignore=node_modules --ignore=venv
python manage.py compilemessages -l vi
```

> Cập nhật 1.1 (2026-07-12): thêm §5.5 (lịch/Outlook + timeline 24h + hoạt động chấm công 24h), model OutlookToken/CalendarToken (§3), endpoint mới (§4.2), màn hình PWA mới (§6), fix geofence notify redirect (§5.1), lưu ý deploy.sh prod (§9.2). Tài liệu phản ánh codebase branch `horilla_aqv10` tại 2026-07-12; chi tiết công thức/endpoint đối chiếu mã nguồn khi triển khai thay đổi.

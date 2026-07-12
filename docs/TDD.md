# Technical Design Document (TDD)
## HRM Platform — Portable Technical Design

| | |
|---|---|
| Phiên bản | 2.0 (portable) |
| Ngày | 2026-07-12 |
| Nguồn | Codebase Horilla-based (39 Django apps, PWA React/Vite, Keycloak, Postgres) |
| Reference Implementation (RI) | HNH Travel — production (branch `horilla_aqv10`) |
| Baseline nghiệp vụ | [SRS.md](./SRS.md), [FRD.md](./FRD.md), [BRD.md](./BRD.md) |

> Tài liệu thiết kế kỹ thuật. Mọi secret dùng placeholder `<env>` — không ghi giá trị thật. Chi tiết gắn doanh nghiệp tham chiếu đánh dấu **`[RI]`**; điểm cần điều chỉnh cho tổ chức khác **`[Adopter]`**.

---

## 1. Kiến trúc tổng thể

```
                         Internet (HTTPS)
                              │
                    ┌─────────▼──────────┐
                    │  Edge / Tunnel      │  [RI] Cloudflare Tunnel
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │       nginx         │  reverse proxy / SPA fallback
                    └───┬─────────┬───────┘
          /pwa, /bff    │         │  /api, /admin, /oidc
              ┌─────────▼──┐   ┌──▼─────────────┐
              │  PWA (dist) │   │   Django web    │  gunicorn
              │  React/Vite │   │  (monolith)     │
              └──────┬──────┘   └──┬───────┬──────┘
            /bff/*   │             │       │
              ┌──────▼──────┐      │       │
              │  BFF (Node)  │──────┘       │
              │  Fastify     │  proxy /api  │
              └──────┬───────┘              │
                     │ OIDC                 │ ORM
            ┌────────▼─────────┐    ┌───────▼────────┐   ┌─────────┐
            │  IdP (Keycloak)  │    │  PostgreSQL 16  │   │  Redis  │
            └──────────────────┘    └────────┬────────┘   └─────────┘
                     ▲                        │ streaming replication
       [Adopter] Azure AD/AD FS      ┌────────▼────────┐
                                     │ Standby replica  │
                                     └──────────────────┘
```

**Thành phần:**
- **Django monolith** — server-rendered admin + REST API (`horilla_api`) + business logic. gunicorn.
- **PWA** (`pwa/frontend`) — React 18 + Vite, build tĩnh, phục vụ tại `/pwa/`.
- **BFF** (`pwa/bff`) — Node Fastify: điều phối OIDC (PKCE), proxy `/bff/api/*` → `/api/*` với JWT server-side (httpOnly cookie), tránh CORS; giữ **Outlook refresh_token** per-user để gọi Microsoft Graph.
- **IdP** — `[RI]` Keycloak (realm HNHTravel-SGN, client horilla-hrm), liên kết Microsoft 365. `[Adopter]` Azure AD/AD FS.
- **PostgreSQL 16** — dữ liệu chính; standby replica (streaming) phục vụ giám sát + đồng bộ stage.
- **Redis** — cache + queue + **session persist** (BFF), giúp deploy web không buộc re-login.

> **`[Adopter]` ngân hàng:** thay Cloudflare Tunnel bằng WAF/LB nội bộ; đặt IdP = AD doanh nghiệp; bổ sung HA (multi-AZ) + DR; bật mã hóa at-rest cho DB.

---

## 2. Technology Stack

| Lớp | Công nghệ |
|-----|-----------|
| Backend | Python / Django, Django REST Framework, SimpleJWT, mozilla_django_oidc, python-keycloak |
| Frontend | React 18.3, Vite 6, TypeScript 5.8 (strict), Tailwind CSS 3.4, react-router v7, vite-plugin-pwa (Workbox) |
| BFF | Node.js, Fastify, Undici; Microsoft Graph (Calendars.Read) |
| Auth/SSO | `[RI]` Keycloak 26.2 (OIDC, RS256) + Microsoft 365 federation; `[Adopter]` Azure AD |
| DB / Cache | PostgreSQL 16, Redis |
| Hạ tầng | Docker Compose, nginx, `[RI]` Cloudflare Tunnel |
| Tích hợp | SMTP, VAPID Web Push, biometric (pyzk/Dahua), geofencing, Microsoft Graph |

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
   ├── 1-1 HNHEmployeeProfile [RI] (CCCD, BHXH, thuế, hộ khẩu, last_password_reset_sent_at/by)
   ├── 1-1 EmployeeBankDetails
   ├──< AttendanceActivity / Attendance / GPSCheckInLog / LateComeEarlyOut / OverTime
   ├──< LeaveRequest ──< LeaveRequestConditionApproval (sequence, manager)
   │                  └──< LeaveRequestWatcher
   ├──< AvailableLeave (×LeaveType)
   ├──< TrialContract / OfficialContract / PerformanceContract (kế thừa ContractBase)
   │        └──< ContractKPIAppendix
   └──< MonthlyPayrollEntry / Payslip / LoanAccount / Reimbursement

CBLeaveManager (company?, department?, manager)  — config bộ phận duyệt phép cố định; match cụ thể nhất thắng
OutlookToken (1-1 User) — refresh_token mã hóa (Fernet) cho Microsoft Graph
CalendarToken (1-1 User) — token feed .ics cá nhân
```

**Model đáng chú ý (RI-custom, adopter thay được):**
- `WorkLevel` — cấp bậc 1–8 + quyền lợi theo cấp. `[Adopter]` → ngạch/bậc ngân hàng.
- `EmployeeShiftSchedule.core_start_time/core_end_time` — **giờ lõi** tính trễ/sớm, tách khỏi khung ca (`[RI]` ALD26 = 08:00/17:30). **Điểm cấu hình then chốt** để đổi mô hình ca.
- `CBLeaveManager` + `LeaveRequestWatcher` — bộ phận duyệt cố định + người theo dõi.
- `HNHCompensatoryProposal` — đề xuất phép bù.
- `TrialContract/OfficialContract/PerformanceContract/ContractKPIAppendix/MonthlyPayrollEntry` — hệ hợp đồng & lương. `[Adopter]` thay công thức, giữ khung.
- `OutlookToken` / `CalendarToken` — tích hợp lịch.
- `SystemHealthLog` — log giám sát replication + backup.

Migration quản lý chuẩn Django. Thay đổi gần đây: `leave.0007+` (CBLeaveManager + Watcher, seed bộ phận duyệt toàn cục), `base.0037+` (core times + seed ca `[RI]` 08:00/17:30), `base.0039` (OutlookToken).

---

## 4. Thiết kế API

API REST trong `horilla_api/`, nhóm theo module: **16 nhóm** — `asset, attendance, auth, base, calendar, employee, eoffice, expenses, helpdesk, leave, m2m, notifications, payroll, project, tourism, wc2026`.

### 4.1 Xác thực
- **Người dùng (web/mobile):** OIDC qua IdP. PWA dùng **BFF flow**: PKCE → exchange code → JWT trong httpOnly cookie; `/bff/api/*` proxy kèm JWT server-side. Backend map claims → user (`oidc_backend`): email→email / email→username / preferred_username→username.
- **M2M:** `m2m_auth.py` — **3 lớp**: IP CIDR allowlist + token SHA256 (`X-HNH-Service-Token`) + scope `resource:action`.
- **Permission classes:** `IsAuthenticated`, `ManagerPermission`, helper nghiệp vụ `_can_onboard`, `_is_cnb`, `require_m2m_scope(...)`.

### 4.2 Nhóm endpoint chính (đại diện)

| Nhóm | Endpoint tiêu biểu |
|------|--------------------|
| Attendance | `POST clock-in/`, `clock-out/`, `biometric-punch/`; `GET export-monthly/[/xlsx/]`, `activity-overview/`, `activity-detail/` |
| Leave | `POST user-request-days/`, `user-request-hours/`, `pwa-approve/<id>/`, `pwa-reject/<id>/`; `GET hnh-approved-leaves/?status=`, `hnh-leave-overview/`, `cb-managers/`, `watching/`; `DELETE user-request/<id>/` |
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
1. `_clock_device_guard`: `[RI]` chặn **desktop** (403) + **thiếu ảnh camera** (400). → "không chấm được" thường là **lỗi camera**, không phải GPS.
2. Tạo `AttendanceActivity`, lưu GPS + ảnh selfie, device/UA.
3. `_check_geofence`: chỉ **flag** `geo_valid`, **KHÔNG chặn**; ngoài vùng → notify quản lý (redirect trang duyệt).
4. Logger chẩn đoán ghi `CLOCK IN/OUT ok` + `CLOCK BLOCKED reason=...`.
5. **Gia cố PWA** (`ClockModal`): ảnh ≤720px (giảm RAM iOS); chống chấm lặp <45s qua localStorage.

### 5.2 Tính công ngày
- **`[RI]` ALD26** (`recompute_ald26_day`): gom clock in/out, sắp xếp; ≥2 lượt → công = (cuối − đầu), không trừ trưa; 1 lượt → NCO; 0 → vắng. Min 09:35 = 100%.
- **Giờ lõi**: trễ theo `core_start_time || start_time` (+grace), sớm theo `core_end_time || end_time`.
- **One-way shifts**: `check_mode` clock_in_only/clock_out_only tính theo mép ca. **`[Adopter]`**: cấu hình ca mới qua `EmployeeShiftSchedule` (không sửa code).

### 5.3 Lương — `payroll/views/contract_hnh_views.py`
- `[RI]` **G/H** theo loại HĐ (SRS FR-5.2). `MonthlyPayrollEntry` tính cột dẫn xuất: lương thực nhận, quỹ hiệu suất, OT (Σ giờ×đơn giá×hệ số), KPI, gross thực tế, bảo hiểm (BHXH 8%/BHYT 1.5%/BHTN 1%, có trần), **thuế TNCN lũy tiến 7 bậc**, giảm trừ, thực lĩnh.
- Công thức đồng bộ **Python (server) + JavaScript (realtime UI)**.
- **`[Adopter]`**: thay công thức + bậc thuế qua management command tương tự `setup_hnh_payroll`.

### 5.4 Duyệt nghỉ phép
- Đơn sinh `LeaveRequestConditionApproval` cho từng approver; **bộ phận duyệt cố định** (`resolve_cb_manager`) chèn server-side vào approver + watcher.
- **Bất kỳ 1 approver** approve → `status="approved"`; guard thẩm quyền: reporting manager / ConditionApproval / bộ phận duyệt / staff (`_can_approve_leave`, cho phép cả nhóm C&B toàn tổ chức).
- APPR xem đơn `requested` toàn tổ chức (`hnh-approved-leaves?status=requested`) không phụ thuộc routing per-employee.
- Watcher lưu `LeaveRequestWatcher`, notify khi tạo/duyệt/từ chối/hủy.

### 5.5 Lịch & Outlook
- Lịch tổng hợp: `CalendarEventsView` trả sự kiện HRM (nghỉ phép + lễ, all_day). Outlook merge **client-side** qua BFF (`/bff/api/calendar/outlook` → Microsoft Graph `calendarView`), token per-user (`OutlookToken`, Fernet).
- Timeline 24h cá nhân (`me/day-detail` + `activity-detail` + Outlook): lồng lượt chấm + sự kiện có giờ vào **đúng khung giờ** (map theo `HH`).

### 5.6 Import & đồng bộ
- Import chấm công Excel (`attendance/views/hnh_import.py`): match badge_id, bỏ ngày vắng, chống trùng (badge_id, date).
- Sync standby→stage (`deploy/sync_standby_to_stage.sh`): upsert auth_user → employee/shift → replace attendance; reset sequence; đối chiếu row count.

---

## 6. Thiết kế Frontend (PWA)

- **Cấu trúc:** `main.tsx` (AuthProvider → BrowserRouter → App) → `App.tsx` (**81 routes**) → `AppShell` (TopBar + BottomNav/SideNav) → **81 pages**.
- **State:** React Context (`AuthProvider`, `ToastProvider`) + local useState. **Không lưu JWT client** — cookie auth (`credentials:'include'`), API base `/bff`.
- **Hooks lib:** `useApi`, `useClock`, `useGeolocation`, `useNotificationPolling`, `useAutoClockOut`, `useOutlookEvents`, `useTablet`.
- **Theme:** `lib/theme.ts` — `[RI]` navy #142B6F / red #c0222b / gold. Mobile-first, safe-area.
- **PWA:** vite-plugin-pwa (Workbox autoUpdate), manifest, `push-sw.js` (Web Push), install banner iOS/Android, offline cache, pull-to-refresh.
- **Component dùng chung:** `ClockModal` (GPS+camera+minimap), `AttendanceActivityDetail` (flattenPunches → chuỗi lượt chấm), `ProfileTabs`, `ui/*`.
- **`[Adopter]`**: swap `theme.ts` (brand), gỡ route module `[RI]` (tourism/wc2026), thêm/bớt page theo module bật.

---

## 7. Tích hợp

| Tích hợp | Thiết kế |
|----------|----------|
| IdP (SSO) | OIDC login (BFF PKCE) + Admin REST (`keycloak_service.py`: create/rename/reset/disable; toggle `editUsernameAllowed` khi đổi username). `[Adopter]` → Azure AD Graph. |
| Máy chấm công | `biometric_ingest.py` nhận M2M punch (pyzk/Dahua), dedup 120s, match badge_id. |
| Email | SMTP động (`DynamicEmailConfiguration`) — welcome, reset, payslip. |
| Geofencing | `geofencing/utils.check_geofence(lat, lng, company)`. |
| Web Push | VAPID; `push.ts` subscribe; `push-sw.js` hiển thị + điều hướng. |
| Outlook | BFF Microsoft Graph (Calendars.Read), refresh_token per-user (`OutlookToken`). |
| App nội bộ | M2M integration config + embed session handoff (`[RI]` Arkon, EOffice, 1StopShop, IAM). |

---

## 8. Thiết kế Bảo mật

- **SSO-only**: local login tắt; OIDC (RS256, JWKS, clock skew 5'). `oidc_backend` không tự tạo user.
- **M2M 3 lớp**: IP CIDR + token SHA256 + scope. Token rotate được.
- **Chấm công**: bắt buộc camera; GPS flag (không dùng làm hard gate); log device/UA để truy vết.
- **Secrets**: qua env (`OIDC_RP_CLIENT_SECRET`, `KC_ADMIN_*`, `EMAIL_*`, `VAPID_*`, `DATABASE_URL`, Outlook Fernet key). Không commit `.env`.
- **Proxy SSL**: `SECURE_PROXY_SSL_HEADER`, `USE_X_FORWARDED_*`.
- **Audit**: `horilla_audit`/`auditlog` ghi lịch sử thay đổi.
- **`[Adopter]` ngân hàng (bắt buộc):** MFA ở IdP; **phân tách nhiệm vụ** (tạo tài khoản ≠ duyệt quyền); audit **bất biến** + giữ đủ lâu; mã hóa dữ liệu nhạy cảm at-rest; review IP allowlist M2M theo chuẩn nội bộ.

---

## 9. Triển khai & Hạ tầng

### 9.1 Topology (`[RI]`)

| | Production | Stage |
|---|-----------|-------|
| Server | `100.99.164.24` | `100.88.75.106` |
| Checkout | `/opt/hnh/horilla` | `/opt/horilla` |
| Compose | `docker-compose.prod.yml` | `docker-compose.stage.yml` |
| DB | `horilla_prod` | `horilla_stage` (+ standby replica của prod) |
| Site | qlns.hnhtravel.work | qlns-stage.hnhtravel.work |

Container: web, db (postgres:16), redis, nginx, cloudflared (+ pwa, bff). Cả 2 deploy từ branch `horilla_aqv10`.

### 9.2 Quy trình deploy
1. Local: commit + `git push`.
2. Server: `cd <checkout> && sudo git pull --ff-only`.
3. `docker compose -f <compose> up -d --no-deps --build web pwa` (chọn service theo thay đổi: chỉ web nếu đổi Django, chỉ pwa nếu đổi frontend, cả hai nếu đụng cả).
4. `docker exec <nginx> nginx -s reload` (lấy IP container mới).
5. Nếu có migration: `docker compose ... exec -T web python manage.py migrate --no-input`.
- **Quy tắc:** test migration trên **stage trước prod**; deploy 1 commit = deploy cả branch tích lũy → kiểm `git log HEAD..origin/<branch>`. Đổi frontend cần **rebuild pwa** (code bake vào image); người dùng cần hard refresh PWA. Đụng web/pwa (không bff) → không buộc re-login (Redis session).

### 9.3 Cấu hình hệ thống (`horilla/settings.py`)
- `[RI]` `LANGUAGE_CODE="vi"`, `TIME_ZONE="Asia/Ho_Chi_Minh"`, `WHITE_LABELLING=True`, `THEME_APP="horilla_theme"`.
- OIDC: `KC_BASE`, `OIDC_RP_CLIENT_ID`, `OIDC_REDIRECT_BASE_URL`, `LOGIN_REDIRECT_URL="/pwa/"`.
- IdP Admin: `KC_SERVER_URL`, `KC_REALM`, `KC_ADMIN_*` (env).
- DB Postgres qua `DATABASE_URL`/`DB_*`. `.env` symlink → `.env.prod`/`.env.stage`.

---

## 10. Vận hành (Operations)

### 10.1 Management commands chính (`[RI]`)
| Command | Mục đích |
|---------|----------|
| `setup_hnh_company` | Khởi tạo công ty, phòng ban, vị trí, ca, loại nghỉ |
| `setup_hnh_payroll` | FilingStatus thuế TNCN 7 bậc + deductions/allowances |
| `setup_ald26` / `backfill_ald26` | Tạo ca 24h + gán NV / recompute công |
| `import_hnh_employees` | Import DSNV từ Excel |

> **`[Adopter]`**: viết command tương tự để seed danh mục tổ chức mình (công ty/phòng/ca/loại nghỉ/bậc lương/thuế).

### 10.2 Giám sát & backup
- `SystemHealthLog`: cron kiểm tra replication primary↔standby (so row count qua SSH) + tuổi backup; push log qua `X-Sync-Token`.
- Backup IdP (Keycloak) cron + sync sang stage. Sync standby→stage định kỳ.

### 10.3 Chẩn đoán nhanh
- Lỗi chấm công: `docker compose -f docker-compose.prod.yml logs web | grep CLOCK`.
- Lưu ý `[RI]`: `GPSCheckInLog` là **legacy, rỗng**; dùng `attendance_attendanceactivity` + log chẩn đoán.

---

## 11. Hướng dẫn tái sử dụng cho tổ chức mới (Adopter Technical Playbook)

1. **Fork** branch nền (vd `horilla_banktmov10`); giữ core apps (§SRS 6), gỡ `tourism`/`wc2026` + route PWA tương ứng.
2. **Đổi IdP** sang AD doanh nghiệp (OIDC config + claims mapping giữ nguyên logic `oidc_backend`).
3. **Cấu hình ca & công** qua `EmployeeShiftSchedule` (`core_*_time`, `check_mode`) — không sửa thuật toán.
4. **Thay công thức lương & thuế** (command seed riêng); giữ khung `ContractBase` + `MonthlyPayrollEntry`.
5. **Thay bậc/ngạch** (`WorkLevel`), loại nghỉ (`LeaveType`), branding (`theme.ts`, WHITE_LABELLING).
6. **Nâng bảo mật** (§8 `[Adopter]`): MFA, phân tách nhiệm vụ, audit bất biến, mã hóa at-rest, HA/DR.
7. **Tích hợp Core-HR/AD** qua M2M (đồng bộ nhân sự 2 chiều).

> Tài liệu phản ánh codebase tại 2026-07-12 (branch `horilla_aqv10`). Chi tiết công thức/endpoint cần đối chiếu mã nguồn khi triển khai thay đổi.

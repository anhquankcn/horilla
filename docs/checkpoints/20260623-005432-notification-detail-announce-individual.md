---
status: completed
branch: horilla_aqv10
timestamp: 2026-06-23T00:54:32+07:00
files_modified: []
---

## Working on: Notification detail sheet + individual announcement targeting

### Summary

Session shipped two PWA features and their backend support, then promoted everything to production. All commits (`1e86e7fee` through `d6bf091f4`) are now live on both stage and prod.

### Decisions Made

- **Notification detail sheet**: clicking any notification row (read or unread) opens a bottom sheet showing full verb/description/actor/timestamp. Auto-marks unread on open. `parseNotifAction()` maps `data.redirect` to PWA route:
  - `/leave/request-view` → `/approvals` → "Duyệt ngay"
  - `/leave/user-request-view` → `/proposals/leave` → "Xem đơn của tôi"
  - `/attendance*request-view` → `/approvals`
  - `chatbubbles` icon or `/` → `/announcements`
- **Individual targeting in ComposeModal**: added `'individual'` UI tab that maps to backend `target_type=multi_user`. Sends repeated `user_ids` FormData entries.
- **Backend `getlist` fix**: `AnnouncementCreateView._do_send` now uses `request.data.getlist("user_ids")` when `target_type == TARGET_MULTI` to collect all FormData values (Django QueryDict `.get()` only returns the last value).
- **Employee filter**: `EmployeeListAPIView` now accepts `?department_id=X&company_id=Y` query params (JOIN on `employee_work_info` reverse relation).
- **`EmployeePicker` component**: debounced 300ms search, Chi nhánh + Phòng ban dropdowns, scrollable checkbox list (maxHeight 240px), selected-count badge.

### Remaining Work

None from this session. Possible future tasks:
1. **Mark all notifications read when opening detail** — currently marks only the tapped one; could add bulk-read on sheet open if needed.
2. **Pagination in EmployeePicker** — currently fetches page_size=100; large companies may need infinite scroll.
3. **Push notification tap → deep link**: when a user taps an OS push notification, it should open the relevant PWA screen directly (currently just opens the app root).
4. **Announce to Chi nhánh** (company target with specific company_id) — currently "Toàn công ty" sends to ALL companies; no per-branch targeting yet.

### Notes

- **Prod server**: `naquan@100.99.164.24`, key `~/CloudSrv/es-hrm.pem`, dir `/opt/hnh/horilla`, deploy: `bash deploy-prod.sh`
- **Stage server**: `naquan@100.88.75.106`, key `~/Downloads/naquan.pem`, dir `/opt/horilla`, deploy: `bash deploy.sh`
- **Promote flow**: `git push origin horilla_aqv10:1.0` then SSH to prod and run deploy-prod.sh
- **Notification `data` field**: Django JSONField storing all `notify.send()` kwargs; DRF returns it as a parsed object. Frontend types it as `Record<string, unknown> | string | null` (handles both).
- **`TARGET_MULTI = "multi_user"`** — the string value used in backend `Announcement` model choices.
- **`employee_work_info` related name** confirmed at `employee/models.py:752` — used for dept/company filter JOIN.
- No pending migrations from this session.

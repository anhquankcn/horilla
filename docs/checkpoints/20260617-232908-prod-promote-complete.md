# Context Save — 2026-06-17 23:29 (+0700)

**Status:** in-progress (feature batch shipped to prod; hardware connect pending)
**Branch:** horilla_aqv10 (dev/staging) — prod = `1.0`
**Heads:** aqv10 = `053181720`  ·  1.0 = `053181720` (prod fully synced to stage)
**Working tree:** clean except `M pwa/frontend/tsconfig.tsbuildinfo` (build artifact, ignore)
**Latest commit:** `053181720 feat(attendance): Xuất CC Excel — ô lọc Tên/Mã NV/Mã KT + cột Họ tên = Họ đệm + Tên`

## Shipped to prod this batch (all live on `1.0`)

### ALD26 single-shift rollout (361 NV)
- One 24h shift `ALD26` (00:00–23:58, min 09:35, check_mode=both, auto-punch off) assigned to all; old shifts stopped.
- Flat N-punch model: span = last punch − first punch (no lunch). ≥2 punches → in=first, out=last, worked=span. 1 punch (past day) → NCO. 0 → Vắng.
- `attendance/views/clock_in_out.py`: `ALD26_MIN_SECONDS=34500`, `_is_ald26()`, `recompute_day` dispatcher, `recompute_ald26_day()`.
- `attendance/management/commands/setup_ald26.py` (uses `_base_manager` to dodge DISTINCT+FOR UPDATE bug).
- `attendance/management/commands/backfill_ald26.py --month YYYY-MM`.
- Công proportional: `round(min(1.0, worked/34500), 2)` in 3 surfaces (MonthlyAttendanceDetailView, export, payroll `_actual_cong`).

### PWA UI refinements
- Home "Lịch công" card: cells = First − Last / NCO / Vắng; click → AttendanceDetailModal (Ca, hoạt động, ảnh, địa điểm). Labels First/Last (was In/Out). Stamp icon on Chấm công button.
- Clock duration NO live tick — updates per punch (last − first); resets to 00:00:00 next day before first punch (`useClock.ts`).
- Top bar First/Last (both now showing).
- Attendance screen: single "Chấm công" button (multi-punch), reorganized activity history.
- Detail modal: n-punch flat list (lượt 1 = giờ vào … last = giờ ra only when day past); badge Trong/Ngoài VP (Trong → tên VP; Ngoài → loại lý do + chi tiết); no "cách VP km" — shows địa điểm (phường/tỉnh).
- Export CC Excel: Company/Dept chips + search box (Tên/Mã NV/Mã KT, comma multi), Công column, Họ tên = "Họ đệm + Tên".

### Onboarding wizard (C&B)
- `horilla_api/api_views/employee/onboard_views.py`: `OnboardOptionsView` (GET), `OnboardEmployeeView` (POST atomic: Employee→WorkInfo[ALD26]→groups→sync_employee_to_kc). Gate `_can_onboard`.
- PWA `pages/OnboardEmployee.tsx` 4-step wizard, route `/onboard-employee`, tile "Onboarding NV" (slug 'employees').
- ⚠️ Keycloak SHARED — onboard creates REAL prod KC users.

### Biometric ingest (server-side ready, hardware not connected)
- `horilla_api/api_views/attendance/biometric_ingest.py`: `BiometricPunchView` (M2M scope attendance:write, batch {badge_id, timestamp}, dedup ±120s, app-primary, tags device='ronaljack').
- `deploy/ronaljack_agent.py`: pyzk poller (env RJ_DEVICE_IP/PORT/PASS, RJ_HORILLA_URL, RJ_M2M_TOKEN).
- Machine: **Ronald Jack 5000T-C** (ZKTeco/pyzk fingerprint+RFID, machine_type "zk").

### Ops fixes
- nginx `/` → 302 `/pwa/` + `absolute_redirect off;`; `LOGIN_REDIRECT_URL=/pwa/`.
- New prod users: OTP requirement removed (239 users); May payslips deleted (269); bottom navbar vocab fixed.

## Remaining / next session
1. **Tomorrow — connect Ronald Jack 5000T-C** ("mai cắm máy"): create M2M service account (scope attendance:write + agent IP in allowed_cidrs), confirm device LAN/IP + Comm password + User ID == badge_id, run `ronaljack_agent.py`, test pyzk.
2. Monitor ALD26 on prod (punches/công/NCO); watch stray auto-punches from old EmployeeShiftPlan.
3. Optional cleanup: autoclock container wrong healthcheck (cosmetic "unhealthy"); clean old EmployeeShiftPlan.
4. gstack upgrade 1.58.0.0 → 1.58.1.0 pending.

## Gotchas (durable)
- Stage data ephemeral — standby→stage sync (12:00/20:00) TRUNCATEs + COPYs attendance from prod replica, wiping stage edits. Durable fixes must run on PROD source (ALD26 runs natively on prod so sync brings correct data).
- nginx.conf bind-mount inode → must `up -d --no-deps --force-recreate nginx`.
- `EmployeeWorkInformation._base_manager` to avoid DISTINCT breaking select_for_update.
- Do NOT autonomously disable shared sync cron. Don't echo KC admin passwords.

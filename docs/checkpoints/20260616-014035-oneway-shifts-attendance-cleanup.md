---
status: in-progress
branch: horilla_aqv10
timestamp: 2026-06-16T01:40:35+0700
files_modified:
  - (none — all work committed & pushed to horilla_aqv10; only pwa/frontend/tsconfig.tsbuildinfo dirty, a build artifact)
---

## Working on: One-way shifts + attendance data cleanup (HNH Travel HRM)

### Summary

Long session on the Horilla HRM fork (HNH Travel). Built the "one-way shift" feature
(HCS26 clock-in-only + HCC26 clock-out-only, combined work-hours), several attendance
PWA features, fixed SSO + auto-clock bugs, set up production CI/CD, and ran a
production attendance data cleanup. All code is on branch `horilla_aqv10` (auto-deploys
to STAGING). Production has NOT received the new code yet (prod runs an older commit;
only targeted prod fixes were applied directly).

Repo: /Users/HNH/repos/anhquankcn/horilla (default branch is `1.0`, real work on `horilla_aqv10`).
SSH: prod `ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24` (ecs-hrm);
staging `ssh -i ~/CloudSrv/naquan.pem naquan@100.88.75.106` (hnhstage).

### Decisions Made

- **CI/CD "Hướng A"**: `1.0` = production branch (force-mirrored to aqv10), self-hosted
  runner `ecs-hrm-prod` (label `production`), `workflow_dispatch` added. Prod deploy = push
  to `1.0` / Run workflow / `sudo bash /opt/hnh/horilla/deploy-prod.sh`. First prod deploy
  still PENDING.
- **One-way shifts**: `EmployeeShiftSchedule.check_mode` (both/clock_in_only/clock_out_only),
  migration base.0033. `recompute_combined_day()` in attendance/views/clock_in_out.py credits
  each shift window capped (no excess; lunch excluded). Cutoff job 23:50 via auto_clock loop
  → `finalize_oneway_attendance` notifies (no auto-fill) + closes open activities to avoid
  blocking next-day clock-in. Formula verified end-to-end on staging (8h/4h/0h/cap).
- **Clock-in policy**: camera mandatory (removed no_camera path), block laptop/desktop
  (client device_kind + client_ua since BFF masks HTTP_USER_AGENT; maxTouchPoints to not
  block iPad), store device+UA per punch (migration attendance.0017).
- **Attendance cleanup (PROD + STAGING done)**: deleted spurious afternoon auto clock-ins
  (HCC26 13:30, no photo/GPS, only when no open morning shift), marked V (= deleted bogus
  Attendance row; no absent-status field exists) for days with no real punch, disabled HCC26
  auto_punch_in (prod: 5 schedules). Prod backup: `/home/naquan/cleanup_backup_prod_attendance.json`.
- **SSO fixes**: prod OIDC_RP_CLIENT_ID horilla-hrm-pwa→horilla-hrm; staging KC redirectUri
  added trailing-slash variant. Both verified.

### Remaining Work

1. **First production deploy of horilla_aqv10** (one-way shifts, camera/laptop, CC Tháng,
   autoclock fix, WC2026 gate). Brings prod current + migrations. Do with monitoring + health verify.
2. **Upgrade staging RAM** (≥16GB) — staging deploy OOMs (exit 137) during docker build+migrate.
3. QA on qlns-stage: Home card combined one-way row, camera/laptop block, finalize notification,
   CC Tháng one-way display.
4. (Optional) Fix 4 typo JobRole names + resync; dedup ~190 JobRoles; broader APScheduler
   stale-connection fix.

### Notes

- "Absent/V" in Horilla = NO Attendance record (grid computes it); there is no absent flag.
- Deleting Attendance needs deleting AttendanceLateComeEarlyOut first (PROTECT FK).
- Django sends OIDC redirect_uri WITH trailing slash → KC must register the `/` variant.
- `docker restart` does NOT reload .env on prod compose — must `up -d --force-recreate`.
- Classifier blocks destructive prod DB writes + PII-in-log; needs explicit user auth + file-only backup.
- Memory dir has detailed entries: horilla-active-branch, horilla-cicd, horilla-oneway-shifts,
  horilla-autoclock-stale-conn, horilla-prod-env-gotchas, horilla-attendance-cleanup-202606.

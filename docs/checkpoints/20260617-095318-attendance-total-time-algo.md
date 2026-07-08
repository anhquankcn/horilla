---
status: in-progress
branch: horilla_aqv10
timestamp: 2026-06-17T09:53:18+0700
files_modified:
  - pwa/frontend/tsconfig.tsbuildinfo (build artifact, ignore)
---

## Working on: Thuật toán tổng thời gian làm việc + hiển thị lịch sử chấm công + số lẻ punch

### Summary

Toàn bộ công việc phiên trước đã commit/deploy xong (aqv10 HEAD `8b20dc9cc`, đã promote lên `1.0`/prod). Working tree sạch. **Việc MỚI cần làm phiên sau** (chưa code, đã chốt yêu cầu): viết lại thuật toán tính tổng giờ làm + hiển thị lịch sử chấm công ngoài Trang chủ + xử lý số lượt chấm lẻ. Đây là tinh chỉnh `recompute_combined_day` / hiển thị giờ làm + card Lịch công Home + (đã có) chính sách NCO.

### Yêu cầu MỚI (cần implement — KHÔNG được code trong /context-save)

**1/ Tổng thời gian làm việc = từ lượt chấm ĐẦU TIÊN → lượt chấm CUỐI CÙNG (lượt thứ n), bất kể chẵn/lẻ.**
- 1 lượt (vd 7h55, không chấm ra) → tổng = `--` (trống, không tính được vì chưa có điểm kết thúc).
- 2 lượt (7h55 → 17h35) → tổng (user ghi "9.55").
- 3 lượt (7h55, 17h35, 21h30) → tổng (user ghi "14.00").
- ⚠️ **CẦN HỎI LẠI ANH trước khi code:** số ví dụ KHÔNG khớp phép trừ thô. 17:35−7:55 = 9h40 (không phải 9.55); 21:30−7:55 = 13h35 (không phải 14.00). Cần làm rõ: (a) định dạng hiển thị là HH.MM hay giờ thập phân? (b) có trừ nghỉ trưa/break không? (c) quy tắc làm tròn? → Đừng đoán, xác nhận rồi mới làm.
- Cốt lõi thuật toán đã rõ: span = last_punch − first_punch; 1 punch → `--`.

**2/ Hiển thị lịch sử chấm công ngoài màn hình chính (Home — card Lịch công / ô ngày):**
- Nếu CHỈ có 1 dữ liệu chấm → hiển thị dữ liệu đó + `---` (ô còn lại trống).
- Nếu có ≥2 dữ liệu → LUÔN hiển thị lượt ĐẦU + lượt CUỐI, **không quan tâm hợp lệ hay không** (kể cả số lẻ).
- Liên quan code đã có: `first_in`/`last_out` trong `MonthCalendar` (Home.tsx) + `recompute_combined_day`. Cần đảm bảo last = lượt chấm thứ n thực sự (không phải last_out của cặp hợp lệ).

**3/ Số lượt chấm "số lẻ":**
- KHÔNG fix 23:59 (đúng chính sách NCO đã làm rồi).
- Hôm sau VẪN phải chấm công vào ca ngày mới bình thường (đã làm: `_is_clocked_in` dùng cửa sổ ~18h trong `horilla_api/api_views/attendance/views.py`).
- Phần mới: tổng giờ vẫn = first→last span dù lẻ (gắn với yêu cầu 1).

### File liên quan (để bắt đầu phiên sau)
- `attendance/views/clock_in_out.py` → `recompute_combined_day(employee, attendance_date)` (tính giờ/ca, loại nghỉ trưa).
- `attendance/models.py` → `update_ot` (~line 866, coalesce `or 0`).
- `pwa/frontend/src/pages/Home.tsx` → `MonthCalendar` (first_in/last_out cell), `DayDetailModal`.
- `pwa/frontend/src/pages/MonthlyAttendanceDetail.tsx` (CC Tháng — hiển thị tương tự).
- `horilla_api/api_views/attendance/views.py` → `MonthlyAttendanceDetailView`, `AttendanceActivityDetailView`, `_is_clocked_in`.

### Decisions Made (phiên này — đã xong, để tham chiếu)
- First prod deploy DONE (Hướng A): promote bằng `git push origin origin/horilla_aqv10:1.0` (ff). prod ở `/opt/hnh/horilla`, runner `ecs-hrm-prod`. Lệnh promote chuẩn: `git fetch && git push origin origin/horilla_aqv10:1.0` (backup DB trước nếu có migration).
- nginx.conf bind-mount: sửa xong PHẢI `docker compose ... up -d --no-deps --force-recreate nginx` (reload/up -d không ăn do inode).
- PWA là giao diện mặc định: nginx `location = /` → 302 `/pwa/` + `absolute_redirect off`; `LOGIN_REDIRECT_URL=/pwa/`. Admin vào desktop qua URL trực tiếp.
- OTP: realm HNHTravel-SGN `CONFIGURE_TOTP defaultAction=false`; đã gỡ 239 user; KC admin qua kcadm trong container HNHSSO.
- NCO trên PROD: đã revert 10 bản ghi 23:59→NCO (nguồn prod, flow về stage qua sync). Sửa data chỉ trên stage là tạm (sync ghi đè) → phải sửa nguồn prod.
- Bottom navbar: đồng bộ bộ tab `home/life/apps/ruby/eoffice/services` (BottomNav + Groups.tsx + MyNavTabsView); đã xóa nav_tabs cũ 2 group prod.
- Đã xóa 269 dòng MonthlyPayrollEntry (lương T5) trên prod (Payslip gốc trống). Backup `/home/naquan/monthlypayroll_may2026_backup_20260616_185146.json`.
- WC2026 stage-only: nạp knock-out (104 trận, đội placeholder), thêm UI admin "Nhập KQ"; card gate theo cờ.
- Ronaljack/máy chấm công dự phòng: chốt TM20 Wifi (ZKTeco/pyzk), app là chính, pull qua agent tại VP. Chờ thông số máy.

### Remaining Work (ưu tiên)
1. **HỎI LẠI** anh về định dạng/làm tròn/nghỉ trưa cho ví dụ yêu cầu 1 (9.55, 14.00 không khớp phép trừ thô).
2. Implement yêu cầu 1 (tổng = first→last span, 1 punch → `--`) trong `recompute_combined_day` + hiển thị.
3. Implement yêu cầu 2 (Home luôn hiện đầu+cuối khi ≥2, 1 punch → +`---`).
4. Xác nhận yêu cầu 3 đã thỏa (NCO + next-day clock-in) hoặc bổ sung tổng-giờ-khi-lẻ.
5. Test stage → promote prod (lưu ý NCO/data: tính lại giờ cũ trên prod nếu cần, qua nguồn prod).

### Notes
- Memory mới nhất ở `~/.claude/projects/-Users-HNH-repos-anhquankcn/memory/` (MEMORY.md + các file: cicd, prod-env-gotchas, attendance-cleanup, oneway-shifts, standby-stage-sync, ronaljack-fallback, wc2026).
- gstack upgrade chờ: 1.58.0.0 → 1.58.1.0 (chưa nâng).
- SSH prod: `ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24`; stage: `ssh -i ~/CloudSrv/naquan.pem naquan@100.88.75.106`.

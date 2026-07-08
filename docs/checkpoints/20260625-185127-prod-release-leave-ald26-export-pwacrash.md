---
status: completed
branch: horilla_aqv10
timestamp: 2026-06-25T18:51:27+07:00
files_modified: []
---

## Working on: Release gộp prod — Đổi email/KC, Leave C&B, ALD26, Xuất CC, Fix văng PWA + Sync fix

### Summary

Một session dài, nhiều việc, kết thúc bằng **release gộp 5 commit lên production**
(`fd15703e4` → `7423f4d2c`). Tất cả đã validate trên stage trước, prod đã chạy 2
migration OK. Working tree sạch, mọi thứ đã commit + push `horilla_aqv10`. Prod +
stage cùng ở `7423f4d2c`.

### Decisions Made

- **Đổi email/username + KC (việc đầu session, 1-off):**
  - Chị Ngân (id 195): `ketoan.dad@` → `ngan.nth@`. Phát hiện `ngan.nth@` đã tồn tại
    sẵn trong KC như tài khoản **Microsoft-federated** → trỏ Horilla sang + disable
    user KC cũ (KHÔNG rename).
  - Anh Đức (id 237): `sales.ca4@` → `ca.sale4@`. KC-local, target chưa có → **rename**
    tại chỗ; phải bật tạm `editUsernameAllowed` của realm (mặc định false) rồi khôi phục.
  - Workinfo.email có thể KHÁC email đăng nhập (Đức: `trung.ld@`) → chỉ đổi cột nào
    đang giữ email cũ.
- **Feature đổi email tự động (`KcIdentityView`):** preview (GET) → apply (POST),
  tự nhận 4 plan: rename / link_existing / create / kc_unreachable. Quyền C&B
  (`_can_onboard`). Đã deploy prod.
- **Leave C&B (`aa361ed2d`, migration leave 0007):** model `CBLeaveManager`
  (company?/department?/manager, match cụ thể nhất, seed global = tram.pvh@ id 221)
  + `LeaveRequestWatcher` (lưu watcher). Server-side LUÔN chèn C&B vào approver +
  watcher. Quyết định scope: **đầy đủ cả 2 case KC** + **watcher lưu DB** + pool
  duyệt = **mọi nhân viên active**. Frontend: PersonPicker → modal lọc cty/phòng,
  pin C&B khóa, tab "Đang theo dõi". Req "1 người duyệt là hợp lệ" ĐÃ CÓ SẴN trong
  `ApproveLeaveView` (set approved ngay) — chỉ thêm guard thẩm quyền.
- **ALD26 (`579af45fe`, migration base 0037):** Phương án C (field DB) — thêm
  `core_start_time/core_end_time` vào `EmployeeShiftSchedule`, seed ALD26 = 08:00/17:30.
  Export `export_views` ưu tiên core nếu có (giữ grace). KHÔNG đổi khung ca 00:00-23:58.
- **Xuất CC (`0fe5e08b0`):** thêm from_date/to_date (kẹp trong tháng, default đầu/cuối)
  + phân trang 20/50/100/200 (`AttendanceExportPreviewView`).
- **Văng PWA binh.lt:** chẩn đoán = **KHÔNG phải cao tải** (lúc văng 2-6 lượt/phút,
  CPU 13%). Là crash client iOS PWA. Fix `7423f4d2c`: (a) capture ≤720px + q0.7 +
  giải phóng canvas; (b) chống chấm lặp <45s qua localStorage (sống sót reload);
  (c) logger `hnh.clock` INFO→stdout ghi CLOCK IN/OUT/BLOCKED + device/UA.
- **Sync fix (`66a8d3281`):** `sync_standby_to_stage.sh` thiếu sync `auth_user` →
  user mới prod (id 364) làm gãy FK → attendance stage = 0 mỗi lần sync. Thêm
  `upsert_table auth_user id` trước employee + vào loop reset sequence. Chỉ ảnh
  hưởng stage tooling (không cần deploy prod). Đã port block "push log sang prod"
  vào repo (trước chỉ sửa trực tiếp stage).

### Remaining Work

Không còn pending bắt buộc. Theo dõi/việc nhỏ:

1. **Sáng mai (26/06)** grep log để truy nguyên văng binh.lt + xác nhận camera Hiền/Thương:
   `docker compose -f docker-compose.prod.yml logs web | grep CLOCK`
   (CLOCK IN ok → device binh.lt; CLOCK BLOCKED reason=no_camera → Hiền/Thương).
2. Hỏi binh.lt model máy + iOS version để xác nhận giả thuyết crash camera-RAM.
3. C&B chốt giúp lượt chấm 08:35:18 của binh.lt (còn mở, chưa clock-out).
4. Dọn các file `.bak.*` trong `/opt/horilla/deploy/` trên stage (vô hại).
5. git committer vẫn là `HNH@MacBook-Air...` (chưa set user.name/email).

### Notes

**3 người sự cố chấm công 25/06 (đã chẩn đoán, không sửa data):**
- Nguyễn Lê Diễm **Hiền** (id 12, HNH00342, hien.nld@) — anh gọi "Hiên" nhưng DB "Hiền".
- **Vũ** Thị Thương (id 294, HNH00072, thuong.vt@) — khác Võ Thị Thương (id 274).
- binh.lt = **LÊ TRUNG BÌNH** (id 251, HNH00075).
- Kết luận: Hiền/Thương = **lỗi CAMERA** (server bắt buộc ảnh, GPS chỉ flag không chặn);
  binh.lt = **văng app frontend** (camera+GPS đều OK).

**Hạ tầng (nhắc lại):**
- Prod = `100.99.164.24` (hnhlive, key `~/CloudSrv/es-hrm.pem`), checkout `/opt/hnh/horilla`,
  compose `docker-compose.prod.yml`, KC container `HNHSSO` realm HNHTravel-SGN, db horilla_prod.
- Stage = `100.88.75.106` (azurestage, key `~/CloudSrv/naquan.pem`), checkout `/opt/horilla`,
  compose `docker-compose.stage.yml`, db horilla_stage, có `deploy.sh` + standby replica.
- **Stage KC trỏ prod KC** (sso.hnhtravel.work) → preview an toàn nhưng apply ghi prod.
- Cả 2 deploy từ branch `horilla_aqv10` (KHÔNG phải 1.0). git pull kéo cả branch.
- Deploy thủ công: pull → `compose build web` + `build --no-cache pwa` → `up -d` → `migrate`.
- ssh config dùng IdentityFile tương đối (`CloudSrv/*.pem`) → phải dùng full path `~/CloudSrv/*.pem`.

**GPSCheckInLog là legacy** — rỗng nhiều ngày, luồng chấm công hiện KHÔNG ghi nó (đừng
dùng để chẩn đoán). Dùng `attendance_attendanceactivity` + log `hnh.clock`.

**Commits session này:** aa361ed2d, 579af45fe, 66a8d3281, 0fe5e08b0, 7423f4d2c
(+ KcIdentityView email feature `fd15703e4` đã có từ trước, deploy prod đầu session).

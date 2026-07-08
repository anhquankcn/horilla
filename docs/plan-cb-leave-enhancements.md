# Kế hoạch: Nâng cấp C&B — Quản lý Nghỉ phép & Duyệt đơn (PWA)

> Trạng thái: **PLAN** (chưa code). Nguồn: yêu cầu C&B 07/2026.
> Quyết định đã chốt: #4 lịch nhắc = gửi ngay + ngày 3 + ngày 4 + ngày 5 rồi dừng;
> #5 hủy đơn KHÔNG tự hoàn số dư (C&B tự chỉnh tay qua #3).

## Hạ tầng tái dùng (đã có, không phải làm lại)

| Thành phần | Vị trí | Dùng cho |
|-----------|--------|----------|
| `CBLeaveManager` (cty+phòng→người duyệt) + `resolve_cb_manager()` | `leave/models.py` (~2458, 2494); GET `/api/leave/cb-managers/` | #1 |
| `EmployeeWorkInformation.reporting_manager_id` | `employee/models.py` | #1 |
| `PUT /api/leave/assign-leave/<pk>/` (sửa 1 AvailableLeave) | `horilla_api/.../leave/views.py:774` | #3 |
| `HNHLeaveSummaryView` + `_usage_this_year()` (4 loại + usage năm) | `leave_management_views.py:141,174` | #2 |
| `HNHLeaveOverviewView` (grid, bal `lc_ids`=năm+bù+thâm niên) | `leave_management_views.py:536` | #2, #3 |
| `notify.send()` → tự tạo Notification + **web push (VAPID)** | `notifications/` + `notifications/push.py` | #4 |
| **APScheduler** (`BackgroundScheduler` trong web process) | mỗi app có `scheduler.py`; `leave/scheduler.py` (job `leave_reset`) | #4 |
| `LeaveRequestCancelAPIView` (self hủy, start≥today, không hoàn) | `views.py:1187` | tham chiếu #5 |
| `_is_cnb()` gate C&B | `leave_management_views.py` | tất cả endpoint mới |

## Thứ tự triển khai đề xuất (phân đợt, deploy dần)

- **Đợt 1 — #2 + #3** (KHÔNG đổi schema, giá trị hằng ngày cao, ít rủi ro).
- **Đợt 2 — #5** (migration nhỏ: field audit hủy).
- **Đợt 3 — #4** (migration field nhắc + job scheduler).
- **Đợt 4 — #1** (CRUD CBLeaveManager + UI cấu hình duyệt).

---

## #2 — Chi tiết phép theo NV (breakdown cộng ra tổng) + lọc/click trong Nghỉ phép Tháng

**Backend (không đổi schema):**
- Endpoint mới `GET /api/leave/hnh-leave-detail/?employee_id=<id>`.
  - Scope: C&B = mọi NV; manager = chỉ NV dưới quyền; NV = chính mình (403 nếu vượt).
  - Trả:
    - `employee`: {id, name, badge_id, department, company}
    - `balances`: mảng theo TỪNG loại phép (từ `AvailableLeave`): `{leave_type_id, name, available_days, carryforward_days, total, taken_this_year}`
    - `seniority_days` (tính động nếu áp dụng)
    - `total_start`: tổng Phép đầu = Σ(available+carry) của các loại trừ-dư (năm+bù+thâm niên) → **khớp cột "Phép đầu"** của grid
    - `taken_year_by_type`: đơn approved năm nay gộp theo loại (để cộng ra "đã dùng")
  - Tái dùng `_usage_this_year()` + logic `lc_ids` của `HNHLeaveOverviewView`.

**Frontend (`LeaveOverview.tsx`):**
- Search theo tên (đã có) — giữ nguyên.
- Bấm dòng NV (mã/tên) → mở **modal "Chi tiết phép <tên>"**:
  - Bảng từng loại phép: Phép đầu (avail+carry) · Đã dùng năm nay · Còn lại.
  - Dòng **Tổng** = khớp Phép đầu/Còn lại của grid.
- Chỉ cần thêm modal + fetch; grid không đổi.

---

## #3 — Chỉnh tay số dư phép từng NV (không đợi import cả cty)

**Backend (không đổi schema):**
- Endpoint C&B `POST /api/leave/hnh-adjust-balance/` — gate `_is_cnb`.
  - Body: `{employee_id, leave_type_id, available_days, carryforward_days, reason}`.
  - **Upsert** `AvailableLeave` (tạo nếu NV chưa có loại đó); set giá trị; `total_leave_days` tự tính.
  - Trả record mới + ghi log điều chỉnh (tối thiểu: logger; tùy chọn model `LeaveBalanceAdjustLog` sau).
- (Có thể tái dùng `PUT /assign-leave/<pk>/` nhưng cần pk + gate Django-perm; endpoint HNH riêng gate `_is_cnb` + upsert tiện cho UI hơn.)

**Frontend:**
- Trong modal chi tiết (#2), mỗi loại phép có nút **"Sửa"** (chỉ hiện khi `isCnb()`):
  - Input available_days / carryforward + ô lý do → gọi endpoint → refresh modal + grid.

---

## #5 — C&B hủy đơn ĐÃ DUYỆT (NV không nghỉ nữa, vẫn đi làm)

**Backend (migration nhỏ):**
- Migration `LeaveRequest`: thêm `cancelled_by` (FK Employee, null), `cancel_reason` (Text, blank), `cancelled_at` (datetime, null).
- Endpoint C&B `POST /api/leave/hnh-cancel-approved/<pk>/` — gate `_is_cnb`.
  - Body: `{reason}`. Nếu `status=='approved'` → set `status='cancelled'` + cancelled_by/reason/at.
  - **KHÔNG hoàn số dư** (quyết định) — C&B tự chỉnh tay qua #3 nếu cần.
  - `notify.send()` báo NV + watchers "đơn đã bị hủy bởi C&B".
- Endpoint hỗ trợ `GET /api/leave/hnh-approved-conflicts/?company&dept&month` — liệt kê đơn **approved** mà NV **đã chấm công** vào (các) ngày nghỉ (join `AttendanceActivity` cùng NV+ngày) → C&B biết đơn nào nên hủy.

**Frontend (màn "Quản lý Phép" C&B):**
- List đơn approved (lọc cty/phòng/tháng); mỗi đơn có nút **"Hủy đơn"** (nhập lý do → xác nhận).
- Đơn có xung đột chấm công tô cảnh báo ⚠ "NV đã đi làm ngày nghỉ" (từ endpoint conflicts).

---

## #4 — Nhắc quản lý duyệt đơn treo (job định kỳ)

**Lịch nhắc (chốt):** gửi ngay lúc tạo (ĐÃ CÓ) → **ngày 3** nhắc lần 1 → **ngày 4** lần 2 → **ngày 5** lần 3 → dừng (tổng 3 lần nhắc, 2 lần cuối cách nhau 1 ngày).

**Backend (migration nhỏ):**
- Migration `LeaveRequest`: thêm `reminder_count` (int, default 0), `last_reminded_at` (datetime, null).
- Job trong `leave/scheduler.py` (thêm cron ~08:00 hằng ngày):
  - Quét `LeaveRequest.objects.filter(status='requested')`.
  - `age = (today - ngày tạo).days`. Điều kiện gửi:
    - `age >= 3 và reminder_count == 0` → nhắc lần 1
    - `age >= 4 và reminder_count == 1` → nhắc lần 2
    - `age >= 5 và reminder_count == 2` → nhắc lần 3
    - còn lại → bỏ qua
  - Người nhận: approver hiện tại — reporting_manager **hoặc** `LeaveRequestConditionApproval` cấp đang chờ + C&B cố định (`resolve_cb_manager`).
  - `notify.send(...)` (tự push) → tăng `reminder_count`, set `last_reminded_at`.

**⚠️ Lưu ý kỹ thuật:** APScheduler chạy IN-PROCESS trong web. Nếu web chạy **nhiều gunicorn worker** → job chạy trùng N lần. Khi làm phải: kiểm tra số worker prod; nếu >1 → thêm guard (advisory lock DB / cột `last_reminded_at` idempotent theo ngày / chạy scheduler ở 1 worker). Các scheduler hiện có cùng rủi ro — theo pattern hiện tại + thêm guard cho job gửi thông báo (tránh spam).

---

## #1 — Xem người quản lý NV + cấu hình người duyệt theo phòng ban

**Backend (không đổi schema — model `CBLeaveManager` đã có):**
- CRUD CBLeaveManager cho C&B (gate `_is_cnb`):
  - `GET /api/leave/hnh-cb-managers/` — list rule (cty, phòng, người duyệt).
  - `POST /api/leave/hnh-cb-managers/` — tạo/cập nhật theo (company_id, department_id) → manager_id (unique_together sẵn).
  - `DELETE /api/leave/hnh-cb-managers/<pk>/` — xoá rule.
- `GET /api/leave/hnh-approver-map/?company&dept` — mỗi NV: `{name, badge, dept, reporting_manager, cb_manager (resolved)}`.
- (Tùy chọn) sửa `reporting_manager` per NV — cân nhắc để riêng (thuộc hồ sơ NV), mặc định #1 chỉ **xem** manager + **cấu hình người duyệt C&B theo phòng**.

**Frontend (màn C&B "Cấu hình duyệt phép"):**
- Bảng NV → quản lý trực tiếp + người duyệt (resolved) — lọc cty/phòng.
- Form gán rule: chọn **công ty + phòng ban + người duyệt** → lưu; list rule hiện có, sửa/xoá.

---

## Ghi chú chung
- Mọi endpoint mới gate qua `_is_cnb()` (C&B) hoặc scope manager/self tương ứng.
- 2 migration nhỏ (LeaveRequest): audit hủy (#5) + field nhắc (#4) — có thể gộp 1 migration nếu làm #4/#5 cùng đợt.
- Không đụng luồng duyệt/logic tính công hiện có; chỉ thêm endpoint + UI + 1 job.
- Deploy: #2/#3/#1 = chỉ web+pwa; #5/#4 = web+pwa + migrate; #4 cần cấu hình/kiểm tra scheduler worker.

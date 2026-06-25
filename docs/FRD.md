# Functional Requirements Document (FRD)
## Horilla HRM — Công ty Du lịch Hồng Ngọc Hà (HNH Travel)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-06-25 |
| Baseline | [SRS.md](./SRS.md) (yêu cầu tổng quát + NFR), [TDD.md](./TDD.md) (thiết kế) |
| Phạm vi | Đặc tả **chi tiết từng chức năng** (luồng, rule, validation) của các module cốt lõi P0 |

> FRD này **đào sâu** phần Functional Requirements của SRS (FR-1..FR-8) thành đặc tả mức chức năng. NFR/giao diện ngoài/ràng buộc xem SRS. Mỗi chức năng truy vết về FR tương ứng. Module P1/P2 mô tả ở mức tóm tắt (mục 8).

## Quy ước
- **Mã chức năng**: `FN-<MODULE>-<n>`. **Truy vết**: tham chiếu FR-x của SRS.
- Mỗi chức năng gồm: Mô tả · Actor · Tiền điều kiện · Luồng chính · Luồng ngoại lệ · Business rules · Validation · Endpoint/Màn hình.
- **Actor**: NV (nhân viên), QL (quản lý trực tiếp), C&B, HR/Admin, M2M (hệ thống ngoài).

---

## 1. Xác thực & Tài khoản (truy vết FR-1)

### FN-AUTH-1 — Đăng nhập SSO (OIDC)
- **Actor:** NV, QL, C&B, HR.
- **Tiền điều kiện:** User đã tồn tại trong Horilla; có tài khoản Keycloak (KC-local hoặc Microsoft-federated).
- **Luồng chính:**
  1. User mở PWA → bấm "Đăng nhập qua HNHSSO".
  2. BFF khởi tạo OIDC PKCE → redirect Keycloak (kc_idp_hint=microsoft nếu chọn MS).
  3. User xác thực tại KC (mật khẩu KC hoặc Microsoft 365).
  4. KC callback → BFF đổi code lấy token → backend `oidc_backend` map claims → Horilla user.
  5. Backend cấp SimpleJWT → BFF lưu httpOnly cookie → vào `/pwa/`.
- **Luồng ngoại lệ:**
  - E1. Claims không khớp user nào → redirect `/oidc/signup/` (KHÔNG tự tạo user).
  - E2. State mismatch / lỗi OIDC → về `/login/?sso_error=1`.
- **Business rules:**
  - BR-A1. Thứ tự khớp: email→email (Microsoft) → email→username (KC-local) → preferred_username→username.
  - BR-A2. Chỉ user `is_active=True` được khớp.
  - BR-A3. Local login đã tắt — bắt buộc qua OIDC.
- **Endpoint:** `/oidc/*`, BFF `/bff/auth/*`.

### FN-AUTH-2 — Đổi email/username nhân viên (HRM + Keycloak)
- **Actor:** C&B (quyền `_can_onboard`).
- **Tiền điều kiện:** Nhân viên tồn tại; email mới hợp lệ.
- **Luồng chính (Preview → Apply):**
  1. C&B nhập email mới → bấm **Kiểm tra** (`GET .../kc-account/identity/?new_email=`).
  2. Hệ thống phân tích → trả **plan**: `rename` / `link_existing` / `create` / `kc_unreachable`, cột HRM sẽ đổi, tình trạng KC cũ/mới, cảnh báo.
  3. C&B xác nhận → **Áp dụng** (`POST`), `expected_plan` khớp.
  4. Thực thi KC trước → HRM atomic sau; ghi log actor.
- **Luồng ngoại lệ:**
  - E1. Email mới đã tồn tại trong KC (Microsoft-federated) → plan `link_existing`: trỏ HRM sang + disable KC cũ (không rename).
  - E2. Email mới chưa có trong KC → plan `rename`: bật tạm `editUsernameAllowed` realm → đổi → khôi phục.
  - E3. `expected_plan` lệch thời điểm apply → 409, yêu cầu Kiểm tra lại (chống TOCTOU).
  - E4. KC không kết nối được → chặn apply (`can_apply=false`).
- **Business rules:**
  - BR-A4. Chỉ đổi cột HRM **đang giữ email cũ** (auth_user.username/email, employee.email, workinfo.email nếu trùng) — giữ nguyên email khác (vd workinfo `trung.ld@`).
  - BR-A5. Chặn xung đột: email/username mới đã thuộc user/nhân viên khác.
- **Validation:** email mới đúng định dạng, khác email hiện tại.
- **Endpoint:** `GET/POST /api/employee/<pk>/kc-account/identity/`.

### FN-AUTH-3 — Tạo/Reset tài khoản KC
- **Actor:** C&B.
- **Luồng chính:** Chọn nhân viên → tạo KC user (mật khẩu mặc định) + gán role/group + gửi email chào mừng; hoặc reset mật khẩu (ghi `last_password_reset_sent_at/by`).
- **Business rules:** chỉ ghi mốc reset khi action=`reset_password` (không ghi khi resend_welcome/tự đổi).
- **Endpoint:** `POST/PATCH /api/employee/<pk>/kc-account/`, `POST /api/employee/kc-bulk-create/`.

---

## 2. Chấm công (truy vết FR-3)

### FN-ATT-1 — Chấm công vào (clock-in)
- **Actor:** NV (qua PWA, điện thoại).
- **Tiền điều kiện:** Đã đăng nhập; có camera; (khuyến nghị) đã cấp quyền GPS.
- **Luồng chính:**
  1. NV mở ClockModal → app lấy GPS + bật camera.
  2. NV chụp ảnh → bấm chấm vào → `POST /api/attendance/clock-in/` (photo base64, lat/lng, device_kind, client_ua, office_id, work_location).
  3. `_clock_device_guard` kiểm tra thiết bị + ảnh.
  4. Tạo AttendanceActivity + lưu GPS/ảnh; xác định ca/ngày (xử lý ca đêm).
  5. `_check_geofence` → flag `geo_valid`; trả 200 + geo_valid.
  6. Log `hnh.clock`: `CLOCK IN ok user=... device=... ua=...`.
- **Luồng ngoại lệ:**
  - E1. Thiết bị desktop/laptop → **403** "không chấm trên máy tính" + log `CLOCK BLOCKED reason=desktop`.
  - E2. Không có ảnh camera → **400** "Bắt buộc bật camera" + log `reason=no_camera`.
  - E3. Đã đang trong ca → 400 "Already clocked-in".
- **Business rules:**
  - BR-AT1. **Bắt buộc ảnh camera**; GPS chỉ flag, **không chặn**.
  - BR-AT2. Ngoài geofence → `geo_valid=false`, NV chọn lý do làm từ xa (không chặn chấm).
  - BR-AT3. Chống chấm lặp <45s (client localStorage, sống qua reload "văng").
- **Validation:** photo bắt đầu `data:image`; device_kind ≠ desktop.
- **Endpoint:** `POST /api/attendance/clock-in/`. **Màn hình:** ClockModal.

### FN-ATT-2 — Chấm công ra (clock-out)
- Tương tự FN-ATT-1; `do_clock_out` đóng AttendanceActivity mở gần nhất; tính lại công ngày. 23:59 dành cho auto-close (NCO) → chấm ra thật ghi 23:58.

### FN-ATT-3 — Nhận lượt chấm từ máy chấm công (M2M)
- **Actor:** M2M (Ronald Jack/Dahua).
- **Luồng chính:** Agent đẩy batch punches → `POST /api/attendance/biometric-punch/` (token + scope `attendance:write`); match `badge_id` → tạo activity.
- **Business rules:** dedup cửa sổ **120s** tránh trùng với app clock-in; source=`ronaljack`.

### FN-ATT-4 — Import chấm công Excel
- **Actor:** HR/C&B.
- **Luồng chính:** Upload Excel (Mã NS | Tên | Khu vực | Ngày | Vào | Ra | …) → parse từng dòng → tạo Attendance.
- **Luồng ngoại lệ:** badge_id không tồn tại → lỗi (liệt kê); ngày vắng (không vào+ra) → skip; trùng (badge_id, date) → bỏ.
- **Business rules:** chờ HR xác nhận (`attendance_validated=False`); ra<vào → +1 ngày.

### FN-ATT-5 — Tính công ngày & trễ/sớm
- **Mô tả:** Tự động khi có lượt chấm.
- **Business rules:**
  - BR-AT4. **ALD26**: công = lượt cuối − lượt đầu (không trừ trưa); ≥2 lượt = đủ; 1 lượt = NCO; 0 = vắng. Min 09:35 = 100%.
  - BR-AT5. **Trễ/sớm theo giờ lõi**: trễ = chấm vào > `core_start_time||start_time` (+grace); sớm = chấm ra < `core_end_time||end_time`. ALD26 = 08:00/17:30 (không theo khung 00:00–23:58).

### FN-ATT-6 — Xuất CC chấm công tháng
- **Actor:** C&B (`_is_cnb`).
- **Luồng chính:**
  1. Mở trang Xuất CC → mặc định tháng hiện tại, **Từ ngày=đầu tháng, Đến ngày=cuối tháng**.
  2. Lọc: công ty/phòng ban/từ khóa + **từ ngày–đến ngày** (kẹp trong tháng) → `GET /api/attendance/export-monthly/` (page, page_size).
  3. Bảng hiển thị **phân trang** (20/50/100/200 ở góc phải trên), pager Trước/Sau, tổng dòng.
  4. Bấm Xuất Excel → `/export-monthly/xlsx/` (cùng bộ lọc).
- **Business rules:** chỉ C&B; from/to kẹp trong tháng; mỗi dòng = (NV, ngày).
- **Validation:** page_size ∈ {20,50,100,200} (mặc định 50).

---

## 3. Nghỉ phép (truy vết FR-4)

### FN-LEAVE-1 — Tạo đơn nghỉ phép
- **Actor:** NV.
- **Tiền điều kiện:** Có loại phép khả dụng.
- **Luồng chính (theo ngày):**
  1. NV chọn loại phép → chọn ngày (Sáng/Chiều/Cả ngày, nhiều ngày rời) hoặc theo giờ.
  2. Chọn **Người duyệt** (mặc định QL trực tiếp là người đầu) + **Người theo dõi**; C&B **đã pin sẵn, khóa**.
  3. Bấm gửi → `POST /api/leave/user-request-days/` (approver_ids, watcher_ids).
  4. Hệ thống tạo LeaveRequest + ConditionApproval cho từng approver; **chèn C&B server-side** vào approver + watcher; lưu watcher; notify.
- **Luồng ngoại lệ:** vượt số dư phép (loại trừ phép) → 400; ngày trùng → 400.
- **Business rules:**
  - BR-L1. **C&B cố định** (resolve theo công ty/phòng, mặc định toàn cục) luôn ở Người duyệt + theo dõi, **không bỏ chọn được** (enforce cả client lẫn server).
  - BR-L2. Pool người duyệt chọn được = mọi NV active, lọc theo công ty/phòng (modal).
- **Validation:** đủ số dư; ngày không trùng; có ít nhất loại phép.
- **Endpoint:** `POST /api/leave/user-request-days/`, `.../user-request-hours/`. **Màn hình:** LeaveNew.

### FN-LEAVE-2 — Duyệt / Từ chối đơn
- **Actor:** QL / C&B / approver có thẩm quyền / staff.
- **Luồng chính:** Mở "Phê duyệt phép" → chọn đơn → **Duyệt** (`POST /api/leave/pwa-approve/<id>/`) hoặc **Từ chối** (lý do).
- **Business rules:**
  - BR-L3. **Nhiều người duyệt → chỉ cần 1 người** approve là `status=approved`; đơn biến mất khỏi pending của người khác.
  - BR-L4. Chỉ **reporting manager / approver có ConditionApproval / C&B / staff** được duyệt (guard thẩm quyền) → 403 nếu không.
  - BR-L5. Duyệt: trừ available_days (tràn → trừ carryforward). Notify người xin + **watcher**.

### FN-LEAVE-3 — Theo dõi đơn (watcher)
- **Actor:** Người theo dõi (gồm C&B).
- **Luồng chính:** Tab **"Đang theo dõi"** (`GET /api/leave/watching/`) liệt kê đơn đang theo dõi; nhận thông báo khi tạo/duyệt/từ chối.

### FN-LEAVE-4 — Phép bù (compensatory)
- **Actor:** QL đề xuất → C&B duyệt.
- **Luồng chính:** QL tạo HNHCompensatoryProposal (days, note) → C&B duyệt/từ chối → cộng phép bù.

---

## 4. Onboarding nhân viên (truy vết FR-2)

### FN-EMP-1 — Onboard nhân viên mới
- **Actor:** C&B (`_can_onboard`).
- **Luồng chính (atomic):**
  1. Nhập thông tin cá nhân/công việc/giấy tờ/ngân hàng/nhóm quyền (có thể quét CCCD).
  2. `POST /api/employee/onboard/` → tạo Employee + WorkInfo + HNHEmployeeProfile + Bank (transaction).
  3. Ngoài transaction: sync Keycloak (tạo KC user nếu `create_kc=True`).
- **Luồng ngoại lệ:** email tồn tại vs nhân viên bị vô hiệu hóa → phân biệt rõ thông báo; KC sync lỗi → trả cờ lỗi nhưng employee đã tạo.
- **Business rules:** chỉ nhóm C&B/admin; tạo trọn gói atomic phần HRM.
- **Endpoint:** `POST /api/employee/onboard/`, `GET /api/employee/onboard/options/`.

---

## 5. Hợp đồng & Lương (truy vết FR-5)

### FN-PAY-1 — Quản lý 3 loại hợp đồng
- **Actor:** C&B.
- **Business rules (G/H):**
  - Trial: G = wage × trial_wage_pct/100; H = G + base_salary.
  - Performance: G = wage; H = wage + base_salary.
  - Official: G = H = wage.
  - BR-P1. Kiểm tra tình trạng: wage=0, hết hạn, trial quá probation_days, trùng HĐ active.

### FN-PAY-2 — Bảng lương tháng
- **Actor:** C&B.
- **Luồng chính:**
  1. Generate stub lọc Công ty/Phòng/Loại HĐ → tạo MonthlyPayrollEntry (1 dòng/NV/tháng).
  2. HR nhập: ngày công thực, ca đêm, OT (thường/cuối tuần/lễ), KPI%, thưởng, tạm ứng, NPT.
  3. Hệ thống tính cột J→AK (Python + JS realtime).
- **Business rules:**
  - BR-P2. BHXH 8% / BHYT 1.5% / BHTN 1% — có **trần** (cấu hình).
  - BR-P3. **Thuế TNCN lũy tiến 7 bậc**; giảm trừ bản thân 11tr + NPT×4.4tr.
  - BR-P4. Thực lĩnh AK = Gross thực tế − BH − thuế − tạm ứng.
- **Endpoint:** `GET /api/payroll/payroll-management/`, `my-payslip/`.

---

## 6. Thông báo (truy vết FR-7)

### FN-NOTI-1 — Thông báo & Web Push
- **Luồng chính:** Polling `/api/notifications/summary/` mỗi 15s + Web Push (VAPID); âm thanh + app badge. Đăng ký push: `push/subscribe/`.

---

## 7. Catalog Business Rules (cross-cutting)

| ID | Rule |
|----|------|
| BR-A1..A5 | Khớp OIDC, đổi định danh đồng bộ HRM+KC, chống xung đột |
| BR-AT1..AT5 | Bắt buộc camera, GPS flag không chặn, chống chấm lặp, ALD26 span, trễ/sớm theo giờ lõi |
| BR-L1..L5 | C&B pin khóa, 1 người duyệt là hợp lệ, guard thẩm quyền, trừ phép |
| BR-P1..P4 | Tình trạng HĐ, BHXH trần, thuế TNCN 7 bậc, thực lĩnh |
| BR-SEC | M2M 3 lớp (IP+token+scope); secrets qua env; SSO-only |

---

## 8. Module P1/P2 (mức tóm tắt)

| Module | Chức năng chính | Truy vết |
|--------|-----------------|----------|
| Chi phí (Expenses) | Nộp → duyệt QL → xác nhận HC → batch | FR-6.1 |
| Tài sản (Asset) | Cấp phát/đề xuất/thu hồi/báo cáo | FR-6.2 |
| PMS | Mục tiêu/KPI/đánh giá | FR-6.3 |
| Đào tạo / Thăng chức / Offboarding | Đăng ký khóa / multi-level / nghỉ việc | FR-6.3 |
| Quản trị | Công ty/phòng/ca/loại nghỉ, role/group, sync KC, M2M account, giám sát hệ thống | FR-8 |

(Khi cần đặc tả chi tiết các module này, mở rộng theo cùng template FN-* ở trên.)

---

## 9. Truy vết SRS ↔ FRD

| SRS FR | FRD |
|--------|-----|
| FR-1 (Auth/SSO) | FN-AUTH-1,2,3 |
| FR-2 (Nhân viên/Onboard) | FN-EMP-1 |
| FR-3 (Chấm công) | FN-ATT-1..6 |
| FR-4 (Nghỉ phép) | FN-LEAVE-1..4 |
| FR-5 (Lương) | FN-PAY-1,2 |
| FR-7 (Thông báo) | FN-NOTI-1 |
| FR-6, FR-8 | Mục 8 (tóm tắt) |

> FRD này đặc tả chi tiết core P0 (đã vận hành production). Phần P1/P2 ở mức module; mở rộng khi cần bàn giao/nghiệm thu từng phần.

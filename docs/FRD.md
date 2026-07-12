# Functional Requirements Document (FRD)
## HRM Platform — Portable Functional Specification

| | |
|---|---|
| Phiên bản | 2.0 (portable) |
| Ngày | 2026-07-12 |
| Baseline | [SRS.md](./SRS.md) (yêu cầu + NFR), [TDD.md](./TDD.md) (thiết kế), [BRD.md](./BRD.md) (kinh doanh) |
| Reference Implementation (RI) | HNH Travel — production |
| Phạm vi | Đặc tả **chi tiết từng chức năng** (luồng, rule, validation) của module cốt lõi; module mở rộng ở mức tóm tắt |

> FRD **đào sâu** phần Functional Requirements của SRS (FR-1..FR-8) thành đặc tả mức chức năng. Chi tiết gắn doanh nghiệp tham chiếu đánh dấu **`[RI]`**; gợi ý tổ chức khác **`[Adopter]`**. Bỏ/đổi phần `[RI]` là ra FRD cho tổ chức mới.

## Quy ước
- **Mã chức năng**: `FN-<MODULE>-<n>`. **Truy vết**: tham chiếu FR-x của SRS.
- Mỗi chức năng gồm: Mô tả · Actor · Tiền điều kiện · Luồng chính · Luồng ngoại lệ · Business rules (BR) · Validation · Endpoint/Màn hình.
- **Actor**: NV (nhân viên), QL (quản lý trực tiếp), **APPR** (bộ phận duyệt cố định — `[RI]` = C&B), HR/Admin, M2M (hệ thống ngoài).

---

## 1. Xác thực & Tài khoản (truy vết FR-1)

### FN-AUTH-1 — Đăng nhập SSO (OIDC)
- **Actor:** mọi người dùng.
- **Tiền điều kiện:** User đã tồn tại trong hệ thống; có danh tính trên IdP (local hoặc federated).
- **Luồng chính:**
  1. User mở PWA → bấm "Đăng nhập qua SSO".
  2. BFF khởi tạo OIDC **PKCE** → redirect IdP (kèm gợi ý IdP doanh nghiệp nếu chọn — `[RI]` kc_idp_hint=microsoft).
  3. User xác thực tại IdP (mật khẩu IdP hoặc identity federated).
  4. Callback → BFF đổi code lấy token → backend map claims → user hệ thống.
  5. Backend cấp JWT → BFF lưu **httpOnly cookie** → vào `/pwa/`.
- **Luồng ngoại lệ:**
  - E1. Claims không khớp user nào → trang đăng ký/khoá (**KHÔNG tự tạo user**).
  - E2. State mismatch / lỗi OIDC → về trang login kèm mã lỗi.
- **Business rules:**
  - BR-A1. Thứ tự khớp: email→email (federated) → email→username (local) → preferred_username→username.
  - BR-A2. Chỉ user `is_active=True` được khớp.
  - BR-A3. Local login đã tắt — bắt buộc qua OIDC.
- **Endpoint:** `/oidc/*`, BFF `/bff/auth/*`.
- **`[Adopter]`** ngân hàng: thêm **MFA** ở IdP; kc_idp_hint trỏ Azure AD/AD FS; BR-A1..A3 giữ nguyên.

### FN-AUTH-2 — Đổi email/username nhân viên (HRM + IdP)
- **Actor:** APPR (quyền `_can_onboard`).
- **Luồng chính (Preview → Apply):**
  1. Nhập email mới → **Kiểm tra** (`GET .../kc-account/identity/?new_email=`).
  2. Hệ thống trả **plan**: `rename` / `link_existing` / `create` / `idp_unreachable`, cột HRM sẽ đổi, tình trạng tài khoản IdP cũ/mới, cảnh báo.
  3. Xác nhận → **Áp dụng** (`POST`) với `expected_plan` khớp.
  4. Thực thi IdP trước → HRM atomic sau; ghi log actor.
- **Luồng ngoại lệ:**
  - E1. Email mới đã tồn tại trên IdP (federated) → plan `link_existing`: trỏ HRM sang + disable tài khoản cũ.
  - E2. Email mới chưa có trên IdP → plan `rename`: bật tạm `editUsernameAllowed` → đổi → khôi phục.
  - E3. `expected_plan` lệch tại thời điểm apply → **409**, yêu cầu Kiểm tra lại (chống TOCTOU).
  - E4. IdP không kết nối được → chặn apply.
- **Business rules:**
  - BR-A4. Chỉ đổi cột HRM **đang giữ email cũ**; giữ nguyên email khác.
  - BR-A5. Chặn xung đột: email/username mới đã thuộc user khác.
- **Endpoint:** `GET/POST /api/employee/<pk>/kc-account/identity/`.

### FN-AUTH-3 — Tạo / Reset tài khoản IdP
- **Actor:** APPR.
- **Luồng chính:** Chọn NV → tạo tài khoản IdP (mật khẩu mặc định) + gán role/group + email chào mừng; hoặc reset mật khẩu (ghi mốc `last_password_reset_sent_at/by`). Hỗ trợ **tạo hàng loạt** theo phòng ban.
- **Business rules:** chỉ ghi mốc reset khi action=`reset_password`.
- **Endpoint:** `POST/PATCH /api/employee/<pk>/kc-account/`, `POST /api/employee/kc-bulk-create/`.

---

## 2. Chấm công (truy vết FR-3)

### FN-ATT-1 — Chấm công vào (clock-in)
- **Actor:** NV (PWA, điện thoại).
- **Tiền điều kiện:** Đã đăng nhập; có camera; (khuyến nghị) đã cấp quyền GPS.
- **Luồng chính:**
  1. Mở ClockModal → app lấy GPS + bật camera.
  2. Chụp ảnh → chấm vào → `POST /api/attendance/clock-in/` (photo, lat/lng, device_kind, client_ua, office_id, work_location).
  3. `_clock_device_guard` kiểm tra thiết bị + ảnh.
  4. Tạo AttendanceActivity + lưu GPS/ảnh; xác định ca/ngày (xử lý ca đêm).
  5. `_check_geofence` → flag `geo_valid`; trả 200.
  6. Log chẩn đoán: `CLOCK IN ok user=... device=... ua=...`.
- **Luồng ngoại lệ:**
  - E1. **`[RI]`** Thiết bị desktop/laptop → **403** + log `reason=desktop`.
  - E2. Không có ảnh camera → **400** "Bắt buộc bật camera" + log `reason=no_camera`.
  - E3. Đang trong ca → 400 "Already clocked-in".
- **Business rules:**
  - BR-AT1. **Bắt buộc ảnh camera**; GPS chỉ flag, **không chặn**.
  - BR-AT2. Ngoài geofence → `geo_valid=false`, chọn lý do làm từ xa (không chặn); quản lý được thông báo.
  - BR-AT3. Chống chấm lặp <45s (client localStorage, sống qua reload).
- **Endpoint:** `POST /api/attendance/clock-in/`. **Màn hình:** ClockModal.
- **`[Adopter]`** ngân hàng: có thể nới E1 (cho chấm tại quầy/kiosk), siết geofence quanh chi nhánh, bật nhận diện khuôn mặt.

### FN-ATT-2 — Chấm công ra (clock-out)
- Tương tự FN-ATT-1; `do_clock_out` đóng activity mở gần nhất; tính lại công ngày. **`[RI]`** 23:59 dành cho auto-close (NCO) → chấm ra thật ghi 23:58.

### FN-ATT-3 — Nhận lượt chấm từ máy chấm công (M2M)
- **Actor:** M2M. **Luồng:** Agent đẩy batch → `POST /api/attendance/biometric-punch/` (token + scope `attendance:write`); match badge_id → tạo activity.
- **BR:** dedup cửa sổ **120s** tránh trùng app; ghi source thiết bị.

### FN-ATT-4 — Import chấm công Excel
- **Actor:** HR/APPR. **Luồng:** Upload Excel (Mã NV | Tên | Khu vực | Ngày | Vào | Ra) → parse từng dòng → tạo Attendance.
- **Ngoại lệ:** badge_id không tồn tại → liệt kê lỗi; ngày vắng → skip; trùng (badge_id, date) → bỏ.
- **BR:** chờ HR xác nhận (`attendance_validated=False`); ra<vào → +1 ngày.

### FN-ATT-5 — Tính công ngày & trễ/sớm
- **Mô tả:** tự động khi có lượt chấm.
- **Business rules:**
  - BR-AT4. **`[RI]` ALD26**: công = lượt cuối − lượt đầu (không trừ trưa); ≥2 lượt = đủ; 1 lượt = NCO; 0 = vắng. Min 09:35 = 100%.
  - BR-AT5. **Trễ/sớm theo giờ lõi**: trễ = chấm vào > `core_start_time||start_time` (+grace); sớm = chấm ra < `core_end_time||end_time`. `[RI]` ALD26 = 08:00/17:30.
- **`[Adopter]`**: cấu hình mô hình ca khác (ca hành chính, ca chi nhánh) qua `core_*_time` + `check_mode`; không sửa code.

### FN-ATT-6 — Xuất bảng chấm công tháng
- **Actor:** APPR (`_is_cnb`).
- **Luồng chính:**
  1. Mở trang Xuất CC → mặc định tháng hiện tại, Từ ngày=đầu tháng, Đến ngày=cuối tháng.
  2. Lọc công ty/phòng ban/từ khóa + khoảng ngày → `GET /api/attendance/export-monthly/` (page, page_size).
  3. Bảng **phân trang** (20/50/100/200) + pager + tổng dòng.
  4. Xuất Excel → `/export-monthly/xlsx/` (cùng bộ lọc).
- **BR:** chỉ APPR; from/to kẹp trong tháng; mỗi dòng = (NV, ngày).

### FN-ATT-7 — Hoạt động chấm công (view quản lý)
- **Actor:** QL/APPR.
- **Luồng chính:** chọn phạm vi (hôm nay/3 ngày/7 ngày/tháng/khoảng) → 2 chế độ:
  - **Lưới (Grid):** đủ **24 khung giờ/ngày** (00:00→23:00, mỗi dòng 1h), chia Buổi sáng (00–11)/Buổi chiều (12–23); mỗi ô hiện **số lượt chấm** trong khung giờ.
  - **Danh sách (List):** gom theo NV/ngày → chuỗi **"Lượt chấm Đầu → Lượt 2, 3…"** theo thời gian, kèm giờ + nguồn chấm (máy/app).
- **Endpoint:** `GET /api/attendance/activity-overview/?mode=...`.

### FN-ATT-8 — Timeline 24h cá nhân
- **Actor:** NV (tự xem).
- **Luồng chính:** mở lịch ngày (`/day/:date`) → timeline 24 dòng giờ. Lồng vào **đúng dòng giờ**:
  - **Lượt chấm công cá nhân** (giờ + Trong/Ngoài VP + nguồn) — `GET /api/attendance/activity-detail/?date=` (self-scope).
  - **Sự kiện Outlook** có giờ cụ thể (qua BFF Microsoft Graph); sự kiện cả ngày ở dải trên cùng.
  - Cuộc họp/công việc (backend day-detail).
- **Endpoint:** `GET /api/employee/me/day-detail/?date=`, `GET /api/attendance/activity-detail/`, BFF `/bff/api/calendar/outlook`.

---

## 3. Nghỉ phép (truy vết FR-4)

### FN-LEAVE-1 — Tạo đơn nghỉ phép
- **Actor:** NV.
- **Luồng chính (theo ngày):**
  1. Chọn loại phép → chọn ngày (Sáng/Chiều/Cả ngày, nhiều ngày rời) hoặc theo giờ.
  2. Chọn **Người duyệt** (mặc định QL trực tiếp) + **Người theo dõi**; **APPR đã pin sẵn, khóa**.
  3. Gửi → `POST /api/leave/user-request-days/` (approver_ids, watcher_ids).
  4. Tạo LeaveRequest + ConditionApproval cho từng approver; **chèn APPR server-side**; lưu watcher; notify.
- **Ngoại lệ:** vượt số dư (loại trừ phép) → 400; ngày trùng → 400.
- **Business rules:**
  - BR-L1. **APPR cố định** (resolve theo công ty/phòng, mặc định toàn cục) luôn ở Người duyệt + theo dõi, **không bỏ chọn được** (enforce client + server).
  - BR-L2. Pool người duyệt = mọi NV active, lọc theo công ty/phòng.
- **Endpoint:** `POST /api/leave/user-request-days/`, `.../user-request-hours/`. **Màn hình:** LeaveNew.

### FN-LEAVE-2 — Sửa / Xóa đơn của mình
- **Actor:** NV (chủ đơn).
- **Luồng:** với đơn **còn `status=requested`** → mở chi tiết → **Xóa đơn** (`DELETE /api/leave/user-request/<id>/`); sửa = xóa rồi tạo lại (đơn nhiều ngày bị tách nhiều bản ghi).
- **BR:** chỉ chủ đơn; chỉ khi chưa duyệt; đơn approved không sửa/xóa được qua đường này.

### FN-LEAVE-3 — Duyệt / Từ chối đơn
- **Actor:** QL / APPR / approver có thẩm quyền / staff.
- **Luồng chính:** Mở "Phê duyệt phép" → chọn đơn → **Duyệt** (`POST /api/leave/pwa-approve/<id>/`) hoặc **Từ chối** (lý do).
- **Business rules:**
  - BR-L3. **Nhiều người duyệt → chỉ cần 1 người** approve là `status=approved`; đơn biến khỏi pending của người khác.
  - BR-L4. Chỉ **reporting manager / approver có ConditionApproval / APPR / staff** được duyệt → 403 nếu không.
  - BR-L5. Duyệt: trừ available_days (tràn → trừ carryforward). Notify người xin + **watcher**.

### FN-LEAVE-4 — Quản lý đơn nghỉ (APPR)
- **Actor:** APPR.
- **Luồng chính:** tab "Đơn nghỉ" → lọc **Chờ duyệt / Đã duyệt**:
  - **Chờ duyệt:** danh sách đơn `requested` **toàn tổ chức** (không phụ thuộc routing per-employee) + nút Duyệt/Từ chối tại chỗ.
  - **Đã duyệt:** đơn approved trong tháng + cảnh báo xung đột chấm công (NV đi làm ngày nghỉ) + **hủy đơn đã duyệt** (có lý do).
- **Endpoint:** `GET /api/leave/hnh-approved-leaves/?status=requested|approved`, `POST /api/leave/hnh-cancel-approved/<id>/`.

### FN-LEAVE-5 — Theo dõi đơn (watcher)
- **Actor:** Người theo dõi (gồm APPR). **Luồng:** tab "Đang theo dõi" (`GET /api/leave/watching/`); nhận thông báo khi tạo/duyệt/từ chối.

### FN-LEAVE-6 — Phép bù (compensatory)
- **Actor:** QL đề xuất → APPR duyệt. **Luồng:** QL tạo proposal (days, note) → APPR duyệt/từ chối → cộng phép bù.

### FN-LEAVE-7 — Tổng quan phép tháng
- **Actor:** QL/APPR.
- **Luồng chính:** lưới Gantt: cột tên NV + số dư (Phép đầu/Trừ phép/Không lương/Còn lại) + ô ngày theo màu trạng thái. Bấm **ô ngày** → modal giữa màn hình chi tiết đơn; bấm **ô tên** → chi tiết số dư + APPR chỉnh tay. Lọc công ty/phòng (pills), tìm kiếm, lọc phát sinh.
- **Endpoint:** `GET /api/leave/hnh-leave-overview/`, `hnh-leave-detail/`, `hnh-adjust-balance/`.

---

## 4. Onboarding nhân viên (truy vết FR-2)

### FN-EMP-1 — Onboard nhân viên mới
- **Actor:** APPR (`_can_onboard`).
- **Luồng chính (atomic):**
  1. Nhập thông tin cá nhân/công việc/giấy tờ/ngân hàng/nhóm quyền (có thể quét giấy tờ — `[RI]` OCR CCCD).
  2. `POST /api/employee/onboard/` → tạo Employee + WorkInfo + hồ sơ mở rộng + Bank (transaction).
  3. Ngoài transaction: sync IdP (tạo tài khoản nếu `create_kc=True`).
- **Ngoại lệ:** **email tồn tại** vs **nhân viên bị vô hiệu hóa** → thông báo phân biệt rõ; IdP sync lỗi → trả cờ lỗi nhưng employee đã tạo.
- **BR:** chỉ nhóm APPR/admin; phần HRM atomic.
- **Endpoint:** `POST /api/employee/onboard/`, `GET /api/employee/onboard/options/`.

---

## 5. Hợp đồng & Lương (truy vết FR-5)

### FN-PAY-1 — Quản lý loại hợp đồng
- **Actor:** APPR.
- **Business rules (`[RI]` G/H):**
  - Trial: G = wage × trial_wage_pct/100; H = G + base_salary.
  - Performance: G = wage; H = wage + base_salary.
  - Official: G = H = wage.
  - BR-P1. Kiểm tra tình trạng: wage=0, hết hạn, thử việc quá probation_days, trùng HĐ active.
- **`[Adopter]`**: thay bằng ngạch/bậc + phụ cấp ngân hàng; giữ khung `ContractBase`.

### FN-PAY-2 — Bảng lương tháng
- **Actor:** APPR.
- **Luồng chính:**
  1. Generate stub lọc Công ty/Phòng/Loại HĐ → tạo entry (1 dòng/NV/tháng).
  2. HR nhập: ngày công thực, ca đêm, OT (thường/cuối tuần/lễ), KPI%, thưởng, tạm ứng, người phụ thuộc.
  3. Tính cột dẫn xuất (server Python + JS realtime).
- **Business rules:**
  - BR-P2. **`[RI]`** Bảo hiểm BHXH 8% / BHYT 1.5% / BHTN 1% — có **trần** (cấu hình).
  - BR-P3. **`[RI]`** Thuế TNCN **lũy tiến 7 bậc**; giảm trừ bản thân + người phụ thuộc.
  - BR-P4. Thực lĩnh = Gross thực tế − bảo hiểm − thuế − tạm ứng.
- **Endpoint:** `GET /api/payroll/payroll-management/`, `my-payslip/`.

---

## 6. Lịch tổng hợp & Outlook (truy vết FR-8.6)

### FN-CAL-1 — Lịch tổng hợp cá nhân
- **Actor:** NV. **Luồng:** hợp nhất nghỉ phép + ngày lễ + sự kiện HRM + **lịch Outlook** (per-user, qua BFF Graph). Feed .ics; kết nối/hủy Outlook.
- **Endpoint:** `GET /api/calendar/events/`, `/api/calendar/token/`, `outlook-token/`, BFF `/bff/api/calendar/outlook`, `/bff/outlook/status`.
- **BR:** sự kiện HRM lấy server-side; Outlook merge client (BFF giữ refresh_token mã hóa per-user).

---

## 7. Thông báo (truy vết FR-7)

### FN-NOTI-1 — Thông báo & Web Push
- **Luồng:** polling `/api/notifications/summary/` định kỳ + Web Push (VAPID); âm thanh + app badge. Đăng ký push: `push/subscribe/`.

### FN-NOTI-2 — Bảng tin nội bộ (Announcement)
- **Luồng:** tạo/gửi/lịch sử; ghim (pinned, chỉ staff); like (toggle); feed công ty phân trang. Feed dùng `annotate()` cho like_count/read_count (tránh N+1).

---

## 8. Catalog Business Rules (cross-cutting)

| ID | Rule |
|----|------|
| BR-A1..A5 | Khớp OIDC, đổi định danh đồng bộ HRM+IdP (preview→apply, chống TOCTOU), chống xung đột |
| BR-AT1..AT5 | Bắt buộc camera, GPS flag không chặn, chống chấm lặp, span công theo ca, trễ/sớm theo giờ lõi |
| BR-L1..L5 | APPR pin khóa, 1 người duyệt là hợp lệ, guard thẩm quyền, trừ phép; NV sửa/xóa khi chờ duyệt |
| BR-P1..P4 | Tình trạng HĐ, bảo hiểm có trần, thuế lũy tiến, thực lĩnh |
| BR-SEC | M2M 3 lớp (IP+token+scope); secrets qua env; SSO-only; audit thao tác nhạy cảm |

---

## 9. Module mở rộng (mức tóm tắt)

| Module | Chức năng chính | Truy vết |
|--------|-----------------|----------|
| Chi phí (Expenses) | Nộp → duyệt QL → xác nhận HC → batch | FR-6.1 |
| Tài sản (Asset) | Cấp phát/đề xuất/thu hồi/báo cáo | FR-6.2 |
| PMS | Mục tiêu/KPI/đánh giá | FR-6.3 |
| Tuyển dụng / Đào tạo / Thăng chức / Offboarding | Tuyển → nghỉ việc, multi-level | FR-6.3 |
| Dự án/Công việc | Giao việc, tiến độ, lồng lịch ngày | FR-6.4 |
| Quản trị | Danh mục, role/group, sync IdP, M2M account, giám sát | FR-8 |
| **`[RI]` đặc thù** | Tour du lịch, gamification | (bỏ cho ngân hàng) |

(Khi cần đặc tả chi tiết, mở rộng theo cùng template FN-* ở trên.)

---

## 10. Truy vết SRS ↔ FRD

| SRS FR | FRD |
|--------|-----|
| FR-1 (Auth/SSO) | FN-AUTH-1,2,3 |
| FR-2 (Nhân viên/Onboard) | FN-EMP-1 |
| FR-3 (Chấm công) | FN-ATT-1..8 |
| FR-4 (Nghỉ phép) | FN-LEAVE-1..7 |
| FR-5 (Lương) | FN-PAY-1,2 |
| FR-7 (Thông báo) | FN-NOTI-1,2 |
| FR-8.6 (Lịch/Outlook) | FN-CAL-1 |
| FR-6, FR-8 (khác) | Mục 9 (tóm tắt) |

> FRD đặc tả chi tiết core P0 (đã vận hành production `[RI]`). Module P1/P2 ở mức tóm tắt; mở rộng khi bàn giao/nghiệm thu từng phần. Đổi phần `[RI]` để dùng cho tổ chức khác.

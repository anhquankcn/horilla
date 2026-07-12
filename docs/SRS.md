# Software Requirements Specification (SRS)
## Horilla HRM — Công ty Du lịch Hồng Ngọc Hà (HNH Travel)

| | |
|---|---|
| Phiên bản | 1.1 |
| Ngày | 2026-07-12 |
| Branch | `horilla_aqv10` |
| Trạng thái | Đang vận hành production (qlns.hnhtravel.work) |
| Nguồn | Sinh từ codebase + CLAUDE.md; cập nhật các tính năng 06–07/2026 |

> Tài liệu mô tả **yêu cầu** của hệ thống. Bối cảnh & giá trị kinh doanh xem [BRD.md](./BRD.md). Đặc tả chức năng chi tiết xem [FRD.md](./FRD.md). Thiết kế kỹ thuật xem [TDD.md](./TDD.md).

---

## 1. Giới thiệu

### 1.1 Mục đích
Hệ thống HRM (Human Resource Management) số hóa toàn bộ nghiệp vụ nhân sự của **Công ty Du lịch Hồng Ngọc Hà** (~360 nhân viên): chấm công, nghỉ phép, hợp đồng & lương, hồ sơ nhân sự, tuyển dụng/onboarding, tài sản, đánh giá hiệu suất, chi phí, lịch làm việc. Hệ thống là bản tùy biến sâu của nền tảng mã nguồn mở **Horilla**, bổ sung nhiều module đặc thù cho doanh nghiệp du lịch Việt Nam.

### 1.2 Phạm vi
- **Web admin** (Django server-rendered) cho HR/quản trị.
- **PWA mobile-first** (React) cho nhân viên: chấm công GPS+camera, xin nghỉ, xem lương, lịch, thông báo.
- **SSO tập trung** qua Keycloak (OIDC) — đăng nhập một lần, hỗ trợ Microsoft 365.
- **API M2M** cho tích hợp hệ thống ngoài (máy chấm công, ERP, các app nội bộ).

### 1.3 Đối tượng & vai trò (stakeholders)

| Vai trò | Mô tả | Kênh chính |
|---------|-------|-----------|
| Nhân viên | Chấm công, xin nghỉ, xem lương/lịch, nhận thông báo | PWA |
| Quản lý trực tiếp (reporting manager) | Duyệt nghỉ phép, chấm công, OT, chi phí của cấp dưới | PWA |
| C&B (Compensation & Benefits) | Quản lý lương/hợp đồng, duyệt nghỉ phép cố định, onboard, tài khoản KC | PWA + Web admin |
| HR/Admin hệ thống | Cấu hình công ty, phòng ban, ca, loại nghỉ, phân quyền | Web admin |
| Ban giám đốc | Báo cáo, dashboard, phê duyệt cấp cao | PWA + Web |
| Hệ thống ngoài (M2M) | Máy chấm công, ERP, app nội bộ trao đổi dữ liệu | API M2M |

### 1.4 Định nghĩa & viết tắt
- **ALD26**: ca làm việc 24h chung toàn công ty (00:00–23:58), tính công theo span đầu→cuối; giờ lõi tính trễ/sớm 08:00–17:30.
- **NCO**: lượt chấm chỉ có vào, chưa có ra.
- **G / H**: G = Lương cơ bản đóng BHXH; H = Tổng Gross (trước thuế).
- **LHS Pool**: quỹ thu nhập theo hiệu suất.
- **C&B**: Compensation & Benefits (Tiền lương & Phúc lợi).
- **PWA**: Progressive Web App. **BFF**: Backend-for-Frontend. **OIDC**: OpenID Connect.

---

## 2. Mô tả tổng quan

### 2.1 Bối cảnh sản phẩm
Hệ thống chạy như **monolith Django + PWA tách rời**, đứng sau nginx + Cloudflare Tunnel, xác thực tập trung qua Keycloak. Dữ liệu lưu PostgreSQL, cache/queue/session qua Redis. Triển khai bằng Docker Compose trên 2 môi trường (prod, stage). Gồm **39 Django apps**, **~81 màn hình PWA**, **16 nhóm API**. Chi tiết kiến trúc: [TDD.md](./TDD.md).

### 2.2 Ràng buộc
- **Ngôn ngữ mặc định Tiếng Việt** (`vi`), múi giờ `Asia/Ho_Chi_Minh` (UTC+7).
- **SSO-only**: đăng nhập local đã tắt, bắt buộc qua Keycloak OIDC.
- **Chấm công bắt buộc trên điện thoại có camera** (chặn laptop/desktop, bắt buộc ảnh selfie).
- Tuân thủ **Luật Lao động Việt Nam** (nghỉ phép, BHXH/BHYT/BHTN, thuế TNCN lũy tiến).
- White-label thương hiệu HNH (logo, màu đỏ `#c0222b` / navy `#142B6F`).

### 2.3 Giả định & phụ thuộc
- Mọi nhân viên có tài khoản Keycloak (KC-local hoặc Microsoft-federated).
- Nhân viên dùng smartphone có GPS + camera để chấm công.
- Máy chấm công vật lý (Ronald Jack / Dahua) đẩy dữ liệu qua agent/M2M.

---

## 3. Yêu cầu chức năng (Functional Requirements)

### FR-1 Xác thực & Phân quyền (SSO)
- FR-1.1 Đăng nhập qua Keycloak OIDC (nút "Đăng nhập qua HNHSSO"); hỗ trợ kc_idp_hint cho Microsoft 365.
- FR-1.2 Map KC user → Horilla user theo thứ tự: email→email (Microsoft), email→username (KC-local), preferred_username→username.
- FR-1.3 KHÔNG tự tạo user khi login — admin phải tạo trước; nếu không khớp → trang signup.
- FR-1.4 Phân quyền theo Django Groups/Permissions + nhóm đặc thù (C&B, admin hệ thống).
- FR-1.5 C&B/HR đổi email + username của nhân viên đồng bộ cả HRM lẫn Keycloak (preview → apply, tự nhận rename / link tài khoản Microsoft sẵn có / tạo mới).
- FR-1.6 C&B tạo/reset tài khoản KC (mật khẩu mặc định, gửi email chào mừng), tạo hàng loạt theo phòng ban.

### FR-2 Quản lý Nhân viên
- FR-2.1 Hồ sơ nhân viên: thông tin cá nhân, công việc (phòng ban/vị trí/vai trò/quản lý trực tiếp/ca), ngân hàng.
- FR-2.2 Hồ sơ mở rộng HNH: CCCD, BHXH, mã số thuế, hộ khẩu, dân tộc, chứng chỉ.
- FR-2.3 Cấp bậc nội bộ (WorkLevel) 1–8 với quyền lợi theo cấp (nghỉ phép thêm, bảo hiểm, WFH, phụ cấp).
- FR-2.4 Onboarding trọn gói: tạo Employee + WorkInfo + nhóm quyền + tài khoản Keycloak (atomic). Hỗ trợ quét CCCD.
- FR-2.5 Danh bạ nhân viên, sơ đồ tổ chức, tìm kiếm/lọc theo công ty/phòng ban.
- FR-2.6 Phân biệt email tồn tại vs nhân viên bị vô hiệu hóa khi onboard.
- FR-2.7 Đa công ty (multi-company): dữ liệu tách theo công ty, lọc xuyên suốt.

### FR-3 Chấm công (Attendance)
- FR-3.1 Chấm công vào/ra qua PWA: bắt buộc **ảnh camera** + **toạ độ GPS**; chặn thiết bị desktop/laptop (403).
- FR-3.2 Kiểm tra geofence theo văn phòng gần nhất; ngoài vùng → đánh dấu `geo_valid=false` (KHÔNG chặn chấm), yêu cầu chọn lý do làm từ xa; **thông báo quản lý** kèm link duyệt.
- FR-3.3 Nhận lượt chấm từ máy chấm công vật lý (Ronald Jack/Dahua) qua M2M, chống trùng với app (cửa sổ 120s).
- FR-3.4 Import chấm công từ file Excel (Mã NS | Tên | Khu vực | Ngày | Vào | Ra | …), match badge_id, bỏ qua ngày vắng, chống trùng.
- FR-3.5 Tính công ngày theo ca: ALD26 (span đầu→cuối), one-way shifts, ca thường (vào-ra trừ trưa).
- FR-3.6 Tính **đi trễ / về sớm** theo **giờ lõi** của ca (ALD26 = 08:00 / 17:30), không theo khung ca.
- FR-3.7 Yêu cầu điều chỉnh chấm công, OT, khai báo/duyệt NCO; quản lý duyệt.
- FR-3.8 Xuất bảng chấm công tháng (Excel + preview): lọc công ty/phòng/từ khóa + **từ ngày–đến ngày** trong tháng, **phân trang** (20/50/100/200).
- FR-3.9 Tự động clock-out (auto punch-out) khi nhân viên quên; ghi nhật ký chẩn đoán (device/UA/lý do chặn) qua logger `hnh.clock`.
- FR-3.10 **Hoạt động chấm công (view quản lý)**: chế độ **Lưới** hiển thị đủ **24 khung giờ/ngày** (mỗi dòng 1h, chia Buổi sáng 00–11 / Buổi chiều 12–23, mỗi ô = số lượt chấm); chế độ **Danh sách** gom theo NV/ngày thành chuỗi "Lượt chấm Đầu → Lượt 2, 3…" kèm nguồn chấm (máy/app).
- FR-3.11 **Timeline 24h cá nhân**: nhân viên tự xem lịch ngày với 24 dòng giờ, lồng **lượt chấm công cá nhân** (giờ + Trong/Ngoài VP + nguồn) và **sự kiện Outlook** có giờ cụ thể vào đúng khung giờ.

### FR-4 Nghỉ phép (Leave)
- FR-4.1 8 loại nghỉ theo Luật LĐ VN (phép năm 12 ngày, ốm, thai sản 180 ngày, kết hôn, tang, **nghỉ bù Tour/Lễ**, không lương, chăm con ốm).
- FR-4.2 Tạo đơn nghỉ theo ngày (Sáng/Chiều/Cả ngày, nhiều ngày rời) hoặc theo giờ; kiểm tra số dư phép.
- FR-4.3 **Người duyệt**: mặc định quản lý trực tiếp là người duyệt đầu; chọn thêm qua modal lọc công ty/phòng → chọn user.
- FR-4.4 **C&B cố định** (theo công ty/phòng ban, mặc định toàn cục) luôn được pin vào Người duyệt + Người theo dõi, **không bỏ chọn được** (enforce server-side).
- FR-4.5 Nhiều người duyệt — **chỉ cần 1 người duyệt** là đơn hợp lệ (approved); người không có thẩm quyền không duyệt được.
- FR-4.6 **Người theo dõi** được lưu DB + nhận thông báo khi tạo/duyệt/từ chối; xem danh sách "Đang theo dõi".
- FR-4.7 Nhân viên **sửa/xóa đơn của mình khi còn chờ duyệt** (đơn approved không sửa/xóa qua đường này).
- FR-4.8 **C&B quản lý đơn nghỉ**: xem danh sách **đơn chờ duyệt toàn tổ chức** (không phụ thuộc routing per-employee) + duyệt/từ chối tại chỗ; xem đơn đã duyệt kèm **cảnh báo xung đột chấm công** (NV đi làm ngày nghỉ); **hủy đơn đã duyệt** (có lý do).
- FR-4.9 Phép bù: manager đề xuất → C&B duyệt (HNHCompensatoryProposal).
- FR-4.10 Cấp phát phép (allocation), carryforward, reset theo năm; import số dư từ Excel; **tổng quan phép tháng** (lưới Gantt) — bấm ô ngày mở **modal chi tiết đơn**, bấm ô tên mở chi tiết số dư + C&B chỉnh tay.

### FR-5 Hợp đồng & Lương (Payroll)
- FR-5.1 3 loại hợp đồng HNH: **Thử việc (Trial/UAT)**, **Chính thức (Official)**, **Hiệu suất (Performance)** kế thừa `ContractBase`.
- FR-5.2 Công thức G/H theo loại HĐ:
  - Trial: G = wage × trial_wage_pct/100; H = G + base_salary
  - Performance: G = wage; H = wage + base_salary
  - Official: G = H = wage
- FR-5.3 Phụ lục 1 (ContractKPIAppendix): khoảng thu nhập năm + tỷ lệ thưởng theo % KPI (cho Trial + Performance).
- FR-5.4 Bảng lương tháng (MonthlyPayrollEntry, 1 dòng/NV/tháng): generate stub lọc theo Công ty/Phòng/Loại HĐ; HR nhập ngày công, ca đêm, OT, KPI%, thưởng, tạm ứng.
- FR-5.5 Tính tự động cột J→AK: LCB thực nhận, LHS Pool, OT, KPI thực nhận, Gross thực tế, BHXH/BHYT/BHTN, **thuế TNCN lũy tiến 7 bậc**, giảm trừ NPT, thực lĩnh. (Đồng bộ công thức Python + JavaScript realtime.)
- FR-5.6 Kiểm tra tình trạng HĐ: wage=0, hết hạn, trial quá probation_days, trùng HĐ active.
- FR-5.7 Phiếu lương (Payslip) cho nhân viên xem trên PWA; gửi email; vay lương; hoàn chi (reimbursement).

### FR-6 Chi phí, Tài sản, Đào tạo, Hiệu suất, Thăng chức
- FR-6.1 Chi phí (Expenses): nộp hóa đơn → duyệt manager → xác nhận hành chính → batch xử lý.
- FR-6.2 Tài sản (Asset): cấp phát, đề xuất, thu hồi, báo cáo.
- FR-6.3 Đào tạo (Training), Đánh giá hiệu suất (PMS: mục tiêu/KPI), Thăng chức (Promotion multi-level), Tuyển dụng (Recruitment), Offboarding.
- FR-6.4 Dự án & công việc (Project/Task): giao việc, theo dõi tiến độ, lồng vào lịch ngày cá nhân.

### FR-7 Thông báo & Truyền thông
- FR-7.1 Thông báo trong app + **Web Push** (VAPID), polling 15s, âm thanh + app badge.
- FR-7.2 Announcement công ty (tạo/gửi/lịch sử, pinned, like, feedback); feed "Tin nội bộ" (HNH Life).

### FR-8 Quản trị & Tích hợp
- FR-8.1 Quản lý công ty/phòng ban/vị trí/ca/loại nghỉ/loại công.
- FR-8.2 Quản lý vai trò & nhóm quyền, đồng bộ role/user với Keycloak.
- FR-8.3 Quản lý service account M2M (token, scope, IP allowlist), cấu hình tích hợp ngoài.
- FR-8.4 Giám sát hệ thống (SystemHealthLog: replication prod↔standby, backup SSO).
- FR-8.5 Đồng bộ DB standby → stage (mirror dữ liệu chấm công/nhân viên cho môi trường test).
- FR-8.6 **Lịch tổng hợp**: hợp nhất nghỉ phép + ngày lễ + sự kiện + **lịch Outlook (Microsoft Graph)**; feed .ics cá nhân; kết nối/hủy kết nối Outlook per-user (token lưu mã hóa).
- FR-8.7 Embed/SSO handoff cho app nội bộ (M2M ticket + embed session): EOffice, 1StopShop, Arkon, IAM.

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)

| Mã | Loại | Yêu cầu |
|----|------|---------|
| NFR-1 | Bảo mật | SSO-only qua Keycloak OIDC (RS256, clock skew 5'); M2M 3 lớp (IP CIDR + token SHA256 + scope); secrets qua env, không hardcode; chấm công bắt buộc camera + chặn desktop |
| NFR-2 | Hiệu năng | API list dùng `annotate()` tránh N+1; phân trang dữ liệu lớn; tải thực tế nhẹ (~12 lượt chấm/phút đỉnh, web CPU <15%) |
| NFR-3 | Khả dụng | Docker Compose multi-container; standby replica; backup SSO/DB; giám sát replication định kỳ |
| NFR-4 | Khả dụng (UX) | PWA mobile-first, safe-area aware, offline-ready (service worker), pull-to-refresh, install banner iOS/Android |
| NFR-5 | Bản địa hóa | Tiếng Việt mặc định (~4500 entries dịch), timezone UTC+7, định dạng ngày/tiền VN |
| NFR-6 | Tương thích | PWA iOS Safari + Android Chrome; tối ưu RAM camera (capture ≤720px) tránh iOS reload |
| NFR-7 | Tuân thủ | Luật LĐ VN: BHXH/BHYT/BHTN có trần, thuế TNCN lũy tiến, giảm trừ bản thân/NPT |
| NFR-8 | Vận hành | Deploy qua git pull + docker build trên prod/stage; migration test stage trước prod; nhật ký chẩn đoán grep được; deploy web/pwa (không bff) không buộc re-login (Redis session) |
| NFR-9 | Toàn vẹn dữ liệu | Thao tác đa bước atomic (onboard, tạo đơn, bảng lương); guard chống trùng/chấm lặp |
| NFR-10 | Kiểm toán | Ghi lịch sử thay đổi (horilla_audit) cho thao tác nhạy cảm (đổi định danh, reset mật khẩu, chỉnh số dư phép) |

---

## 5. Giao diện ngoài (External Interfaces)

| Hệ thống | Mục đích | Cơ chế |
|----------|----------|--------|
| **Keycloak** (sso.hnhtravel.work, realm HNHTravel-SGN) | SSO OIDC + quản trị user/role | OIDC + Admin REST API |
| **Microsoft 365** | Federated identity + lịch Outlook | KC Identity Provider + Microsoft Graph |
| **Máy chấm công** (Ronald Jack, Dahua) | Đẩy lượt chấm vật lý | M2M token + scope `attendance:write` |
| **SMTP (Gmail)** | Email welcome, reset mật khẩu, bảng lương | DynamicEmailConfiguration |
| **Geofencing** | Kiểm tra vị trí chấm công | check_geofence (lat/lng/radius) |
| **Web Push (VAPID)** | Thông báo đẩy ra ngoài app | Push subscription |
| **Weather (wttr.in)** | Hiển thị thời tiết (proxy tránh CORS iOS) | `/api/base/weather/` |
| **App nội bộ** (EOffice, 1StopShop, Arkon, IAM, AppVMB) | Embed/SSO handoff | M2M integration + embed session |

---

## 6. Truy vết & ưu tiên

Các yêu cầu được hiện thực trong các module Django (`employee`, `attendance`, `leave`, `payroll`, `base`, `horilla_api`, `notifications`, `outlook_auth`...) và PWA (`pwa/frontend`). Chi tiết ánh xạ requirement → thiết kế/endpoint/model xem [TDD.md](./TDD.md); đặc tả chức năng xem [FRD.md](./FRD.md); giá trị kinh doanh xem [BRD.md](./BRD.md).

Ưu tiên: **P0** (chấm công, nghỉ phép, lương, SSO) đang vận hành production. **P1** (chi phí, tài sản, PMS, đào tạo, thăng chức, tuyển dụng, lịch tổng hợp, thông báo) đã có. **P2** (gamification WC2026, module tourism, tích hợp app ngoài) tùy chọn theo feature flag.

> Cập nhật 1.1 (2026-07-12): bổ sung FR-3.10/3.11 (hoạt động chấm công 24h + timeline cá nhân), FR-4.7/4.8 (NV sửa/xóa đơn + C&B quản lý đơn chờ duyệt), FR-8.6 (lịch tổng hợp Outlook), NFR-10 (kiểm toán). Chi tiết công thức/endpoint đối chiếu mã nguồn khi triển khai thay đổi.

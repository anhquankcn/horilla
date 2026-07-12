# Software Requirements Specification (SRS)
## HRM Platform — Portable Capability Model

| | |
|---|---|
| Phiên bản | 2.0 (portable) |
| Ngày | 2026-07-12 |
| Nguồn | Tổng hợp từ codebase Horilla-based HRM (39 Django apps, PWA React, Keycloak SSO) |
| Reference Implementation (RI) | HNH Travel — hệ thống đang vận hành production (qlns.hnhtravel.work) |
| Mục đích | Tài liệu neo (anchor) để dẫn xuất BRD / FRD / TDD, và để dự án khác (vd **TMO HRM của ngân hàng**) tham khảo xây HRM subsystem |

> **Cách đọc tài liệu này.** Đây là **model năng lực HRM chung** — mô tả *hệ thống HRM cần làm gì*, không phụ thuộc một doanh nghiệp cụ thể. Mọi chi tiết gắn với doanh nghiệp tham chiếu (HNH Travel — công ty du lịch VN) được đánh dấu **`[RI]`** (Reference Implementation) và có **`[Adopter]`** gợi ý cách một tổ chức khác (vd ngân hàng) thay thế. Bỏ/đổi phần `[RI]` là ra được SRS cho tổ chức mới.
>
> Thiết kế kỹ thuật: [TDD.md](./TDD.md). Đặc tả chức năng chi tiết: [FRD.md](./FRD.md). Mục tiêu kinh doanh: [BRD.md](./BRD.md).

---

## 1. Giới thiệu

### 1.1 Mục đích
Hệ thống **HRM (Human Resource Management)** số hóa toàn bộ vòng đời nhân sự của một tổ chức: tuyển dụng → onboarding → chấm công → nghỉ phép → hợp đồng & lương → hiệu suất → tài sản/chi phí → offboarding, kèm cổng tự phục vụ (self-service) cho nhân viên trên mobile và cổng quản trị cho HR. Hệ thống là bản tùy biến sâu của nền tảng mã nguồn mở **Horilla**.

- **`[RI]`** HNH Travel: ~360 nhân viên, doanh nghiệp du lịch, thêm module đặc thù (tour, cấp bậc nội bộ, ca 24h ALD26).
- **`[Adopter]`** Ngân hàng (TMO HRM): quy mô lớn hơn, ràng buộc tuân thủ ngân hàng (phân tách nhiệm vụ, audit chặt, KYC nội bộ), thường tích hợp Core-HR/AD doanh nghiệp; bỏ module tour, thay cấp bậc theo ngạch/bậc ngân hàng.

### 1.2 Phạm vi hệ thống
Hệ thống có **4 mặt tiếp xúc (surfaces)**:

| Surface | Mô tả | Người dùng chính |
|---------|-------|------------------|
| **Web Admin** (server-rendered) | Cấu hình tổ chức, phân quyền, nghiệp vụ HR nâng cao | HR / Admin hệ thống |
| **PWA mobile-first** (self-service) | Chấm công, xin nghỉ, xem lương/lịch, thông báo, phê duyệt | Nhân viên, Quản lý |
| **SSO tập trung** (OIDC) | Đăng nhập một lần, liên kết IdP doanh nghiệp | Toàn bộ người dùng |
| **API M2M** | Trao đổi dữ liệu với hệ thống ngoài (máy chấm công, ERP, Core-HR, app nội bộ) | Hệ thống ngoài |

**Ngoài phạm vi** (out of scope): kế toán tổng hợp, ERP tài chính, quản lý khách hàng — hệ thống *tích hợp* với các hệ này qua API chứ không thay thế.

### 1.3 Đối tượng & vai trò (Stakeholders / Actors)

| Vai trò | Trách nhiệm | Kênh chính |
|---------|-------------|-----------|
| **Nhân viên (Employee)** | Chấm công, xin nghỉ, xem lương/lịch, nhận thông báo, cập nhật hồ sơ | PWA |
| **Quản lý trực tiếp (Reporting Manager)** | Duyệt nghỉ phép / chấm công / OT / chi phí của cấp dưới | PWA |
| **C&B (Compensation & Benefits)** | Lương/hợp đồng, duyệt phép cố định, onboard, quản lý tài khoản SSO | PWA + Web |
| **HR / Admin hệ thống** | Cấu hình tổ chức, phân quyền, danh mục nghiệp vụ | Web Admin |
| **Ban lãnh đạo (Executive)** | Báo cáo, dashboard, phê duyệt cấp cao | PWA + Web |
| **Hệ thống ngoài (M2M service)** | Máy chấm công, ERP, Core-HR, app nội bộ | API M2M |

> **`[Adopter]` Ngân hàng** thường bổ sung vai trò **Compliance/Kiểm soát nội bộ** (chỉ đọc, audit) và **HRBP** (HR Business Partner theo khối). Model phân quyền theo nhóm (§FR-1) đủ linh hoạt để thêm vai trò mà không đổi kiến trúc.

### 1.4 Định nghĩa & viết tắt
- **SSO / OIDC**: Single Sign-On qua OpenID Connect.
- **IdP**: Identity Provider (Keycloak trong RI; có thể liên kết Azure AD / Microsoft 365 / AD FS).
- **PWA**: Progressive Web App. **BFF**: Backend-for-Frontend.
- **M2M**: Machine-to-Machine (service-to-service).
- **Geofence**: vùng địa lý hợp lệ để chấm công.
- **NFR**: Non-Functional Requirement. **RI**: Reference Implementation. **Adopter**: tổ chức áp dụng lại.
- **`[RI]`** **ALD26**: mô hình ca 24h chung toàn công ty (00:00–23:58), tính công theo span lượt-đầu→lượt-cuối; trễ/sớm theo *giờ lõi* (core time) tách khỏi khung ca.
- **`[RI]`** **NCO**: lượt chấm chỉ có vào, chưa có ra (No-Clock-Out).
- **`[RI]`** **G / H**: G = lương cơ bản đóng bảo hiểm; H = tổng thu nhập gộp (gross) trước thuế.

---

## 2. Mô tả tổng quan

### 2.1 Bối cảnh sản phẩm
Kiến trúc **monolith Django + PWA tách rời**, đứng sau reverse proxy, xác thực tập trung qua IdP (OIDC). Dữ liệu quan hệ (PostgreSQL), cache/queue (Redis), triển khai container (Docker Compose) trên ≥2 môi trường (production + staging). Chi tiết: [TDD.md](./TDD.md).

Hệ thống gồm **39 Django apps** (module hóa theo nghiệp vụ), **~81 màn hình PWA**, **16 nhóm API**. Kiến trúc module cho phép **bật/tắt từng nghiệp vụ** theo tổ chức.

### 2.2 Ràng buộc (Constraints)
| Loại | RI (HNH Travel) | `[Adopter]` (ngân hàng) |
|------|-----------------|--------------------------|
| Ngôn ngữ / múi giờ | Tiếng Việt, UTC+7 | Đa ngôn ngữ nếu cần; giữ UTC+7 |
| Xác thực | SSO-only (local login tắt) | SSO-only, liên kết AD doanh nghiệp; MFA bắt buộc |
| Chấm công | Bắt buộc điện thoại có camera + GPS; chặn desktop | Có thể ưu tiên máy chấm công/thẻ + camera; geofence quanh chi nhánh |
| Tuân thủ | Luật Lao động VN (BHXH/BHYT/BHTN, thuế TNCN lũy tiến) | Luật LĐ VN + quy định nội bộ ngân hàng (phân tách nhiệm vụ, lưu vết audit, bảo mật dữ liệu) |
| Thương hiệu | White-label HNH (đỏ #c0222b) | White-label theo brand ngân hàng |

### 2.3 Giả định & phụ thuộc
- Mọi người dùng có danh tính trên IdP (tạo trực tiếp hoặc federated từ AD doanh nghiệp).
- Nhân viên self-service dùng smartphone (GPS + camera) — hoặc thiết bị chấm công tại chi nhánh.
- Máy chấm công vật lý (nếu có) đẩy dữ liệu qua agent/M2M.
- **Không tự tạo user khi đăng nhập** — tài khoản phải được cấp trước (nguyên tắc bảo mật).

---

## 3. Yêu cầu chức năng (Functional Requirements)

> Mỗi FR là một **năng lực (capability)**. FRD.md đặc tả chi tiết luồng/rule; TDD.md ánh xạ sang module/model/endpoint.

### FR-1 — Xác thực & Phân quyền (Identity & Access)
- **FR-1.1** Đăng nhập qua SSO/OIDC (PKCE); hỗ trợ gợi ý IdP (kc_idp_hint) để liên kết identity doanh nghiệp (Microsoft 365 / Azure AD `[RI]`).
- **FR-1.2** Map identity IdP → user hệ thống theo thứ tự xác định (email→email, email→username, preferred_username→username).
- **FR-1.3** **Không tự tạo user** khi login; identity không khớp → trang đăng ký/khoá, không cấp quyền.
- **FR-1.4** Phân quyền theo **Groups + Permissions** (RBAC) + nhóm nghiệp vụ đặc thù (C&B, admin).
- **FR-1.5** Quản trị vòng đời tài khoản đồng bộ giữa HRM và IdP: tạo, đổi email/username (preview → apply, phát hiện rename / link tài khoản federated có sẵn / tạo mới), reset mật khẩu, vô hiệu hóa; **tạo hàng loạt** theo phòng ban.
- **FR-1.6** Ghi mốc & lịch sử thao tác nhạy cảm (reset mật khẩu, đổi định danh) phục vụ audit.

> **`[Adopter]` ngân hàng:** thay Keycloak-federation bằng Azure AD/AD FS; bật **MFA** ở IdP; thêm **phân tách nhiệm vụ** (người tạo tài khoản ≠ người duyệt quyền). Kiến trúc backend `[map claims → user]` không đổi.

### FR-2 — Quản lý Nhân viên & Tổ chức
- **FR-2.1** Hồ sơ nhân viên: thông tin cá nhân, công việc (phòng ban / vị trí / vai trò / quản lý trực tiếp / ca), ngân hàng.
- **FR-2.2** Hồ sơ mở rộng theo tổ chức (giấy tờ tùy thân, bảo hiểm, thuế, hộ khẩu, chứng chỉ). **`[RI]`** CCCD/BHXH/MST VN.
- **FR-2.3** **Cấp bậc nội bộ (Work Level / Grade)** kèm quyền lợi theo cấp (nghỉ phép thêm, bảo hiểm, WFH, phụ cấp). **`[RI]`** 8 cấp; **`[Adopter]`** ngân hàng dùng ngạch/bậc riêng.
- **FR-2.4** **Onboarding trọn gói atomic**: tạo Employee + WorkInfo + nhóm quyền + tài khoản SSO trong một giao dịch; hỗ trợ quét giấy tờ (OCR CCCD `[RI]`).
- **FR-2.5** Danh bạ nhân viên, sơ đồ tổ chức, tìm kiếm/lọc theo công ty/phòng ban.
- **FR-2.6** Phân biệt rõ trạng thái khi onboard: **email đã tồn tại** vs **nhân viên bị vô hiệu hóa**.
- **FR-2.7** Đa công ty (multi-company) trong một tổ chức: dữ liệu tách theo công ty, lọc xuyên suốt.

### FR-3 — Chấm công (Attendance)
- **FR-3.1** Chấm công vào/ra qua PWA: bắt buộc **ảnh camera** + **toạ độ GPS**; **`[RI]`** chặn thiết bị desktop/laptop (403).
- **FR-3.2** Kiểm tra **geofence** theo địa điểm gần nhất; ngoài vùng → đánh dấu `geo_valid=false` (**không chặn** chấm), yêu cầu chọn lý do làm từ xa.
- **FR-3.3** Nhận lượt chấm từ **máy chấm công vật lý** qua M2M, chống trùng với app (cửa sổ khử trùng, vd 120s).
- **FR-3.4** **Import chấm công từ Excel** (mã NV, ngày, giờ vào/ra), match theo mã, bỏ ngày vắng, chống trùng.
- **FR-3.5** Tính công ngày theo mô hình ca cấu hình được: ca span 24h `[RI ALD26]`, ca một chiều (one-way), ca thường (vào–ra trừ nghỉ trưa).
- **FR-3.6** Tính **đi trễ / về sớm** theo **giờ lõi (core time)** của ca, tách khỏi khung ca.
- **FR-3.7** Yêu cầu **điều chỉnh chấm công**, **OT**, **khai báo/duyệt lượt thiếu ra (NCO)**; quản lý duyệt.
- **FR-3.8** **Xuất bảng chấm công tháng** (Excel + preview): lọc công ty/phòng/từ khóa + khoảng ngày trong tháng, **phân trang**.
- **FR-3.9** **Tự động chấm ra (auto clock-out)** khi nhân viên quên; ghi nhật ký chẩn đoán (device/UA/lý do chặn).
- **FR-3.10** **Timeline 24h cá nhân**: hiển thị lượt chấm + lịch (nội bộ / Outlook đã sync) theo từng khung giờ; tổng quan hoạt động chấm công theo lưới giờ.

### FR-4 — Nghỉ phép (Leave)
- **FR-4.1** Danh mục loại nghỉ cấu hình được theo luật + đặc thù tổ chức. **`[RI]`** 8 loại theo Luật LĐ VN (phép năm, ốm, thai sản, kết hôn, tang, **nghỉ bù Tour/Lễ**, không lương, chăm con ốm).
- **FR-4.2** Tạo đơn nghỉ **theo ngày** (Sáng/Chiều/Cả ngày, nhiều ngày rời) hoặc **theo giờ**; kiểm tra số dư phép.
- **FR-4.3** **Người duyệt**: mặc định quản lý trực tiếp; chọn thêm qua modal lọc công ty/phòng.
- **FR-4.4** **Người duyệt cố định** (theo công ty/phòng ban, có mặc định toàn cục) luôn được **pin** vào Người duyệt + Người theo dõi, **không bỏ chọn được** (enforce server-side). **`[RI]`** = C&B.
- **FR-4.5** Nhiều người duyệt — **chỉ cần 1 người duyệt** là đơn hợp lệ; người không thẩm quyền không duyệt được.
- **FR-4.6** **Người theo dõi (watcher)** lưu DB + nhận thông báo khi tạo/duyệt/từ chối; xem "Đang theo dõi".
- **FR-4.7** Nhân viên **sửa/xóa đơn của mình khi còn chờ duyệt**.
- **FR-4.8** Bộ phận duyệt xem **danh sách đơn chờ duyệt toàn tổ chức**, duyệt/từ chối tại chỗ; hủy đơn đã duyệt (có lý do).
- **FR-4.9** **Nghỉ bù/phép bù**: quản lý đề xuất → bộ phận duyệt; cộng vào số dư.
- **FR-4.10** Cấp phát phép (allocation), carryforward, reset theo năm; **import số dư từ Excel**; tổng quan phép tháng (lưới Gantt) với chi tiết từng đơn.

### FR-5 — Hợp đồng & Lương (Payroll)
- **FR-5.1** Nhiều **loại hợp đồng** kế thừa một khung chung (base). **`[RI]`** 3 loại: Thử việc / Chính thức / Hiệu suất.
- **FR-5.2** **Công thức thu nhập** cấu hình theo loại hợp đồng (lương cơ bản đóng bảo hiểm vs tổng gross). **`[RI]`** G/H theo loại HĐ.
- **FR-5.3** **Phụ lục KPI**: khoảng thu nhập năm + tỷ lệ thưởng theo % KPI.
- **FR-5.4** **Bảng lương tháng** (1 dòng/NV/tháng): generate stub lọc công ty/phòng/loại HĐ; HR nhập ngày công, ca đêm, OT, KPI%, thưởng, tạm ứng.
- **FR-5.5** Tính tự động: lương thực nhận, quỹ hiệu suất, OT, KPI, gross thực tế, **các khoản bảo hiểm có trần**, **thuế thu nhập cá nhân lũy tiến**, giảm trừ người phụ thuộc, thực lĩnh. Công thức **đồng bộ server + realtime UI**.
- **FR-5.6** Kiểm tra tình trạng hợp đồng: lương=0, hết hạn, thử việc quá hạn, trùng HĐ đang hiệu lực.
- **FR-5.7** **Phiếu lương (payslip)** cho nhân viên xem trên PWA; gửi email; vay lương; hoàn chi.

> **`[Adopter]` ngân hàng:** thay công thức G/H và bậc thuế bằng chính sách lương ngân hàng (ngạch/bậc, phụ cấp chức vụ, thưởng KPI theo khối). Khung `ContractBase` + bảng lương tháng cấu hình được giữ nguyên.

### FR-6 — Chi phí, Tài sản, Đào tạo, Hiệu suất, Tuyển dụng
- **FR-6.1** **Chi phí (Expenses)**: nộp hóa đơn → duyệt quản lý → xác nhận hành chính → batch xử lý.
- **FR-6.2** **Tài sản (Asset)**: cấp phát, đề xuất, thu hồi, báo cáo.
- **FR-6.3** **Đào tạo (Training)**, **Đánh giá hiệu suất (PMS: mục tiêu/KPI)**, **Thăng chức (Promotion multi-level)**, **Tuyển dụng (Recruitment)**, **Offboarding**.
- **FR-6.4** **Dự án & công việc (Project/Task)**: giao việc, theo dõi tiến độ, lồng vào lịch ngày cá nhân.

### FR-7 — Thông báo & Truyền thông
- **FR-7.1** Thông báo trong app + **Web Push** (VAPID), polling định kỳ, âm thanh + app badge.
- **FR-7.2** **Bảng tin nội bộ (Announcement)**: tạo/gửi/lịch sử, ghim (pinned), like, feedback; feed công ty.

### FR-8 — Quản trị, Tích hợp & Vận hành
- **FR-8.1** Quản lý danh mục: công ty/phòng ban/vị trí/ca/loại nghỉ/loại công.
- **FR-8.2** Quản lý vai trò & nhóm quyền; đồng bộ role/user với IdP.
- **FR-8.3** Quản lý **service account M2M** (token, scope, IP allowlist); cấu hình tích hợp ngoài.
- **FR-8.4** **Giám sát hệ thống** (health log: replication primary↔standby, tuổi backup).
- **FR-8.5** Đồng bộ dữ liệu **primary → standby → staging** (mirror dữ liệu cho môi trường test).
- **FR-8.6** **Lịch tổng hợp**: hợp nhất nghỉ phép + ngày lễ + sự kiện + **lịch Outlook (Microsoft Graph)**; feed .ics; kết nối/hủy kết nối Outlook per-user.
- **FR-8.7** **Embed/SSO handoff** cho app nội bộ (M2M ticket + embed session).

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)

| Mã | Loại | Yêu cầu |
|----|------|---------|
| **NFR-1** | Bảo mật | SSO-only qua OIDC (RS256, clock skew ~5'); M2M **3 lớp** (IP CIDR + token băm SHA256 + scope `resource:action`); secrets qua biến môi trường, không hardcode; chấm công bắt buộc camera. **`[Adopter]`** bổ sung MFA, phân tách nhiệm vụ, mã hóa dữ liệu nhạy cảm at-rest |
| **NFR-2** | Hiệu năng | API list dùng `annotate()` tránh N+1; phân trang dữ liệu lớn; **`[RI]`** tải nhẹ (~12 lượt chấm/phút đỉnh, web CPU <15%). **`[Adopter]`** ngân hàng: benchmark theo quy mô thật, scale web ngang |
| **NFR-3** | Sẵn sàng (Availability) | Multi-container; standby replica; backup định kỳ (DB + IdP); giám sát replication |
| **NFR-4** | Trải nghiệm (UX) | PWA mobile-first, safe-area aware, offline-ready (service worker), pull-to-refresh, install banner iOS/Android |
| **NFR-5** | Bản địa hóa | **`[RI]`** Tiếng Việt (~4500 entries dịch), UTC+7, định dạng ngày/tiền VN |
| **NFR-6** | Tương thích | PWA iOS Safari + Android Chrome; tối ưu RAM camera (ảnh ≤720px) tránh iOS reload |
| **NFR-7** | Tuân thủ | **`[RI]`** Luật LĐ VN (bảo hiểm có trần, thuế TNCN lũy tiến, giảm trừ). **`[Adopter]`** + quy định nội bộ ngành |
| **NFR-8** | Vận hành | Deploy git pull + docker build (prod/stage); test migration trên stage trước prod; log chẩn đoán grep được |
| **NFR-9** | Toàn vẹn dữ liệu | Thao tác đa bước **atomic** (onboard, tạo đơn, bảng lương); guard chống trùng/chấm lặp |
| **NFR-10** | Kiểm toán (Auditability) | Ghi lịch sử thay đổi (audit log) cho thao tác nhạy cảm. **`[Adopter]`** ngân hàng: bắt buộc, giữ log bất biến, truy vết đủ ai-làm-gì-khi-nào |

---

## 5. Giao diện ngoài (External Interfaces)

| Hệ thống | Mục đích | Cơ chế | RI / Adopter |
|----------|----------|--------|--------------|
| **IdP (Keycloak)** | SSO OIDC + quản trị user/role | OIDC + Admin REST | RI: Keycloak; **`[Adopter]`** Azure AD/AD FS |
| **Microsoft 365 / Azure AD** | Federated identity, lịch Outlook | IdP federation + Microsoft Graph | Chung |
| **Máy chấm công** | Đẩy lượt chấm vật lý | M2M token + scope `attendance:write` | RI: Ronald Jack/Dahua; **`[Adopter]`** thiết bị chi nhánh |
| **SMTP** | Email welcome, reset, bảng lương | Cấu hình email động | Chung |
| **Geofencing** | Kiểm tra vị trí chấm công | check_geofence(lat/lng/radius) | Chung |
| **Web Push (VAPID)** | Thông báo đẩy | Push subscription | Chung |
| **App nội bộ** | Embed/SSO handoff | M2M + embed session | **`[RI]`** EOffice, 1StopShop, Arkon, IAM; **`[Adopter]`** app ngân hàng |
| **Core-HR / ERP** | Đồng bộ nhân sự/lương | M2M API | **`[Adopter]`** ngân hàng thường bắt buộc |

---

## 6. Danh mục năng lực theo module (Capability Inventory)

> Ánh xạ nhanh **năng lực → module** (chi tiết model/endpoint ở TDD §3–4). Cột "Bật cho Adopter?" gợi ý một ngân hàng nên giữ/bỏ.

| Nhóm | Module (Django app) | Năng lực | Giữ cho ngân hàng? |
|------|---------------------|----------|--------------------|
| Core | `base`, `employee`, `horilla_api` | Tổ chức, hồ sơ, API, phân quyền | ✅ Bắt buộc |
| Auth | (Keycloak) `outlook_auth` | SSO, federation, lịch Outlook | ✅ (đổi IdP) |
| Chấm công | `attendance`, `biometric`, `geofencing`, `facedetection` | Clock, geofence, máy chấm công, nhận diện | ✅ |
| Nghỉ phép | `leave` | Đơn nghỉ, duyệt, phép bù, tổng quan | ✅ |
| Lương | `payroll` | Hợp đồng, bảng lương, payslip, thuế | ✅ (đổi công thức) |
| Nghiệp vụ HR | `recruitment`, `onboarding`, `offboarding`, `pms`, `promotion`, `training` | Tuyển → nghỉ việc, đánh giá, thăng chức | ✅ tùy chọn |
| Vận hành | `asset`, `expenses`, `helpdesk`, `project` | Tài sản, chi phí, ticket, dự án | ✅ tùy chọn |
| Truyền thông | `notifications`, `whatsapp` | Thông báo, web push, bảng tin | ✅ |
| Tích hợp | `eoffice`, `horilla_meet` | Embed app, họp | Tùy |
| Nền tảng | `horilla_audit`, `horilla_backup`, `pg_backup`, `horilla_automations`, `horilla_documents`, `report`, `dynamic_fields` | Audit, backup, tự động hóa, tài liệu, báo cáo, field động | ✅ (audit bắt buộc) |
| **`[RI]` đặc thù** | `tourism`, `wc2026` | Module tour du lịch, gamification World Cup | ❌ Bỏ cho ngân hàng |

---

## 7. Truy vết & Ưu tiên (Traceability & Priority)

- **P0 (vận hành production `[RI]`)**: Chấm công, Nghỉ phép, Lương, SSO, Hồ sơ/Onboarding.
- **P1**: Chi phí, Tài sản, PMS, Đào tạo, Thăng chức, Tuyển dụng, Lịch tổng hợp, Thông báo.
- **P2 (tùy chọn / feature flag)**: gamification, tích hợp app ngoài đặc thù, module ngành.

Ánh xạ FR → thiết kế/endpoint/model: [TDD.md](./TDD.md). Đặc tả chức năng: [FRD.md](./FRD.md). Bối cảnh & giá trị kinh doanh: [BRD.md](./BRD.md).

---

## 8. Hướng dẫn tái sử dụng cho tổ chức mới (Adopter Playbook)

Để dẫn xuất SRS cho **TMO HRM (ngân hàng)** từ tài liệu này:

1. **Giữ nguyên** FR-1..FR-8 ở mức năng lực — đây là xương sống HRM.
2. **Thay phần `[RI]`**: bỏ `tourism`/`wc2026`; đổi cấp bậc (FR-2.3), công thức lương & thuế (FR-5), loại nghỉ (FR-4.1), branding (NFR-4/5).
3. **Nâng NFR bảo mật/audit**: bật MFA (NFR-1), phân tách nhiệm vụ, audit bất biến (NFR-10) — bắt buộc với ngân hàng.
4. **Thêm tích hợp Core-HR/AD** (mục 5): đồng bộ nhân sự 2 chiều, federation AD.
5. **Xác định lại quy mô** (NFR-2/3): benchmark, HA, DR theo yêu cầu ngân hàng.
6. Dùng SRS mới này làm đầu vào cho BRD/FRD/TDD của ngân hàng (cùng cấu trúc các file trong `docs/`).

> Tài liệu phản ánh codebase branch `horilla_aqv10` tại 2026-07-12. Chi tiết công thức/endpoint cần đối chiếu mã nguồn khi triển khai thay đổi.

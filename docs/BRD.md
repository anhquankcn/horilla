# Business Requirements Document (BRD)
## HRM Platform — Portable Business Model

| | |
|---|---|
| Phiên bản | 1.0 (portable) |
| Ngày | 2026-07-12 |
| Baseline | [SRS.md](./SRS.md) (yêu cầu hệ thống), [FRD.md](./FRD.md) (chức năng), [TDD.md](./TDD.md) (kỹ thuật) |
| Reference Implementation (RI) | HNH Travel — HRM production |
| Mục đích | Mô tả **bối cảnh, mục tiêu, giá trị kinh doanh** của hệ thống HRM; đầu vào cho quyết định đầu tư & phạm vi |

> BRD trả lời **"tại sao"** và **"đạt được gì"**; SRS/FRD trả lời **"làm gì"**; TDD trả lời **"làm thế nào"**. Chi tiết gắn doanh nghiệp tham chiếu đánh dấu **`[RI]`**; gợi ý cho tổ chức khác (vd ngân hàng) đánh dấu **`[Adopter]`**.

---

## 1. Tóm tắt điều hành (Executive Summary)

Hệ thống HRM số hóa toàn bộ vòng đời nhân sự trên **một nền tảng thống nhất**: từ tuyển dụng, onboarding, chấm công, nghỉ phép, lương thưởng, đến đánh giá hiệu suất và nghỉ việc. Điểm khác biệt so với HRM truyền thống:

- **Self-service mobile-first**: nhân viên chấm công GPS + camera, xin nghỉ, xem lương ngay trên điện thoại (PWA), không cần app store.
- **SSO doanh nghiệp**: một danh tính duy nhất, liên kết hệ identity sẵn có (Microsoft 365 / AD).
- **Tự động hóa nghiệp vụ đặc thù**: quy đổi công theo ca linh hoạt, duyệt phép đa cấp, tính lương & thuế theo luật, đồng bộ máy chấm công.
- **Tuân thủ luật lao động** tích hợp sẵn (bảo hiểm, thuế thu nhập cá nhân).

**`[RI]`** HNH Travel vận hành production cho ~360 nhân viên (qlns.hnhtravel.work), thay thế chấm công thủ công + bảng lương Excel rời rạc bằng một hệ thống liền mạch.

---

## 2. Bối cảnh & Vấn đề kinh doanh (Problem Statement)

| Vấn đề trước khi có hệ thống | Hệ quả | Năng lực giải quyết |
|------------------------------|--------|---------------------|
| Chấm công thủ công / máy rời, dễ gian lận, khó đối soát | Sai công, tranh chấp lương, tốn giờ HR | Chấm công GPS + ảnh selfie + geofence, đối soát tự động (FR-3) |
| Xin nghỉ qua giấy/chat, thất lạc, không rõ ai duyệt | Chậm trễ, thiếu minh bạch số dư phép | Đơn nghỉ số hóa, duyệt đa cấp, người theo dõi (FR-4) |
| Bảng lương Excel rời, công thức không đồng nhất | Sai số, khó kiểm toán, rủi ro tuân thủ thuế | Bảng lương tháng chuẩn hóa, thuế/bảo hiểm tự động (FR-5) |
| Nhiều tài khoản đăng nhập cho nhiều app nội bộ | Rủi ro bảo mật, khó offboard | SSO tập trung + quản lý vòng đời tài khoản (FR-1) |
| Dữ liệu nhân sự phân mảnh | Không có nguồn sự thật duy nhất | Hồ sơ nhân viên hợp nhất + API tích hợp (FR-2, FR-8) |

> **`[Adopter]` ngân hàng (TMO HRM):** thêm áp lực **tuân thủ & kiểm soát nội bộ** — mọi thao tác nhân sự/lương phải có dấu vết audit, phân tách nhiệm vụ, và thường phải đồng bộ với Core-HR/AD doanh nghiệp. Bài toán "nguồn sự thật duy nhất + audit" là động lực chính.

---

## 3. Tầm nhìn & Mục tiêu kinh doanh (Vision & Goals)

**Tầm nhìn:** một nền tảng HRM tự phục vụ, tuân thủ, và tích hợp — nơi mọi nghiệp vụ nhân sự diễn ra minh bạch, tự động, và truy vết được.

| Mục tiêu (Goal) | Kết quả kỳ vọng | Chỉ số đo (KPI) |
|-----------------|-----------------|-----------------|
| **G1 — Số hóa chấm công** | Loại bỏ chấm công thủ công | % lượt chấm qua hệ thống; thời gian đối soát/tháng |
| **G2 — Rút ngắn phê duyệt** | Duyệt nghỉ/OT/chi phí nhanh, minh bạch | Thời gian duyệt trung bình; % đơn quá hạn |
| **G3 — Chính xác lương & tuân thủ** | Lương đúng, thuế/bảo hiểm đúng luật | Số lỗi bảng lương/tháng; sự cố tuân thủ |
| **G4 — Bảo mật truy cập** | SSO, offboard tức thì, ít bề mặt tấn công | % tài khoản qua SSO; thời gian thu hồi quyền |
| **G5 — Trải nghiệm nhân viên** | Tự phục vụ, giảm ticket HR | Tỷ lệ dùng self-service; NPS nội bộ |
| **G6 — Nguồn dữ liệu duy nhất** | Tích hợp thay vì nhập trùng | Số hệ tích hợp; % dữ liệu đồng bộ tự động |

---

## 4. Phạm vi kinh doanh (Business Scope)

### 4.1 Trong phạm vi
Toàn bộ vòng đời nhân sự (Hire-to-Retire): tuyển dụng, onboarding, hồ sơ, chấm công, nghỉ phép, hợp đồng & lương, chi phí, tài sản, đào tạo, hiệu suất, thăng chức, offboarding; cổng self-service + quản trị; SSO; tích hợp máy chấm công & app nội bộ; báo cáo & giám sát.

### 4.2 Ngoài phạm vi
Kế toán tổng hợp, ERP tài chính, CRM, quản lý kho hàng hóa. Hệ thống **tích hợp** với các hệ này qua API, không thay thế.

### 4.3 Phạm vi theo tổ chức
| | `[RI]` HNH Travel | `[Adopter]` Ngân hàng (TMO HRM) |
|---|-------------------|-------------------------------|
| Quy mô | ~360 NV, đa công ty (du lịch) | Lớn hơn, nhiều khối/chi nhánh |
| Module đặc thù giữ | tour, cấp bậc nội bộ, ca 24h | ngạch/bậc ngân hàng, ca chi nhánh |
| Module bỏ | — | tour, gamification |
| Tuân thủ | Luật LĐ VN | Luật LĐ VN + quy định ngân hàng |
| Tích hợp bắt buộc | máy chấm công, app nội bộ | + Core-HR/AD doanh nghiệp |

---

## 5. Quy trình nghiệp vụ chính (Key Business Processes)

> Mô tả mức nghiệp vụ; luồng chi tiết + rule ở [FRD.md](./FRD.md).

**BP-1 — Hire to Onboard.** Tuyển dụng → chọn ứng viên → onboarding trọn gói (tạo hồ sơ + tài khoản SSO + phân quyền atomic) → nhân viên đăng nhập self-service.

**BP-2 — Daily Attendance.** Nhân viên chấm công (GPS + ảnh) hoặc máy chấm công → hệ thống quy đổi công theo ca → phát hiện trễ/sớm/thiếu lượt → HR đối soát → dữ liệu vào bảng lương.

**BP-3 — Leave Request to Approval.** Nhân viên xin nghỉ → hệ thống kiểm tra số dư → định tuyến người duyệt (quản lý + bộ phận cố định) → duyệt (chỉ cần 1) → trừ phép + thông báo các bên → cập nhật lịch.

**BP-4 — Monthly Payroll.** HR generate bảng lương tháng → nhập biến động (công, OT, KPI, thưởng, tạm ứng) → hệ thống tính gross → bảo hiểm → thuế → thực lĩnh → phát hành payslip.

**BP-5 — Expense & Asset.** Nộp chi phí/đề xuất tài sản → duyệt quản lý → xác nhận hành chính → cấp phát/thanh toán → thu hồi khi offboard.

**BP-6 — Performance & Promotion.** Đặt mục tiêu/KPI → đánh giá định kỳ → đề xuất thăng chức đa cấp → cập nhật cấp bậc/lương.

**BP-7 — Offboard.** Khởi tạo nghỉ việc → thu hồi tài sản + quyền truy cập (SSO) → chốt lương/phép → lưu trữ hồ sơ.

**BP-8 — Access Lifecycle.** Cấp/đổi/reset/thu hồi tài khoản SSO đồng bộ HRM ↔ IdP; audit mọi thao tác.

---

## 6. Giá trị & Lợi ích (Business Value)

| Bên hưởng lợi | Giá trị |
|---------------|---------|
| **Nhân viên** | Tự phục vụ mọi lúc trên điện thoại; minh bạch công/phép/lương; ít thủ tục giấy |
| **Quản lý** | Duyệt nhanh trên mobile; nhìn thấy đội nhóm theo thời gian thực |
| **HR / C&B** | Giảm thao tác thủ công, chuẩn hóa lương/thuế, đối soát tự động |
| **Lãnh đạo** | Dashboard, báo cáo, kiểm soát tuân thủ |
| **CNTT / Bảo mật** | SSO tập trung, offboard tức thì, audit, tích hợp API chuẩn |
| **Tổ chức** | Nguồn dữ liệu nhân sự duy nhất, giảm rủi ro tuân thủ, dữ liệu ra quyết định |

---

## 7. Giả định, Ràng buộc & Rủi ro

**Giả định:** người dùng có smartphone (GPS + camera) hoặc thiết bị chấm công tại chỗ; có hệ IdP; kết nối mạng ổn định tại điểm chấm công.

**Ràng buộc:** tuân thủ luật lao động sở tại; SSO-only (không login local); dữ liệu nhân sự nhạy cảm cần bảo vệ.

**Rủi ro & giảm thiểu:**
| Rủi ro | Giảm thiểu |
|--------|-----------|
| Gian lận chấm công (hộ, giả vị trí) | Bắt buộc ảnh selfie + geofence + log thiết bị/UA; nhận diện khuôn mặt (tùy chọn) |
| Sai lương/thuế | Công thức chuẩn hóa đồng bộ server/UI; kiểm tra tình trạng HĐ; test trên stage |
| Lộ dữ liệu nhạy cảm | Secrets qua env; SSO + (MFA `[Adopter]`); audit; mã hóa dữ liệu nhạy cảm |
| Phụ thuộc IdP | Backup IdP định kỳ; giám sát; DR |
| **`[Adopter]`** không đạt chuẩn ngân hàng | Bổ sung MFA, phân tách nhiệm vụ, audit bất biến, DR/HA ngay từ thiết kế |

---

## 8. Tiêu chí thành công (Success Criteria)

- **Vận hành**: hệ thống chạy ổn định production; chấm công/nghỉ phép/lương thực hiện end-to-end không cần thao tác Excel thủ công.
- **Áp dụng (Adoption)**: đa số nhân viên dùng self-service; giảm ticket HR.
- **Tuân thủ**: lương/thuế/bảo hiểm đúng luật; có dấu vết audit đầy đủ.
- **Bảo mật**: 100% truy cập qua SSO; thu hồi quyền tức thì khi offboard.
- **`[RI]` bằng chứng**: HNH Travel đã đạt các tiêu chí trên ở môi trường production.

---

## 9. Lộ trình & Ưu tiên (Roadmap)

| Giai đoạn | Nội dung | Ưu tiên |
|-----------|----------|---------|
| **Phase 0 — Nền tảng** | SSO, hồ sơ/onboarding, phân quyền, hạ tầng | P0 |
| **Phase 1 — Lõi vận hành** | Chấm công, nghỉ phép, lương | P0 |
| **Phase 2 — Nghiệp vụ HR** | Chi phí, tài sản, PMS, đào tạo, thăng chức, tuyển dụng | P1 |
| **Phase 3 — Tích hợp & Trải nghiệm** | Lịch tổng hợp (Outlook), thông báo, embed app nội bộ, báo cáo | P1 |
| **Phase 4 — Đặc thù ngành** | Module riêng theo tổ chức | P2 |

> **`[Adopter]` ngân hàng:** đưa **audit + MFA + tích hợp Core-HR/AD** lên Phase 0 (bắt buộc trước khi vận hành thật).

---

## 10. Chuyển giao cho tổ chức mới (Adopter Handoff)

BRD này + [SRS.md](./SRS.md) là đủ để một Claude/đội dự án khác viết lại BRD/FRD cho HRM subsystem của tổ chức mình:
1. Giữ khung mục tiêu G1–G6, quy trình BP-1..BP-8 (xương sống HRM).
2. Thay số liệu/quy mô/module `[RI]` bằng bối cảnh tổ chức mới.
3. Nâng mục 7 (rủi ro) + mục 8 (tiêu chí) theo yêu cầu ngành (ngân hàng: tuân thủ & audit là tiêu chí cứng).
4. Đối chiếu năng lực chi tiết trong SRS §6 (Capability Inventory) để quyết định giữ/bỏ module.

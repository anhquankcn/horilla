# Business Requirements Document (BRD)
## Horilla HRM — Công ty Du lịch Hồng Ngọc Hà (HNH Travel)

| | |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 2026-07-12 |
| Baseline | [SRS.md](./SRS.md) (yêu cầu hệ thống), [FRD.md](./FRD.md) (chức năng), [TDD.md](./TDD.md) (kỹ thuật) |
| Trạng thái | Hệ thống vận hành production (qlns.hnhtravel.work) |

> BRD trả lời **"tại sao"** và **"đạt được gì"**; SRS/FRD trả lời **"làm gì"**; TDD trả lời **"làm thế nào"**.

---

## 1. Tóm tắt điều hành

Hệ thống HRM số hóa toàn bộ vòng đời nhân sự của HNH Travel (~360 nhân viên) trên **một nền tảng thống nhất**: tuyển dụng → onboarding → chấm công → nghỉ phép → lương thưởng → hiệu suất → offboarding, kèm cổng tự phục vụ (self-service) trên điện thoại (PWA) và cổng quản trị cho HR. Hệ thống thay thế chấm công thủ công + bảng lương Excel rời rạc bằng một quy trình liền mạch, minh bạch, tuân thủ Luật Lao động VN.

Điểm khác biệt:
- **Self-service mobile-first**: chấm công GPS + ảnh selfie, xin nghỉ, xem lương ngay trên điện thoại — không cần app store (PWA).
- **SSO tập trung** qua Keycloak, liên kết Microsoft 365 — một danh tính duy nhất cho mọi app nội bộ.
- **Tự động hóa đặc thù du lịch**: ca 24h ALD26, nghỉ bù Tour/Lễ, cấp bậc nội bộ, tính lương & thuế theo luật.

---

## 2. Bối cảnh & Vấn đề kinh doanh

| Vấn đề trước khi có hệ thống | Hệ quả | Năng lực giải quyết |
|------------------------------|--------|---------------------|
| Chấm công thủ công / máy rời, dễ gian lận, khó đối soát | Sai công, tranh chấp lương, tốn giờ HR | Chấm công GPS + ảnh selfie + geofence, đối soát tự động (FR-3) |
| Xin nghỉ qua giấy/chat, thất lạc, không rõ ai duyệt | Chậm trễ, thiếu minh bạch số dư phép | Đơn nghỉ số hóa, duyệt đa cấp, người theo dõi, C&B quản lý tập trung (FR-4) |
| Bảng lương Excel rời, công thức không đồng nhất | Sai số, khó kiểm toán, rủi ro tuân thủ thuế | Bảng lương tháng chuẩn hóa, BHXH/thuế TNCN tự động (FR-5) |
| Nhiều tài khoản đăng nhập cho nhiều app nội bộ | Rủi ro bảo mật, khó offboard | SSO tập trung + quản lý vòng đời tài khoản (FR-1) |
| Dữ liệu nhân sự phân mảnh | Không có nguồn sự thật duy nhất | Hồ sơ nhân viên hợp nhất + API tích hợp (FR-2, FR-8) |
| Lịch cá nhân (họp/công việc) tách rời chấm công | Nhân viên khó nắm ngày làm việc | Timeline 24h lồng Outlook + lượt chấm (FR-3.11, FR-8.6) |

---

## 3. Tầm nhìn & Mục tiêu kinh doanh

**Tầm nhìn:** một nền tảng HRM tự phục vụ, tuân thủ, và tích hợp — nơi mọi nghiệp vụ nhân sự diễn ra minh bạch, tự động, và truy vết được.

| Mục tiêu | Kết quả kỳ vọng | Chỉ số đo (KPI) |
|----------|-----------------|-----------------|
| **G1 — Số hóa chấm công** | Loại bỏ chấm công thủ công | % lượt chấm qua hệ thống; thời gian đối soát/tháng |
| **G2 — Rút ngắn phê duyệt** | Duyệt nghỉ/OT/chi phí nhanh, minh bạch | Thời gian duyệt trung bình; % đơn quá hạn |
| **G3 — Chính xác lương & tuân thủ** | Lương đúng, thuế/BHXH đúng luật | Số lỗi bảng lương/tháng; sự cố tuân thủ |
| **G4 — Bảo mật truy cập** | SSO, offboard tức thì | % tài khoản qua SSO; thời gian thu hồi quyền |
| **G5 — Trải nghiệm nhân viên** | Tự phục vụ, giảm ticket HR | Tỷ lệ dùng self-service; phản hồi nội bộ |
| **G6 — Nguồn dữ liệu duy nhất** | Tích hợp thay vì nhập trùng | Số hệ tích hợp; % dữ liệu đồng bộ tự động |

---

## 4. Phạm vi kinh doanh

### 4.1 Trong phạm vi
Toàn bộ vòng đời nhân sự (Hire-to-Retire): tuyển dụng, onboarding, hồ sơ, chấm công, nghỉ phép, hợp đồng & lương, chi phí, tài sản, đào tạo, hiệu suất, thăng chức, offboarding; cổng self-service + quản trị; SSO; lịch tổng hợp; tích hợp máy chấm công & app nội bộ; báo cáo & giám sát.

### 4.2 Ngoài phạm vi
Kế toán tổng hợp, ERP tài chính, CRM, quản lý tour khách hàng. Hệ thống **tích hợp** với các hệ này qua API, không thay thế.

### 4.3 Đặc thù HNH Travel
Doanh nghiệp du lịch, đa công ty (~360 NV): ca làm việc linh hoạt (hướng dẫn viên, lái xe, tour dài ngày) → mô hình ca 24h ALD26; loại nghỉ đặc thù **nghỉ bù Tour/Lễ**; cấp bậc nội bộ 8 cấp; 3 loại hợp đồng (Thử việc / Chính thức / Hiệu suất) với công thức lương riêng.

---

## 5. Quy trình nghiệp vụ chính (Key Business Processes)

> Mô tả mức nghiệp vụ; luồng chi tiết + rule ở [FRD.md](./FRD.md).

**BP-1 — Hire to Onboard.** Tuyển dụng → chọn ứng viên → onboarding trọn gói (tạo hồ sơ + tài khoản SSO + phân quyền atomic, quét CCCD) → nhân viên đăng nhập self-service.

**BP-2 — Daily Attendance.** Nhân viên chấm công (GPS + ảnh) hoặc máy chấm công → hệ thống quy đổi công theo ca (ALD26 span) → phát hiện trễ/sớm/NCO → HR đối soát → dữ liệu vào bảng lương. Nhân viên tự xem timeline 24h (chấm công + lịch).

**BP-3 — Leave Request to Approval.** Nhân viên xin nghỉ → kiểm tra số dư → định tuyến người duyệt (quản lý + C&B cố định) → duyệt (chỉ cần 1) → trừ phép + thông báo watcher → cập nhật lịch. C&B quản lý tập trung đơn chờ duyệt toàn tổ chức.

**BP-4 — Monthly Payroll.** HR generate bảng lương tháng → nhập biến động (công, OT, KPI, thưởng, tạm ứng) → hệ thống tính Gross → BHXH/BHYT/BHTN → thuế TNCN → thực lĩnh → phát hành payslip.

**BP-5 — Expense & Asset.** Nộp chi phí/đề xuất tài sản → duyệt quản lý → xác nhận hành chính → cấp phát/thanh toán → thu hồi khi offboard.

**BP-6 — Performance & Promotion.** Đặt mục tiêu/KPI → đánh giá định kỳ → đề xuất thăng chức đa cấp → cập nhật cấp bậc/lương.

**BP-7 — Offboard.** Khởi tạo nghỉ việc → thu hồi tài sản + quyền truy cập (SSO) → chốt lương/phép → lưu trữ hồ sơ.

**BP-8 — Access Lifecycle.** Cấp/đổi/reset/thu hồi tài khoản SSO đồng bộ HRM ↔ Keycloak; audit mọi thao tác.

---

## 6. Giá trị & Lợi ích

| Bên hưởng lợi | Giá trị |
|---------------|---------|
| **Nhân viên** | Tự phục vụ mọi lúc trên điện thoại; minh bạch công/phép/lương; timeline 24h thấy rõ ngày làm việc |
| **Quản lý** | Duyệt nhanh trên mobile; nhìn thấy đội nhóm theo thời gian thực (hoạt động chấm công 24h) |
| **HR / C&B** | Giảm thao tác thủ công, chuẩn hóa lương/thuế, đối soát tự động, quản lý đơn nghỉ tập trung |
| **Lãnh đạo** | Dashboard, báo cáo, kiểm soát tuân thủ |
| **CNTT / Bảo mật** | SSO tập trung, offboard tức thì, audit, tích hợp API chuẩn |
| **Công ty** | Nguồn dữ liệu nhân sự duy nhất, giảm rủi ro tuân thủ, dữ liệu ra quyết định |

---

## 7. Giả định, Ràng buộc & Rủi ro

**Giả định:** nhân viên có smartphone (GPS + camera); có tài khoản Keycloak; kết nối mạng ổn định tại điểm chấm công.

**Ràng buộc:** tuân thủ Luật Lao động VN; SSO-only; dữ liệu nhân sự nhạy cảm cần bảo vệ.

**Rủi ro & giảm thiểu:**
| Rủi ro | Giảm thiểu |
|--------|-----------|
| Gian lận chấm công (hộ, giả vị trí) | Bắt buộc ảnh selfie + geofence + log thiết bị/UA; nhận diện khuôn mặt (tùy chọn) |
| Sai lương/thuế | Công thức chuẩn hóa đồng bộ server/UI; kiểm tra tình trạng HĐ; test trên stage trước prod |
| Lộ dữ liệu nhạy cảm | Secrets qua env; SSO; audit; token Outlook mã hóa (Fernet) |
| Phụ thuộc Keycloak | Backup SSO cron + sync sang stage; giám sát; DR |
| Deploy gây gián đoạn | Deploy web/pwa không đụng bff → không buộc re-login (Redis session); rollback qua git |

---

## 8. Tiêu chí thành công

- **Vận hành**: hệ thống chạy ổn định production; chấm công/nghỉ phép/lương end-to-end không cần Excel thủ công. ✅ đã đạt.
- **Áp dụng**: đa số nhân viên dùng self-service; giảm ticket HR.
- **Tuân thủ**: lương/thuế/BHXH đúng luật; có dấu vết audit đầy đủ.
- **Bảo mật**: 100% truy cập qua SSO; thu hồi quyền tức thì khi offboard.

---

## 9. Lộ trình & Ưu tiên

| Giai đoạn | Nội dung | Trạng thái |
|-----------|----------|-----------|
| **Phase 0 — Nền tảng** | SSO, hồ sơ/onboarding, phân quyền, hạ tầng | ✅ Production |
| **Phase 1 — Lõi vận hành** | Chấm công, nghỉ phép, lương | ✅ Production |
| **Phase 2 — Nghiệp vụ HR** | Chi phí, tài sản, PMS, đào tạo, thăng chức, tuyển dụng | ✅ Đã có |
| **Phase 3 — Tích hợp & Trải nghiệm** | Lịch tổng hợp (Outlook), timeline 24h, thông báo, embed app nội bộ | ✅ Đã có (07/2026) |
| **Phase 4 — Đặc thù ngành** | Module tourism, gamification WC2026 | Tùy chọn (feature flag) |

> Các tính năng Phase 3 mới bổ sung 07/2026: timeline 24h cá nhân lồng Outlook + chấm công, hoạt động chấm công 24 khung giờ, C&B quản lý đơn nghỉ chờ duyệt tập trung.

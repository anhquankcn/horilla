# Software Requirements Specification (SRS) — Vertical Giáo dục ĐH/CĐ
## Case pilot: Trường Đại học Quảng Nam (ĐHQN)

| | |
|---|---|
| Phiên bản | 0.1 (draft pilot) |
| Ngày | 2026-06-25 |
| Nền tảng | Horilla HRM (shared core) + app vertical `academic` — xem [edu-hrm-architecture-plan.md](./edu-hrm-architecture-plan.md) |
| Baseline tham chiếu | [SRS.md](./SRS.md) (bản thương mại HNH Travel) |

> **Lưu ý:** Đây là bản **pilot draft** để làm việc với ĐHQN. Các mục đánh dấu **(CXN)** = *cần xác nhận với trường* (cơ cấu, định mức, hệ số, quy chế nội bộ). Các quy định nhà nước (định mức giờ chuẩn, hệ số lương viên chức, phụ cấp) phải **cấu hình được trong DB**, không hardcode, vì thay đổi theo văn bản hiện hành.

---

## 1. Giới thiệu

### 1.1 Mục đích
Số hóa quản trị nhân sự cho **Trường Đại học Quảng Nam** — cơ sở giáo dục đại học **công lập**: quản lý viên chức/người lao động, **giờ giảng & định mức lao động**, lương theo **hệ số viên chức** + phụ cấp nhà giáo, hợp đồng làm việc, nghỉ phép theo năm học, đào tạo bồi dưỡng, NCKH (tùy chọn), và các nghiệp vụ HR chung. Hệ thống dùng lại **core Horilla** (đã vận hành cho HNH Travel) + bổ sung app **academic** đặc thù giáo dục.

### 1.2 Phạm vi
- **Web admin** cho Phòng Tổ chức – Cán bộ (TCCB), Phòng Đào tạo, Kế toán.
- **PWA mobile** cho giảng viên/cán bộ: xem giờ giảng, đăng ký nghỉ, xem lương, thông báo, chấm công (với cán bộ hành chính).
- **SSO** qua Keycloak (realm/client riêng của ĐHQN — cô lập định danh).
- **Deployment riêng** cho ĐHQN (DB riêng, domain riêng) theo phương án B của plan kiến trúc.

**Ngoài phạm vi pha 1 (CXN):** tích hợp phần mềm đào tạo/QLĐT hiện có của trường, cổng sinh viên — sẽ tích hợp sau qua M2M.

### 1.3 Đối tượng & vai trò

| Vai trò | Mô tả |
|---------|-------|
| Giảng viên | Xem định mức/giờ giảng, đăng ký nghỉ, xem lương, kê khai NCKH |
| Trưởng Bộ môn | Phân công giảng dạy, duyệt giờ giảng/nghỉ của bộ môn |
| Trưởng Khoa | Duyệt cấp khoa, tổng hợp định mức khoa |
| Phòng TCCB | Quản lý hồ sơ viên chức, hợp đồng, ngạch/bậc, điều động, bổ nhiệm |
| Phòng Đào tạo | Định mức giờ chuẩn, phân công giờ giảng, tổng hợp vượt giờ |
| Kế toán / lương | Tính lương hệ số + phụ cấp, vượt giờ, bảng lương tháng |
| Ban Giám hiệu | Phê duyệt cấp trường, báo cáo, dashboard |
| Hệ thống ngoài (M2M) | Phần mềm QLĐT/NCKH, máy chấm công |

### 1.4 Định nghĩa
- **Viên chức**: người làm việc theo chế độ hợp đồng làm việc trong đơn vị sự nghiệp công lập (Luật Viên chức).
- **Giờ chuẩn (giờ tín chỉ giảng dạy quy đổi)**: đơn vị định mức lao động của giảng viên (theo Thông tư 20/2020/TT-BGDĐT — định mức, cấu hình được).
- **Định mức giờ chuẩn/năm học**: tổng giờ chuẩn giảng viên phải hoàn thành/năm (chia giảng dạy / NCKH / phục vụ cộng đồng).
- **Vượt giờ**: số giờ chuẩn vượt định mức, được thanh toán.
- **Ngạch/hạng chức danh nghề nghiệp**: Giảng viên (hạng III), Giảng viên chính (hạng II), Giảng viên cao cấp (hạng I) — theo Thông tư 40/2020/TT-BGDĐT.
- **Hệ số lương**: hệ số × **mức lương cơ sở** (do Nhà nước quy định, cấu hình theo thời điểm).
- **Học hàm/học vị**: GS/PGS; TS/ThS/CN.
- **Năm học / Học kỳ**: đơn vị thời gian neo cho định mức + nghỉ.

---

## 2. Mô tả tổng quan

### 2.1 Bối cảnh sản phẩm
Hệ thống là **instance riêng** của ĐHQN trên core Horilla dùng chung, bật `HRM_SECTOR=education`. Kiến trúc kỹ thuật (Django + PWA + Keycloak + Postgres + Docker) như [TDD.md](./TDD.md); phần đặc thù giáo dục nằm trong app `academic` / `teaching_hours` / payroll strategy viên chức.

### 2.2 Cơ cấu tổ chức ĐHQN (CXN — cần lấy sơ đồ chính thức)
Mô hình phân cấp:
```
Trường ĐH Quảng Nam
 ├── Ban Giám hiệu
 ├── Khoa  ──< Bộ môn        (đơn vị đào tạo, có giảng viên)
 ├── Phòng / Ban             (TCCB, Đào tạo, KH-TC, CTSV, QLKH&HTQT...)
 ├── Trung tâm               (Tin học – Ngoại ngữ, Học liệu...)
 └── Cơ sở / địa điểm         (Tam Kỳ + cơ sở khác nếu có)
```
→ Hệ thống cần **phân cấp đơn vị** (Trường→Khoa→Bộ môn; Phòng/Ban/Trung tâm song song), không phẳng như mô hình "phòng ban du lịch".

### 2.3 Ràng buộc
- Tuân thủ **Luật Viên chức**, **Bộ luật Lao động** (với người lao động hợp đồng), quy định **Bộ GD&ĐT** về định mức giờ chuẩn & chức danh giảng viên, quy định **Bộ Nội vụ/Bộ Tài chính** về lương/phụ cấp.
- **Mức lương cơ sở**, hệ số, định mức, % phụ cấp **thay đổi theo văn bản** → bắt buộc cấu hình DB.
- Ngôn ngữ Tiếng Việt, timezone UTC+7; thuật ngữ giáo dục (Khoa/Bộ môn/Giảng viên).
- **Cô lập dữ liệu** trường (deployment riêng).
- Năm học (vd 2025–2026) làm đơn vị neo, không chỉ theo tháng dương lịch.

### 2.4 Giả định
- ĐHQN dùng SSO tập trung (Keycloak realm riêng) hoặc liên kết tài khoản email trường.
- Mỗi giảng viên/cán bộ có 1 hồ sơ viên chức + ngạch/bậc.
- Định mức giờ chuẩn được Phòng Đào tạo ban hành đầu năm học.

---

## 3. Yêu cầu chức năng

### FR-E1 Tổ chức & Hồ sơ viên chức
- FR-E1.1 Quản lý **phân cấp đơn vị** Trường→Khoa→Bộ môn; Phòng/Ban/Trung tâm; đa cơ sở.
- FR-E1.2 Hồ sơ viên chức: thông tin cá nhân, **ngạch/hạng chức danh** (GV/GVC/GVCC), **bậc + hệ số lương**, **học hàm/học vị**, ngày tuyển dụng/bổ nhiệm/nâng lương gần nhất.
- FR-E1.3 Phân loại nhân sự: **Giảng viên** / **Giảng viên kiêm nhiệm quản lý** / **Nghiên cứu viên** / **Chuyên viên–cán bộ hành chính** / **Trợ giảng** / **Hợp đồng lao động**.
- FR-E1.4 Theo dõi **nâng bậc lương** định kỳ (niên hạn) + cảnh báo đến hạn; thâm niên nhà giáo.
- FR-E1.5 Quản lý bổ nhiệm/miễn nhiệm chức vụ (Trưởng/Phó khoa, bộ môn, phòng) → phụ cấp chức vụ.

### FR-E2 Định mức & Giờ giảng (trọng tâm khác biệt)
- FR-E2.1 Khai báo **định mức giờ chuẩn/năm học** theo chức danh (vd GV, GVC...) — cấu hình được (theo Thông tư 20/2020). (CXN: số giờ cụ thể của trường.)
- FR-E2.2 Phân bổ định mức: giảng dạy / NCKH / phục vụ cộng đồng theo tỷ lệ quy định; miễn giảm định mức (kiêm nhiệm quản lý, GV nữ nuôi con nhỏ...) (CXN).
- FR-E2.3 **Phân công giảng dạy** theo học phần/lớp/học kỳ; quy đổi ra **giờ chuẩn** (hệ số lớp đông, thực hành, hướng dẫn đồ án/khóa luận...) (CXN bảng quy đổi).
- FR-E2.4 **Kê khai/ghi nhận giờ giảng thực hiện** (TeachingHourLog) theo học kỳ; đối chiếu định mức.
- FR-E2.5 Duyệt giờ giảng: Bộ môn → Khoa → Phòng Đào tạo.
- FR-E2.6 Tính **vượt định mức (vượt giờ)** cuối học kỳ/năm → chuyển sang thanh toán lương.
- FR-E2.7 Báo cáo định mức/khối lượng theo giảng viên/bộ môn/khoa/học kỳ.

### FR-E3 Chấm công (cán bộ hành chính)
- FR-E3.1 Cán bộ hành chính/chuyên viên: chấm công vào/ra (tái dùng engine hiện có: camera + GPS + geofence campus).
- FR-E3.2 Giảng viên: quản lý theo **giờ giảng** thay vì chấm công cứng (cấu hình theo loại nhân sự).
- FR-E3.3 Import chấm công từ máy chấm công/Excel; ca hành chính theo lịch trường.

### FR-E4 Nghỉ phép theo năm học
- FR-E4.1 Loại nghỉ theo Luật + đặc thù GD: phép năm, ốm, thai sản, **nghỉ hè/nghỉ theo lịch năm học** (CXN chế độ), nghỉ việc riêng, đi học/bồi dưỡng, công tác.
- FR-E4.2 Đăng ký nghỉ + duyệt theo cấp Bộ môn → Khoa → (TCCB) — tái dùng cơ chế nhiều cấp + người theo dõi.
- FR-E4.3 Cấp phát/kết chuyển phép theo **năm học** (không chỉ năm dương lịch).
- FR-E4.4 Cán bộ TCCB cố định trong luồng duyệt + theo dõi (tái dùng cơ chế CBLeaveManager).

### FR-E5 Hợp đồng & Tuyển dụng viên chức
- FR-E5.1 Loại hợp đồng: **Hợp đồng làm việc** (xác định/không xác định thời hạn) cho viên chức; **HĐLĐ** cho người lao động; tập sự.
- FR-E5.2 Theo dõi thời hạn HĐ, gia hạn, chuyển loại; cảnh báo hết hạn.
- FR-E5.3 Tuyển dụng viên chức (thông báo, ứng viên, hội đồng xét tuyển) — tái dùng module recruitment + tùy biến quy trình.

### FR-E6 Lương viên chức (payroll strategy riêng)
- FR-E6.1 Lương cơ bản = **hệ số × mức lương cơ sở** (cấu hình mức cơ sở theo thời điểm).
- FR-E6.2 Phụ cấp: **ưu đãi nghề/đứng lớp** (% theo quy định), **thâm niên nhà giáo** (5% sau 5 năm, +1%/năm — cấu hình), **phụ cấp chức vụ lãnh đạo**, phụ cấp khu vực/độc hại nếu có (CXN).
- FR-E6.3 **Thanh toán vượt giờ giảng**: đơn giá giờ vượt × số giờ vượt (cấu hình đơn giá theo chức danh) (CXN).
- FR-E6.4 Thù lao NCKH/đề tài (nếu đưa vào lương) (CXN).
- FR-E6.5 Khấu trừ: **BHXH/BHYT/BHTN** (theo lương hệ số, có trần), **kinh phí công đoàn**, **thuế TNCN lũy tiến**, giảm trừ bản thân + người phụ thuộc.
- FR-E6.6 Bảng lương tháng (1 dòng/viên chức/tháng): tái dùng `MonthlyPayrollEntry` nhưng **engine tính = CivilServantPayroll**; HR nhập biến động (vượt giờ, thưởng, tạm ứng).
- FR-E6.7 Phiếu lương trên PWA; gửi email; báo cáo quỹ lương theo đơn vị.

### FR-E7 NCKH & Đào tạo bồi dưỡng (tùy chọn pha 2)
- FR-E7.1 Quản lý **đề tài NCKH** (chủ nhiệm, thành viên, cấp đề tài, nghiệm thu, quy đổi giờ chuẩn) (CXN có làm pha 1 không).
- FR-E7.2 Đào tạo bồi dưỡng: kế hoạch học tập nâng cao trình độ (ThS/TS), chứng chỉ chức danh nghề nghiệp; theo dõi.

### FR-E8 Đánh giá & Thi đua (tùy chọn)
- FR-E8.1 Đánh giá viên chức cuối năm (hoàn thành nhiệm vụ / xuất sắc...) — tái dùng PMS, tùy biến tiêu chí.
- FR-E8.2 Thi đua khen thưởng (CXN mức độ cần thiết).

### FR-E9 Xác thực, Thông báo, Báo cáo, Quản trị
- FR-E9.1 SSO Keycloak (realm/client ĐHQN); phân quyền theo cấp Trường/Khoa/Bộ môn/Phòng.
- FR-E9.2 Thông báo trong app + Web Push (lịch giảng, duyệt nghỉ, đến hạn nâng lương...).
- FR-E9.3 Báo cáo: nhân sự theo đơn vị/chức danh/học vị, định mức & vượt giờ, quỹ lương, biến động viên chức.
- FR-E9.4 Quản trị danh mục: đơn vị, chức danh/ngạch/bậc, mức lương cơ sở, định mức, bảng quy đổi giờ, loại nghỉ — **cấu hình bởi TCCB/Đào tạo**.

---

## 4. Yêu cầu phi chức năng

| Mã | Loại | Yêu cầu |
|----|------|---------|
| NFR-E1 | Tuân thủ | Đúng Luật Viên chức, quy định Bộ GD&ĐT/Nội vụ/Tài chính; tham số nhà nước (mức cơ sở, định mức, %) **cấu hình DB** |
| NFR-E2 | Cô lập dữ liệu | Deployment riêng ĐHQN (DB/domain/KC riêng) |
| NFR-E3 | Bảo mật | SSO-only; phân quyền theo cấp đơn vị; secrets qua env |
| NFR-E4 | Bản địa hóa | Tiếng Việt, thuật ngữ giáo dục, neo theo năm học |
| NFR-E5 | Khả dụng | PWA mobile cho GV; web cho phòng ban; offline-ready |
| NFR-E6 | Truy vết/Audit | Lịch sử thay đổi hồ sơ viên chức, ngạch/bậc, giờ giảng, lương (phục vụ thanh tra/kiểm toán) |
| NFR-E7 | Tái sử dụng | ≥70% dùng lại core Horilla; phần academic là app cộng thêm |

---

## 5. Giao diện ngoài (CXN)

| Hệ thống | Mục đích | Ghi chú |
|----------|----------|---------|
| Phần mềm Quản lý đào tạo (QLĐT) của trường | Lấy phân công lớp/học phần để quy đổi giờ giảng | M2M (pha 2, CXN phần mềm đang dùng) |
| Hệ thống NCKH (nếu có) | Đồng bộ đề tài → quy đổi giờ | M2M (pha 2) |
| Máy chấm công | Cán bộ hành chính | M2M |
| Email trường | Thông báo, phiếu lương | SMTP |
| Cổng dịch vụ công / BHXH (nếu yêu cầu) | Báo cáo (CXN) | tương lai |

---

## 6. Tái sử dụng từ core (tóm tắt)
Dùng lại gần như nguyên: SSO/Keycloak, hồ sơ nhân sự cơ bản, attendance engine (cán bộ HC), leave engine (nhiều cấp + watcher), notifications/Web Push, PWA, hạ tầng deploy, đa đơn vị (Company/Department).
Bổ sung mới: app `academic` (chức danh/ngạch/bậc, năm học, định mức, giờ giảng), `CivilServantPayroll`, NCKH (tùy chọn), phân cấp đơn vị, term-pack giáo dục.

---

## 7. Giả định & Câu hỏi mở cần chốt với ĐHQN (CXN)

1. **Sơ đồ tổ chức chính thức** (danh sách Khoa/Bộ môn/Phòng/Ban/Trung tâm, số cơ sở).
2. **Quy mô**: số viên chức/giảng viên/người lao động hiện tại.
3. **Định mức giờ chuẩn** áp dụng (số giờ/năm theo chức danh) + **bảng quy đổi giờ** (lý thuyết/thực hành/hướng dẫn/lớp đông) + chế độ miễn giảm.
4. **Chính sách lương**: hệ số áp dụng, mức lương cơ sở hiện hành, các loại phụ cấp + tỷ lệ, **đơn giá vượt giờ** theo chức danh.
5. **Chế độ nghỉ** đặc thù (nghỉ hè giảng viên, lịch năm học).
6. **Phạm vi pha 1**: có gồm NCKH/đào tạo bồi dưỡng/thi đua không, hay tập trung nhân sự + giờ giảng + lương?
7. **SSO**: dùng email trường (Microsoft/Google) hay KC-local? Realm riêng hay client riêng?
8. **Tích hợp**: phần mềm QLĐT/NCKH hiện dùng (để lấy phân công giảng dạy) — tên & khả năng API?
9. **Dữ liệu chuyển đổi**: nguồn dữ liệu nhân sự/lương hiện tại để import (Excel/PMIS/phần mềm cũ)?

---

## 8. Lộ trình đề xuất (MVP pilot ĐHQN)

| Pha | Nội dung | Mục tiêu |
|-----|----------|----------|
| **MVP-1** | Tổ chức phân cấp + hồ sơ viên chức + ngạch/bậc + SSO + import dữ liệu | Số hóa nhân sự cơ bản |
| **MVP-2** | Định mức + phân công + ghi nhận giờ giảng + duyệt + vượt giờ | Quản lý giờ giảng |
| **MVP-3** | Lương viên chức (hệ số + phụ cấp + vượt giờ) + bảng lương tháng + phiếu lương | Tính lương |
| **MVP-4** | Nghỉ phép theo năm học + thông báo + báo cáo | Hoàn thiện vận hành |
| **Pha 2** | NCKH, đào tạo bồi dưỡng, đánh giá/thi đua, tích hợp QLĐT | Mở rộng |

> Bước kế tiếp: gửi mục 7 (câu hỏi mở) cho Phòng TCCB + Phòng Đào tạo ĐHQN để chốt số liệu, rồi tinh chỉnh SRS này thành baseline cho MVP-1.

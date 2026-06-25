# Kế hoạch kiến trúc — HRM cho Cơ sở Giáo dục ĐH/CĐ
## (Education vertical trên nền Horilla HRM)

| | |
|---|---|
| Phiên bản | 0.1 (draft) |
| Ngày | 2026-06-25 |
| Nền tảng gốc | Horilla HRM (bản HNH Travel, branch `horilla_aqv10`) |
| Trạng thái | Đề xuất kiến trúc — cần chốt trước khi build |

> Tài liệu này quyết định **cách** mở rộng hệ thống HRM hiện tại sang phân khúc giáo dục ĐH/CĐ, không phải đặc tả nghiệp vụ (cái đó là SRS riêng). Đọc kèm [SRS.md](./SRS.md), [TDD.md](./TDD.md).

---

## 1. Bối cảnh & mục tiêu

Hệ thống hiện tại phục vụ **1 doanh nghiệp du lịch** (HNH Travel). Mục tiêu: phục vụ **nhiều cơ sở giáo dục ĐH/CĐ** (mỗi trường là một khách hàng độc lập), **tái sử dụng tối đa** core, **không tạo nợ kỹ thuật** kiểu branch song song.

Ràng buộc thực tế của khách hàng giáo dục:
- Mỗi trường thường muốn **dữ liệu tách biệt** (DB riêng, domain riêng) vì lý do bảo mật/pháp lý.
- Nghiệp vụ **khác đáng kể** mảng nhân sự thương mại: viên chức, giờ giảng, NCKH, lương hệ số nhà nước.
- Là **nhiều khách hàng**, không phải 1 → cần nhân bản dễ, cấu hình theo trường.

---

## 2. Quyết định kiến trúc (ADR)

### 2.1 Các lựa chọn

| | Mô tả | Ưu | Nhược |
|---|------|-----|-------|
| **A. Multi-tenant 1 instance** | 1 deployment, mỗi trường = 1 `Company` | Vận hành 1 chỗ | Dữ liệu chung 1 DB (rủi ro bảo mật/cô lập), khó tùy biến sâu/trường |
| **B. Shared core + instance/trường (config-driven)** ✅ | 1 codebase chung, mỗi trường = 1 deployment riêng (DB/domain/KC riêng), khác nhau qua **cấu hình + app vertical** | Cô lập dữ liệu, vẫn chung core, nhân bản bằng config | Nhiều instance để vận hành (giải quyết bằng IaC/script) |
| **C. Fork/branch riêng** | `horilla_edu` diverge dài hạn | Tự do tuyệt đối | Mỗi fix chung merge nhiều nơi → drift, đúng cái đau đang muốn tránh |

### 2.2 Quyết định: **Phương án B** — Shared core, deploy theo trường, điều khiển bằng cấu hình + app vertical.

**Lý do:**
- Horilla **đã multi-company** (`Company` + `company_id` khắp model) và **white-label** sẵn → nền tảng đa tổ chức có sẵn.
- Cô lập dữ liệu từng trường (yêu cầu bắt buộc của GD) đạt bằng **instance riêng**, không phải bằng row-level.
- **KHÔNG branch song song**: core ở `main`/`1.0`; education là **app cộng thêm + profile cấu hình**, merge ngược về core. Mỗi trường pin **release tag** + `.env` riêng.

### 2.3 Cơ chế "sector profile"
Thêm 1 khái niệm cấu hình theo deployment (env-driven), ví dụ `HRM_SECTOR=education|commercial`, quyết định:
- App nào bật trong `SIDEBARS` / `INSTALLED_ADDONS`.
- Thuật ngữ tổ chức (Phòng ban ↔ Khoa/Bộ môn).
- Payroll engine nào (thương mại G/H ↔ hệ số viên chức).
- Loại hợp đồng, loại nghỉ, định mức công việc mặc định.

Code vertical giáo dục nằm trong **app riêng** (vd `academic`, `teaching_hours`), **trơ** (không ảnh hưởng) khi sector=commercial.

---

## 3. Điểm trừu tượng hóa (nơi tham số hóa, không hardcode)

| Hiện tại (hardcode HNH) | Cần trừu tượng hóa thành |
|--------------------------|---------------------------|
| `setup_hnh_company` tạo 10 phòng du lịch | Command setup theo **sector profile** + dữ liệu trường |
| Loại HĐ Trial/Official/Performance | Registry loại HĐ theo sector (thêm `CivilServantContract`...) |
| Công thức lương G/H trong `contract_hnh_views` | **Payroll strategy** chọn theo loại HĐ/sector |
| Loại nghỉ Nhóm 2 (Tour/Lễ) | Bộ loại nghỉ theo sector (thêm nghỉ hè học kỳ) |
| Ca ALD26, chấm vào/ra | Mô hình "định mức công việc" cấu hình (clock-in **hoặc** giờ giảng) |
| Thuật ngữ "Phòng ban", "Nhân viên" trên UI | i18n/term-pack theo sector |
| Branding HNH (logo, màu) | White-label per-tenant (đã có hạ tầng) |

---

## 4. Data model deltas (giáo dục)

**Mở rộng model có sẵn:**
- `Department` → dùng làm **Khoa**; thêm `Department.parent` (hoặc model `AcademicUnit` phân cấp Trường→Khoa→Bộ môn).
- `JobPosition` / `WorkLevel` → bổ sung **ngạch viên chức** + **học hàm/học vị** (CN/ThS/TS/PGS/GS).
- `EmployeeWorkInformation` → thêm loại nhân sự academic (giảng viên/NCV/HC/trợ giảng).

**App mới `academic`:**
- `AcademicTitle` (học hàm/học vị), `AcademicRank` (ngạch/bậc lương viên chức, hệ số).
- `TeachingNorm` (định mức giờ chuẩn/năm học theo chức danh).
- `TeachingHourLog` (giờ giảng thực hiện theo học kỳ/môn) — thay/bổ sung "chấm công".
- `ResearchProject` (đề tài NCKH) + tham gia + nghiệm thu (nếu cần NCKH).
- `AcademicYear` / `Semester` (lịch năm học) — neo cho nghỉ phép + định mức.

**App mới `payroll_civilservant` (hoặc strategy trong payroll):**
- Bảng lương hệ số: lương = hệ số × mức lương cơ sở; PC đứng lớp, **thâm niên nhà giáo**, vượt giờ giảng, PC chức vụ.

---

## 5. Payroll theo Strategy (quan trọng nhất)

Không nhét lương GD vào hàm tính lương thương mại. Tách:

```
PayrollEngine (interface)
 ├── CommercialPayroll   (G/H + KPI — hiện tại, HNH Travel)
 └── CivilServantPayroll (hệ số viên chức + PC nhà giáo + vượt giờ giảng)
```

- Chọn engine theo **loại hợp đồng** của nhân viên (hoặc sector profile).
- `MonthlyPayrollEntry` giữ vai trò bảng lương tháng nhưng **cột tính** do engine quyết định.
- Cho phép 1 instance chạy nhiều engine (trường có cả viên chức lẫn HĐLĐ).

---

## 6. Chấm công ↔ Giờ giảng

- Giữ attendance engine cho **cán bộ hành chính** (clock-in/out, đã có).
- Thêm **TeachingHourLog** cho **giảng viên**: nhập/duyệt giờ giảng theo môn/học kỳ; đối chiếu **định mức giờ chuẩn**; vượt định mức → vượt giờ (vào payroll).
- Cấu hình theo `AcademicYear/Semester` thay vì chỉ theo tháng.
- Tái dùng `EmployeeShiftSchedule` cho lịch giảng nếu cần.

---

## 7. Tổ chức & phân quyền
- Phân cấp **Trường → Khoa → Bộ môn** (Department.parent hoặc AcademicUnit).
- Vai trò GD: Hiệu trưởng/Phó HT, Trưởng khoa, Trưởng bộ môn, Giảng viên, Phòng TCCB (nhân sự).
- Quy trình duyệt nhiều cấp đã có (`MultipleApprovalCondition` + ConditionApproval) → cấu hình theo cấp Khoa/Trường.

---

## 8. Branding, i18n, SSO
- White-label per-trường (logo, màu) — hạ tầng có sẵn (`base/context_processors.py`).
- **Term-pack** theo sector: "Nhân viên→Cán bộ/Giảng viên", "Phòng ban→Khoa", "Ca→Lịch giảng".
- SSO: mỗi trường **KC realm hoặc client riêng** (cô lập định danh); tái dùng `oidc_backend`.

---

## 9. Triển khai & Git workflow (KHÔNG branch song song)

- **Core** ở `main`/`1.0`. Education vertical = **app cộng thêm + sector profile**, phát triển trên feature branch, **merge ngược về core** (apps trơ khi sector=commercial).
- Mỗi trường = **1 deployment**: pin **release tag** + `.env` riêng (`HRM_SECTOR=education`, cấu hình trường, DB/domain/KC riêng).
- Hạ tầng nhân bản bằng **script/IaC** (mở rộng `docker-compose` + `.env.<truong>` + setup command).
- HNH Travel tiếp tục chạy sector=commercial trên cùng core → 1 codebase, không fork.

```
repo (1 core)
 ├── main/1.0 ........... core dùng chung
 ├── apps: academic, teaching_hours, payroll_civilservant (trơ nếu không bật)
 └── deployments (ngoài git, hoặc infra repo)
     ├── hnh-travel/      .env  HRM_SECTOR=commercial
     ├── truong-A/        .env  HRM_SECTOR=education + config A
     └── truong-B/        .env  HRM_SECTOR=education + config B
```

---

## 10. Lộ trình (phases)

| Phase | Nội dung | Kết quả |
|-------|----------|---------|
| **P0** Chốt | Duyệt kiến trúc B + chọn 1 trường pilot | ADR approved |
| **P1** SRS GD | Viết SRS vertical giáo dục (làm với pilot) | docs/SRS-education.md |
| **P2** Sector profile | Thêm `HRM_SECTOR` + tham số hóa SIDEBARS/term/org | Core hỗ trợ đa sector |
| **P3** Academic core | App `academic` (chức danh, đơn vị, năm học) + định mức giờ giảng | Quản lý GV + giờ giảng |
| **P4** Payroll strategy | Tách engine + `CivilServantPayroll` | Lương viên chức chạy |
| **P5** Branding/SSO | White-label trường + KC realm/client riêng | Pilot có thương hiệu riêng |
| **P6** Pilot deploy | Instance riêng + setup command + import dữ liệu trường | Trường pilot live |
| **P7** Nhân bản | Script hóa deploy + onboard trường thứ 2 | Quy trình lặp lại |

---

## 11. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Nghiệp vụ viên chức/giờ giảng phức tạp hơn dự kiến | Pilot 1 trường thật trước khi nhân bản |
| Core "rò rỉ" giả định HNH (hardcode) | Audit + tham số hóa ở P2 (điểm mục 3) |
| Nhiều instance khó vận hành | Script/IaC hóa từ P6; chuẩn hóa `.env.<truong>` |
| Lương nhà nước thay đổi (hệ số, mức cơ sở) | Đưa hệ số/mức vào **cấu hình DB**, không hardcode |
| Cám dỗ tạo branch riêng cho trường khó | Giữ kỷ luật: vertical = app + config, merge về core |

---

## 12. Ước lượng sơ bộ (cần tinh chỉnh sau SRS)

- P2 (sector profile + tham số hóa): **trung bình** — chủ yếu refactor cấu hình.
- P3 (academic core + giờ giảng): **lớn** — model + UI + quy trình mới.
- P4 (payroll viên chức): **lớn** — engine + công thức nhà nước.
- P5–P7 (branding/deploy/nhân bản): **trung bình** — phần lớn hạ tầng có sẵn.

→ MVP cho 1 trường pilot khả thi nếu thu hẹp scope (vd: bỏ NCKH ở pha 1, tập trung nhân sự + giờ giảng + lương viên chức).

---

## 13. Quyết định cần chốt (mở)
1. Sector profile bằng **env per-deployment** (khuyến nghị) hay **field trên Company** (multi-tenant 1 instance)?
2. Pilot: trường nào? Có cần NCKH ngay pha 1 không?
3. Định danh: mỗi trường **KC realm riêng** hay **client riêng trong realm chung**?
4. Lương: trường dùng thuần viên chức, hay lai HĐLĐ (cần cả 2 engine)?

> Bước kế tiếp đề xuất: viết **SRS-education** (P1) cùng 1 trường pilot để chốt các điểm mở ở mục 13.

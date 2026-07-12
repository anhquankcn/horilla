# Tài liệu dự án — Horilla HRM (HNH Travel)

Tài liệu kỹ thuật cho hệ thống HRM của Công ty Du lịch Hồng Ngọc Hà.

### Tài liệu tổng quan (bộ portable — HNH là Reference Implementation)
> Bộ SRS/BRD/FRD/TDD phiên bản **2.0 portable**: viết theo **model năng lực HRM chung**, chi tiết gắn HNH đánh dấu `[RI]`, gợi ý tổ chức khác (vd **bank TMO HRM**) đánh dấu `[Adopter]`. Dùng làm đầu vào để một dự án/Claude khác viết lại BRD/FRD cho HRM subsystem của mình.

| Tài liệu | Mô tả |
|----------|-------|
| [BRD.md](./BRD.md) | **Business Requirements Document** — bối cảnh, mục tiêu kinh doanh (G1–G6), quy trình nghiệp vụ (BP-1..8), giá trị, rủi ro, lộ trình. Trả lời "tại sao / đạt được gì" |
| [SRS.md](./SRS.md) | **Software Requirements Specification** — yêu cầu hệ thống: phạm vi, actor, chức năng (FR) + phi chức năng (NFR) + giao diện ngoài + **Capability Inventory** theo module |
| [FRD.md](./FRD.md) | **Functional Requirements Document** — đặc tả **chi tiết từng chức năng** (luồng, business rules, validation, endpoint), truy vết FR của SRS |
| [TDD.md](./TDD.md) | **Technical Design Document** — kiến trúc, tech stack, mô hình dữ liệu, API, thuật toán, bảo mật, triển khai, + **Adopter Technical Playbook** |
| [edu-hrm-architecture-plan.md](./edu-hrm-architecture-plan.md) | Kế hoạch kiến trúc mở rộng sang vertical HRM giáo dục ĐH/CĐ |
| [SRS-education.md](./SRS-education.md) | SRS vertical giáo dục — case pilot **Trường ĐH Quảng Nam** |

**Quan hệ:** **BRD** (tại sao/giá trị) → **SRS** (hệ thống cần gì, gồm NFR) → **FRD** (đặc tả chức năng) → **TDD** (hiện thực thế nào). Bốn tài liệu truy vết lẫn nhau; đổi phần `[RI]` để dẫn xuất cho tổ chức mới.

### Tài liệu chuyên đề (có sẵn)
| Tài liệu | Mô tả |
|----------|-------|
| [api.md](./api.md) | Tham chiếu API |
| [eoffice-api.md](./eoffice-api.md) | Tích hợp EOffice API |
| [arkon-embed-integration.md](./arkon-embed-integration.md) | Tích hợp embed Arkon |
| [production-standby-replication.md](./production-standby-replication.md) | Cấu hình replication prod↔standby |
| [sso-backup-recovery.md](./sso-backup-recovery.md) | Backup & khôi phục SSO (Keycloak) |

## Bối cảnh nhanh
- Bản tùy biến **Horilla** (mã nguồn mở) cho HNH Travel (~360 nhân viên).
- **Django monolith + PWA React** + **Keycloak SSO** + **PostgreSQL**, triển khai Docker.
- Branch chính: `horilla_aqv10`. Site: qlns.hnhtravel.work.
- Tài liệu sinh từ codebase ngày 2026-06-25. Chi tiết tùy biến HNH (branding, hợp đồng, lương, ca ALD26, SSO) cũng tóm tắt trong [CLAUDE.md](../CLAUDE.md) ở thư mục gốc.

> Lưu ý: SRS/TDD mô tả ở mức kiến trúc & nghiệp vụ. Công thức lương/endpoint cụ thể cần đối chiếu trực tiếp mã nguồn (`payroll/`, `horilla_api/`, `attendance/`) khi sửa đổi.

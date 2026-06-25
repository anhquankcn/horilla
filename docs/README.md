# Tài liệu dự án — Horilla HRM (HNH Travel)

Tài liệu kỹ thuật cho hệ thống HRM của Công ty Du lịch Hồng Ngọc Hà.

### Tài liệu tổng quan
| Tài liệu | Mô tả |
|----------|-------|
| [SRS.md](./SRS.md) | **Software Requirements Specification** — baseline yêu cầu: phạm vi, đối tượng, chức năng (FR) **+ phi chức năng (NFR)** + giao diện ngoài |
| [FRD.md](./FRD.md) | **Functional Requirements Document** — đặc tả **chi tiết từng chức năng** (luồng chính/ngoại lệ, business rules, validation, endpoint), truy vết về FR của SRS |
| [TDD.md](./TDD.md) | **Technical Design Document** — kiến trúc, tech stack, mô hình dữ liệu, API, thuật toán, bảo mật, triển khai, vận hành |
| [edu-hrm-architecture-plan.md](./edu-hrm-architecture-plan.md) | Kế hoạch kiến trúc mở rộng sang vertical HRM giáo dục ĐH/CĐ |
| [SRS-education.md](./SRS-education.md) | SRS vertical giáo dục — case pilot **Trường ĐH Quảng Nam** (viên chức, giờ giảng, lương hệ số) |

**Quan hệ:** SRS (yêu cầu trọn gói gồm NFR) ⊃ phần functional → **FRD** đào sâu thành đặc tả chức năng → **TDD** mô tả cách hiện thực. SRS↔FRD↔TDD truy vết lẫn nhau.

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

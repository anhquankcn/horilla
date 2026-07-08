---
status: completed
branch: horilla_aqv10
timestamp: 2026-06-25T22:59:10+07:00
files_modified: []
---

## Working on: Bộ docs (SRS/FRD/TDD) cho HNH + tách repo vertical giáo dục aqhrm-edu (pilot ĐHQN)

### Summary

Tiếp nối phiên release prod buổi chiều (xem checkpoint trước
`20260625-185127-prod-release-...`). Phiên này tập trung **tài liệu + chiến lược sản
phẩm**, KHÔNG đụng code chạy của HNH. Hai khối: (1) viết bộ tài liệu dự án cho HNH HRM;
(2) lên kế hoạch + dựng repo riêng cho biến thể HRM giáo dục ĐH/CĐ. Working tree HNH
sạch, mọi thứ đã commit + push `horilla_aqv10` (HEAD `14529e6a5`).

### Decisions Made

- **Bộ docs HNH** (commit 62eb8a8bd, c90835d62): `docs/SRS.md` (yêu cầu + NFR),
  `docs/TDD.md` (thiết kế), `docs/FRD.md` (đặc tả chi tiết từng chức năng — viết sau khi
  anh hỏi "tại sao SRS mà không FRD"; SRS⊃functional, FRD đào sâu). Sinh từ khảo sát 4
  agent (39 Django apps, ~80 endpoint, PWA 77 trang). Mọi secret dùng placeholder.
- **Anh thích chuỗi BA chuẩn BRD→FRD→TDD** (môi trường SI/VN). QLĐT cũng dùng đúng chuỗi
  này → docs edu nên theo cùng convention.
- **Vertical giáo dục — Phương án B** (`docs/edu-hrm-architecture-plan.md`): shared core +
  deploy riêng/trường + edu là app cộng thêm (`academic`, payroll viên chức) + sector
  profile `HRM_SECTOR`. KHÔNG branch song song sống lâu. Payroll tách strategy
  (CommercialPayroll vs CivilServantPayroll). QLĐT làm chủ cơ cấu + giờ giảng; HRM khóa
  người theo Keycloak sub.
- **SRS-education** (`docs/SRS-education.md`, case Trường ĐH Quảng Nam): viên chức, giờ
  giảng (Thông tư 20/2020), lương hệ số + thâm niên nhà giáo. Đã điền cơ cấu tổ chức từ
  public + thiết kế tích hợp QLĐT thật (sau khi search web + đọc repo QLDT_QNU).
- **Chỗ đặt code edu = repo MỚI** (anh chọn): `anhquankcn/aqhrm-edu` (private), seed từ HNH
  (giữ nền tảng), KHÔNG branch trong repo HNH. origin=aqhrm-edu, upstream=horilla.

### Remaining Work

Trong repo HNH (`anhquankcn/horilla`): không còn — đã ship + docs xong.

Trong repo edu (`anhquankcn/aqhrm-edu`) — đã bàn giao cho agent khác (xem
`docs/HANDOFF.md` của repo đó):
1. P1: gửi 9 câu hỏi mở (CXN) cho Phòng TCCB + Đào tạo ĐHQN.
2. P2: sector profile + gỡ/tham số hóa đồ HNH (ALD26, hợp đồng du lịch, branding).
3. P3: app `academic` (chức danh/ngạch/bậc, năm học, định mức, giờ giảng).
4. P4: payroll viên chức (CivilServantPayroll).
5. P5: contract tích hợp QLĐT (HRM kéo TeacherWorkload qua Keycloak sub).
6. P6: deploy instance riêng ĐHQN.

Việc bảo mật còn treo (cả 2 repo): mật khẩu replication `hnh_repl_2026_secure` trong git
HISTORY (bản hiện tại đã scrub placeholder) → nên rotate + scrub history (BFG).

### Notes

**ĐH Quảng Nam (public):** lập 1997/2007, mã DQU, 102 Hùng Vương Tam Kỳ, ~180 CBGV,
~15 đơn vị (05 phòng/06 khoa/03 trung tâm/1 trường MN thực hành). Cần sơ đồ chính thức +
Bộ môn (lấy thẳng từ QLĐT tốt nhất).

**QLĐT `anhquankcn/QLDT_QNU`** (branch `main`, KHÔNG phải master): .NET 9 microservices
(CoreService/KqService/TkbService/SvService/TcService) + Gateway YARP + React + WinForms,
thay FoxPro, tích hợp HEMIS/LGSP. Khóa nối HRM = **Keycloak sub** (TeacherId/HeadId).
`TeacherWorkload` (TkbService): TeacherId, Semester, SectionId, AssignedPeriods=số tiết,
PRIMARY/SUBSTITUTE. QLĐT CHƯA expose contract M2M cho HRM → cần phối hợp 2 đội.

**aqhrm-edu đã setup:** workspace `/Users/HNH/repos/anhquankcn/aqhrm-edu`, branch `main`
@ a0658d566. CLAUDE.md viết lại cho edu, docs/HANDOFF.md (task P1-P6), tách doc HNH-only
sang docs/_legacy-hnh/. Memory đã seed:
`~/.claude/projects/-Users-HNH-repos-anhquankcn-aqhrm-edu/memory/` (3 fact + index).
Clone bẫy: default branch HNH là `1.0` (cũ) → đã reset main về horilla_aqv10 HEAD.

**Hạ tầng/ghi nhớ HNH (nhắc lại):** prod 100.99.164.24 (`/opt/hnh/horilla`,
docker-compose.prod.yml, key es-hrm.pem); stage 100.88.75.106 (`/opt/horilla`, deploy.sh,
key naquan.pem); cả 2 deploy từ branch horilla_aqv10. Đầy đủ trong memory HNH +
checkpoint trước.

**Commit phiên này (horilla):** 62eb8a8bd, c90835d62, 99dfd983b, 14529e6a5 (toàn docs).

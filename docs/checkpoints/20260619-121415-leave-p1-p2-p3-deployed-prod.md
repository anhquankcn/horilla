---
status: in-progress
branch: horilla_aqv10
timestamp: 2026-06-19T12:14:15+07:00
files_modified:
  - pwa/frontend/tsconfig.tsbuildinfo
---

## Working on: Nghỉ phép P1+P2+P3 — đã lên prod, tiếp theo P4

### Summary

Hoàn thành và deploy lên production tính năng nghỉ phép P1 (theo ngày), P2 (theo giờ), P3 (Nhóm 2 không trừ phép). Đã fix 2 lỗi validation Nhóm 2 trên prod (Nghỉ không lương + Công tác bị chặn do không có AvailableLeave). Sẵn sàng làm P4.

### Decisions Made

- **Deploy workflow**: `horilla_aqv10` → fast-forward merge → `origin/1.0` → prod pulls `1.0`. Không merge từ local 1.0 (hay bị stale/diverged); dùng `git checkout -B 1.0 origin/1.0 && git merge --ff-only origin/horilla_aqv10`.
- **Nhóm 2 detection**: dùng `AvailableLeave.objects.filter(leave_type_id=...).exists()` thay vì `total_days==0`. Lý do: "Công tác" có `total_days>0` nhưng không gán AvailableLeave cho NV → check `total_days==0` thiếu sót.
- **leave_Validations**: khi loại nghỉ chưa được gán cho bất kỳ NV nào (`is_no_balance_type=True`) → skip balance check, chỉ giữ overlap + attachment check.
- **Modal chi tiết**: đổi từ bottom-sheet → centered card (`items-center justify-center`, `borderRadius:20`, `boxShadow`).
- **requested_days**: hiển thị `.toFixed(2)` thay vì `.toFixed(1)`.
- **setup_hnh_leave_types**: tạo "Chế độ Hiếu/Hỷ/Phúc lợi" + "Nghỉ không lương" trên prod sau deploy.

### Remaining Work

1. **P4** — Màn hình quản lý nghỉ phép cho Manager:
   - Danh sách đơn chờ duyệt của team (API `GET /api/leave/pending-approvals/` đã có)
   - Lọc theo tên nhân viên
   - Xem chi tiết + Duyệt / Từ chối (API `POST /api/leave/pwa-approve/<pk>/` + `pwa-reject/<pk>/` đã có)
   - Tổng quan nghỉ phép tháng của toàn team
2. **P5** — Import/Export Excel phép (chưa bắt đầu)
3. **Ronald Jack 5000T-C** — kết nối máy chấm công M2M token + agent (chưa bắt đầu)
4. **Fix `rotate_shift` scheduler TypeError** (base/scheduler.py:238) — cosmetic log rác, ưu tiên thấp

### Notes

- **Prod SSH**: `ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24`
- **Stage SSH**: `ssh -i ~/CloudSrv/naquan.pem naquan@100.88.75.106`
- **Deploy prod**: chạy `sudo bash deploy-prod.sh` trên server (tự rebuild khi có code mới)
- **tram.pvh** = emp id 221, HNH00149 — default watcher trong LeaveNew
- **Migrations prod**: 0005 + 0006 (hourly fields) đã apply. `setup_hnh_leave_types` đã chạy.
- **API P4 sẵn có**: `pending-approvals/`, `pwa-approve/<pk>/`, `pwa-reject/<pk>/`, `hnh-team-employees/`
- **LeaveManagement.tsx** đã có (Phép Bù proposal flow) — P4 sẽ là trang mới hoặc tab thêm vào
- Nhóm 2 loại nghỉ trên prod: "Chế độ Hiếu/Hỷ/Phúc lợi", "Nghỉ không lương", "Công tác" (pre-existing)
- Validation Nhóm 2: `is_no_balance_type = available_leave is None and not AvailableLeave.objects.filter(leave_type_id=leave_type_id).exists()`

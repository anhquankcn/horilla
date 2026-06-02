"""
Management command: setup_employee_group
Tạo nhóm quyền "Nhân Viên HNH" và gán cho tất cả nhân sự HNH.
"""
from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand


# PWA app slugs dành cho nhân viên thông thường
EMPLOYEE_APPS = [
    "attendance",       # chấm công cá nhân
    "proposals",        # đề xuất ca/loại làm/OT/tài sản
    "approvals",        # duyệt đề xuất của mình
    "payslip",          # phiếu lương
    "notifications",    # thông báo
    "announcement-hub", # tin nội bộ công ty
    "unified-calendar", # lịch chung
    "documents",        # tài liệu cá nhân
    "journey",          # hành trình nhân viên
    "pms",              # KPI, mục tiêu, Feedback 360
    "training",         # khóa học, chứng chỉ
    "org-chart",        # cây tổ chức (xem)
    "promotion-hub",    # hub thăng tiến (xem, submit phê duyệt)
]

# Django permissions cho nhân viên thông thường
# Dùng filter() — bỏ qua perm không tồn tại trong DB thay vì raise lỗi
EMPLOYEE_PERM_CODENAMES = [
    # Chấm công
    "attendance.view_attendance",
    "attendance.view_attendanceovertime",
    "attendance.view_attendanceleave",
    # Nghỉ phép
    "leave.view_leaverequest",
    "leave.add_leaverequest",
    "leave.change_leaverequest",
    "leave.view_availableleave",
    "leave.view_leavetype",
    "leave.add_leaveallocationrequest",
    "leave.view_leaveallocationrequest",
    # Hồ sơ nhân viên
    "employee.view_employee",
    "employee.view_employeeworkinformation",
    "employee.view_employeebankdetails",
    "employee.change_employee",
    "employee.change_employeebankdetails",
    # Phiếu lương
    "payroll.view_payslip",
    # Đề xuất ca làm việc
    "base.view_shiftrequest",
    "base.add_shiftrequest",
    "base.change_shiftrequest",
    # Đề xuất loại hình làm việc
    "base.view_worktyperequest",
    "base.add_worktyperequest",
    "base.change_worktyperequest",
    # Thông báo
    "base.view_announcement",
    # Tài sản cá nhân
    "asset.view_assetassignment",
    "asset.add_assetrequest",
    "asset.view_assetrequest",
    # Hiệu suất (PMS) — chỉ xem + gửi feedback
    "pms.view_employeeobjective",
    "pms.view_employeekeyresult",
    "pms.view_feedback",
    "pms.add_feedback",
    "pms.change_feedback",
    "pms.view_employeebonuspoint",
    # Đào tạo
    "training.view_trainingcourse",
    "training.view_trainingcategory",
    "training.view_trainingenrollment",
    "training.add_trainingenrollment",
    "training.change_trainingenrollment",
    # Tài liệu
    "horilla_documents.view_documentrequest",
    "horilla_documents.add_documentrequest",
    "horilla_documents.change_documentrequest",
]


class Command(BaseCommand):
    help = "Tạo nhóm quyền 'Nhân Viên HNH' và gán cho tất cả nhân sự đang hoạt động"

    def add_arguments(self, parser):
        parser.add_argument(
            "--reassign",
            action="store_true",
            help="Gán lại group cho tất cả nhân viên kể cả đã có (mặc định chỉ gán NV chưa có group này)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Chỉ in ra kết quả, không ghi vào DB",
        )

    def handle(self, *args, **options):
        from base.models import GroupAppVisibility
        from employee.models import Employee

        dry = options["dry_run"]
        reassign = options["reassign"]

        # ── 1. Tạo / lấy Group ──────────────────────────────────────────────
        group, created = Group.objects.get_or_create(name="Nhân Viên HNH")
        if created:
            self.stdout.write(self.style.SUCCESS("✓ Tạo group mới: Nhân Viên HNH"))
        else:
            self.stdout.write(self.style.WARNING("⚠ Group đã tồn tại, cập nhật quyền..."))

        # ── 2. Gán Django permissions ────────────────────────────────────────
        resolved_perms = []
        missing = []
        for dotted in EMPLOYEE_PERM_CODENAMES:
            app_label, codename = dotted.split(".", 1)
            qs = Permission.objects.filter(
                content_type__app_label=app_label,
                codename=codename,
            )
            if qs.exists():
                resolved_perms.append(qs.first())
            else:
                missing.append(dotted)

        if not dry:
            group.permissions.set(resolved_perms)

        self.stdout.write(
            f"  Permissions gán: {len(resolved_perms)}  |  Không tìm thấy: {len(missing)}"
        )
        if missing:
            for m in missing:
                self.stdout.write(self.style.WARNING(f"    - {m}"))

        # ── 3. Cập nhật GroupAppVisibility ───────────────────────────────────
        if not dry:
            vis, vis_created = GroupAppVisibility.objects.get_or_create(group=group)
            vis.allowed_apps = EMPLOYEE_APPS
            vis.save()
            action = "Tạo" if vis_created else "Cập nhật"
            self.stdout.write(self.style.SUCCESS(
                f"  {action} GroupAppVisibility: {len(EMPLOYEE_APPS)} apps"
            ))
        else:
            self.stdout.write(f"  [dry-run] GroupAppVisibility sẽ có {len(EMPLOYEE_APPS)} apps: {EMPLOYEE_APPS}")

        # ── 4. Gán Group cho tất cả nhân viên đang hoạt động ─────────────────
        # Không gán cho user đã có group KHÁC ngoài "Nhân Viên HNH" trừ khi --reassign
        # (tránh override quyền của manager/admin đang dùng group không có visibility config)
        employees = Employee.objects.filter(is_active=True).select_related("employee_user_id")
        total = employees.count()
        added = 0
        skipped = 0
        skipped_has_other = 0
        no_user = 0

        for emp in employees:
            user = emp.employee_user_id
            if user is None:
                no_user += 1
                continue
            if not reassign and group in user.groups.all():
                skipped += 1
                continue
            # Skip superusers and users already in other groups (they have broader access)
            if not reassign and (user.is_superuser or user.groups.exclude(pk=group.pk).exists()):
                skipped_has_other += 1
                continue
            if not dry:
                user.groups.add(group)
            added += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n✓ Hoàn thành:\n"
            f"  Tổng nhân viên active : {total}\n"
            f"  Đã gán group          : {added}\n"
            f"  Đã có group (bỏ qua)  : {skipped}\n"
            f"  Có group khác (bỏ qua): {skipped_has_other}\n"
            f"  Không có user account : {no_user}"
        ))

        if dry:
            self.stdout.write(self.style.WARNING("\n[dry-run] Không có thay đổi nào được lưu."))
        else:
            self.stdout.write(self.style.SUCCESS(
                "\nGroup 'Nhân Viên HNH' sẵn sàng. "
                "Nhân viên trong group sẽ thấy các app: "
                + ", ".join(EMPLOYEE_APPS)
            ))

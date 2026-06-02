"""
Management command to initialize Hong Ngoc Ha Travel company data.
Run once after first deploy: python manage.py setup_hnh_company
Use --force to re-apply existing records.
"""

from django.core.management.base import BaseCommand

from base.models import (
    Company, Department, EmployeeShift, EmployeeShiftDay,
    EmployeeShiftSchedule, JobPosition, WorkType,
)


DEPARTMENTS = [
    "Ban Giám Đốc",
    "Phòng Nhân sự",
    "Phòng Kế toán - Tài chính",
    "Phòng Kinh doanh & Marketing",
    "Phòng Điều hành Tour",
    "Phòng Hướng dẫn viên",
    "Phòng Vận chuyển",
    "Phòng Công nghệ thông tin",
    "Phòng Hành chính - Lễ tân",
    "Phòng Chăm sóc khách hàng",
]

JOB_POSITIONS = [
    ("Ban Giám Đốc", ["Giám đốc điều hành", "Phó Giám đốc"]),
    ("Phòng Nhân sự", ["Trưởng phòng Nhân sự", "Chuyên viên Nhân sự", "Thực tập sinh Nhân sự"]),
    ("Phòng Kế toán - Tài chính", ["Kế toán trưởng", "Kế toán viên", "Thủ quỹ"]),
    (
        "Phòng Kinh doanh & Marketing",
        ["Trưởng phòng Kinh doanh", "Chuyên viên Kinh doanh", "Nhân viên Marketing", "Chuyên viên SEO/Digital"],
    ),
    (
        "Phòng Điều hành Tour",
        ["Trưởng phòng Điều hành", "Điều hành viên Tour nội địa", "Điều hành viên Tour quốc tế"],
    ),
    (
        "Phòng Hướng dẫn viên",
        [
            "Hướng dẫn viên Tour nội địa",
            "Hướng dẫn viên Tour quốc tế",
            "Hướng dẫn viên tiếng Anh",
            "Hướng dẫn viên tiếng Hoa",
        ],
    ),
    ("Phòng Vận chuyển", ["Trưởng phòng Vận chuyển", "Lái xe", "Nhân viên điều phối xe"]),
    ("Phòng Công nghệ thông tin", ["Trưởng phòng IT", "Lập trình viên", "Quản trị hệ thống"]),
    ("Phòng Hành chính - Lễ tân", ["Lễ tân", "Nhân viên hành chính", "Bảo vệ"]),
    ("Phòng Chăm sóc khách hàng", ["Trưởng phòng CSKH", "Chuyên viên CSKH", "Nhân viên tư vấn"]),
]

WORK_TYPES = [
    "Văn phòng",
    "Làm việc từ xa",
    "Lai (Hybrid)",
    "Thực địa / Tour",
]

# Ca làm việc đặc thù du lịch
# (name, weekly_full_time, full_time)
EMPLOYEE_SHIFTS = [
    # Ca hành chính văn phòng tiêu chuẩn
    ("Ca hành chính (8h–17h)", "40:00", "200:00"),
    # Hướng dẫn viên có thể bắt đầu sớm hơn (6h–15h)
    ("Ca hướng dẫn viên sáng (6h–15h)", "40:00", "200:00"),
    # Hướng dẫn viên tour chiều - tối
    ("Ca hướng dẫn viên chiều (13h–22h)", "40:00", "200:00"),
    # Lái xe và điều phối vận chuyển
    ("Ca lái xe sáng (5h–14h)", "40:00", "200:00"),
    ("Ca lái xe chiều (13h–22h)", "40:00", "200:00"),
    # Ca cuối tuần / lễ (cho lễ tân, CSKH trực)
    ("Ca cuối tuần (8h–17h, T7–CN)", "16:00", "80:00"),
    # Tour dài ngày — nhân viên có thể làm việc linh hoạt ngoài văn phòng
    ("Ca Tour dài ngày (linh hoạt)", "40:00", "200:00"),
    # Ca dịch vụ: sáng + chiều T2-T6, sáng T7
    ("Ca Dịch Vụ (T2-T6 sáng+chiều, T7 sáng)", "44:00", "220:00"),
]

# Per-day schedules for each shift: {shift_name: [(day, start, end, min_hours)]}
# Days NOT listed = off (no EmployeeShiftSchedule record → shows Nghỉ)
SHIFT_SCHEDULES = {
    "Ca hành chính (8h–17h)": [
        ("monday",    "08:00", "17:00", "08:15"),
        ("tuesday",   "08:00", "17:00", "08:15"),
        ("wednesday", "08:00", "17:00", "08:15"),
        ("thursday",  "08:00", "17:00", "08:15"),
        ("friday",    "08:00", "17:00", "08:15"),
    ],
    "Ca hướng dẫn viên sáng (6h–15h)": [
        ("monday",    "06:00", "15:00", "08:15"),
        ("tuesday",   "06:00", "15:00", "08:15"),
        ("wednesday", "06:00", "15:00", "08:15"),
        ("thursday",  "06:00", "15:00", "08:15"),
        ("friday",    "06:00", "15:00", "08:15"),
        ("saturday",  "06:00", "15:00", "08:15"),
    ],
    "Ca hướng dẫn viên chiều (13h–22h)": [
        ("monday",    "13:00", "22:00", "08:15"),
        ("tuesday",   "13:00", "22:00", "08:15"),
        ("wednesday", "13:00", "22:00", "08:15"),
        ("thursday",  "13:00", "22:00", "08:15"),
        ("friday",    "13:00", "22:00", "08:15"),
        ("saturday",  "13:00", "22:00", "08:15"),
    ],
    "Ca lái xe sáng (5h–14h)": [
        ("monday",    "05:00", "14:00", "08:15"),
        ("tuesday",   "05:00", "14:00", "08:15"),
        ("wednesday", "05:00", "14:00", "08:15"),
        ("thursday",  "05:00", "14:00", "08:15"),
        ("friday",    "05:00", "14:00", "08:15"),
        ("saturday",  "05:00", "14:00", "08:15"),
    ],
    "Ca lái xe chiều (13h–22h)": [
        ("monday",    "13:00", "22:00", "08:15"),
        ("tuesday",   "13:00", "22:00", "08:15"),
        ("wednesday", "13:00", "22:00", "08:15"),
        ("thursday",  "13:00", "22:00", "08:15"),
        ("friday",    "13:00", "22:00", "08:15"),
        ("saturday",  "13:00", "22:00", "08:15"),
    ],
    "Ca cuối tuần (8h–17h, T7–CN)": [
        ("saturday", "08:00", "17:00", "08:15"),
        ("sunday",   "08:00", "17:00", "08:15"),
    ],
    "Ca Tour dài ngày (linh hoạt)": [
        ("monday",    "06:00", "22:00", "08:15"),
        ("tuesday",   "06:00", "22:00", "08:15"),
        ("wednesday", "06:00", "22:00", "08:15"),
        ("thursday",  "06:00", "22:00", "08:15"),
        ("friday",    "06:00", "22:00", "08:15"),
        ("saturday",  "06:00", "22:00", "08:15"),
        ("sunday",    "06:00", "22:00", "08:15"),
    ],
    # Ca Dịch Vụ: split schedule (sáng + chiều), T7 chỉ sáng
    # Tuple format: (day, start1, end1, min_hours, start2_or_None, end2_or_None)
    "Ca Dịch Vụ (T2-T6 sáng+chiều, T7 sáng)": [
        ("monday",    "08:00", "12:00", "07:30", "13:30", "17:30"),
        ("tuesday",   "08:00", "12:00", "07:30", "13:30", "17:30"),
        ("wednesday", "08:00", "12:00", "07:30", "13:30", "17:30"),
        ("thursday",  "08:00", "12:00", "07:30", "13:30", "17:30"),
        ("friday",    "08:00", "12:00", "07:30", "13:30", "17:30"),
        ("saturday",  "08:00", "12:00", "03:30", None,    None),
    ],
}

# Loại nghỉ phép theo đúng Luật Lao động VN + đặc thù du lịch
# (name, payment, total_days, color, is_paid_note)
LEAVE_TYPES = [
    # Nghỉ phép năm — 12 ngày/năm theo luật (đủ 1 năm thâm niên)
    {
        "name": "Nghỉ phép năm",
        "payment": "paid",
        "total_days": 12,
        "color": "#10b981",
        "reset": True,
        "reset_based": "annual",
        "reset_month": "january",
        "reset_day": "1",
        "carryforward_type": "transfer",
        "carryforward_max": 5,
        "require_approval": "yes",
    },
    # Nghỉ ốm — có giấy xác nhận y tế
    {
        "name": "Nghỉ ốm / Bệnh",
        "payment": "unpaid",
        "total_days": 30,
        "color": "#f59e0b",
        "reset": True,
        "reset_based": "annual",
        "reset_month": "january",
        "reset_day": "1",
        "carryforward_type": "no carryforward",
        "require_approval": "yes",
    },
    # Nghỉ thai sản — 6 tháng theo BHXH
    {
        "name": "Nghỉ thai sản",
        "payment": "paid",
        "total_days": 180,
        "color": "#ec4899",
        "reset": False,
        "carryforward_type": "no carryforward",
        "require_approval": "yes",
    },
    # Nghỉ cưới — 3 ngày (bản thân kết hôn)
    {
        "name": "Nghỉ kết hôn",
        "payment": "paid",
        "total_days": 3,
        "color": "#8b5cf6",
        "reset": False,
        "carryforward_type": "no carryforward",
        "require_approval": "yes",
    },
    # Nghỉ tang — 3 ngày (cha, mẹ, vợ/chồng, con)
    {
        "name": "Nghỉ tang",
        "payment": "paid",
        "total_days": 3,
        "color": "#6b7280",
        "reset": False,
        "carryforward_type": "no carryforward",
        "require_approval": "yes",
    },
    # Nghỉ bù — áp dụng khi làm thêm ngày lễ/cuối tuần (đặc thù du lịch)
    {
        "name": "Nghỉ bù Tour / Lễ",
        "payment": "paid",
        "total_days": 30,
        "color": "#c0222b",
        "reset": True,
        "reset_based": "annual",
        "reset_month": "december",
        "reset_day": "31",
        "carryforward_type": "no carryforward",
        "require_approval": "yes",
    },
    # Nghỉ không lương — theo thỏa thuận
    {
        "name": "Nghỉ không lương",
        "payment": "unpaid",
        "total_days": 30,
        "color": "#94a3b8",
        "reset": False,
        "carryforward_type": "no carryforward",
        "require_approval": "yes",
    },
    # Nghỉ chăm con ốm
    {
        "name": "Nghỉ chăm sóc con ốm",
        "payment": "unpaid",
        "total_days": 20,
        "color": "#06b6d4",
        "reset": True,
        "reset_based": "annual",
        "reset_month": "january",
        "reset_day": "1",
        "carryforward_type": "no carryforward",
        "require_approval": "yes",
    },
]


class Command(BaseCommand):
    help = "Khởi tạo dữ liệu ban đầu cho Công ty Du lịch Hồng Ngọc Hà"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Tạo lại / cập nhật dù đã tồn tại",
        )
        parser.add_argument(
            "--skip-leave",
            action="store_true",
            help="Bỏ qua bước tạo loại nghỉ phép",
        )
        parser.add_argument(
            "--skip-shift",
            action="store_true",
            help="Bỏ qua bước tạo ca làm việc",
        )

    def handle(self, *args, **options):
        force = options.get("force", False)

        # ── 1. Company ──────────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[1/6] Công ty"))
        company, created = Company.objects.get_or_create(
            company="Công ty Du lịch Hồng Ngọc Hà",
            defaults={
                "hq": True,
                "address": "268 Tô Hiến Thành, Phường 15, Quận 10, TP. Hồ Chí Minh",
                "country": "Việt Nam",
                "state": "Hồ Chí Minh",
                "city": "Hồ Chí Minh",
                "zip": "700000",
                "date_format": "DD/MM/YYYY",
                "time_format": "HH:mm",
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"  ✔ Đã tạo công ty: {company}"))
        elif force:
            company.hq = True
            company.address = "268 Tô Hiến Thành, Phường 15, Quận 10, TP. Hồ Chí Minh"
            company.country = "Việt Nam"
            company.state = "Hồ Chí Minh"
            company.city = "Hồ Chí Minh"
            company.zip = "700000"
            company.date_format = "DD/MM/YYYY"
            company.time_format = "HH:mm"
            company.save()
            self.stdout.write(self.style.WARNING(f"  ↺ Đã cập nhật công ty: {company}"))
        else:
            self.stdout.write(f"    Công ty đã tồn tại: {company}")

        # ── 2. Departments ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[2/6] Phòng ban"))
        dept_map = {}
        for dept_name in DEPARTMENTS:
            dept, created = Department.objects.get_or_create(department=dept_name)
            if company not in dept.company_id.all():
                dept.company_id.add(company)
            dept_map[dept_name] = dept
            mark = "✔" if created else " "
            self.stdout.write(f"  {mark} {dept_name}")

        # ── 3. Job Positions ────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[3/6] Vị trí công việc"))
        for dept_name, positions in JOB_POSITIONS:
            dept = dept_map.get(dept_name)
            if not dept:
                continue
            for pos_name in positions:
                pos, created = JobPosition.objects.get_or_create(
                    job_position=pos_name,
                    department_id=dept,
                )
                mark = "✔" if created else " "
                self.stdout.write(f"    {mark} {pos_name}")

        # ── 4. Work Types ───────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[4/6] Loại hình công việc"))
        for wt_name in WORK_TYPES:
            wt, created = WorkType.objects.get_or_create(work_type=wt_name)
            mark = "✔" if created else " "
            self.stdout.write(f"  {mark} {wt_name}")

        # ── 5. Employee Shifts ──────────────────────────────────────────
        if not options.get("skip_shift"):
            self.stdout.write(self.style.MIGRATE_HEADING("\n[5/6] Ca làm việc"))
            for shift_name, weekly_ft, full_ft in EMPLOYEE_SHIFTS:
                shift, created = EmployeeShift.objects.get_or_create(
                    employee_shift=shift_name,
                    defaults={
                        "weekly_full_time": weekly_ft,
                        "full_time": full_ft,
                    },
                )
                if created and company not in shift.company_id.all():
                    shift.company_id.add(company)
                elif force and not created:
                    shift.weekly_full_time = weekly_ft
                    shift.full_time = full_ft
                    shift.save()
                    if company not in shift.company_id.all():
                        shift.company_id.add(company)
                mark = "✔" if created else " "
                self.stdout.write(f"  {mark} {shift_name}")

            # Create per-day schedules for each shift
            self.stdout.write(self.style.MIGRATE_HEADING("\n[5b] Lịch ngày trong ca"))
            day_objs = {d.day: d for d in EmployeeShiftDay.objects.all()}
            from datetime import time as dtime

            def _t(s):
                h, m = map(int, s.split(":"))
                return dtime(h, m)

            for shift_name, day_entries in SHIFT_SCHEDULES.items():
                try:
                    shift = EmployeeShift.objects.get(employee_shift=shift_name)
                except EmployeeShift.DoesNotExist:
                    continue
                for entry in day_entries:
                    day_name, start, end, min_h = entry[0], entry[1], entry[2], entry[3]
                    start2 = entry[4] if len(entry) > 4 else None
                    end2   = entry[5] if len(entry) > 5 else None
                    day_obj = day_objs.get(day_name)
                    if not day_obj:
                        continue
                    defaults = {
                        "start_time": _t(start),
                        "end_time": _t(end),
                        "minimum_working_hour": min_h,
                        "start_time_2": _t(start2) if start2 else None,
                        "end_time_2": _t(end2) if end2 else None,
                    }
                    sched, created = EmployeeShiftSchedule.objects.get_or_create(
                        shift_id=shift, day=day_obj, defaults=defaults,
                    )
                    if force and not created:
                        for k, v in defaults.items():
                            setattr(sched, k, v)
                        sched.save()
                mark = "✔"
                self.stdout.write(f"  {mark} {shift_name}")
        else:
            self.stdout.write("  [bỏ qua ca làm việc]")

        # ── 6. Leave Types ──────────────────────────────────────────────
        if not options.get("skip_leave"):
            self.stdout.write(self.style.MIGRATE_HEADING("\n[6/6] Loại nghỉ phép"))
            try:
                from leave.models import LeaveType
                for lt_cfg in LEAVE_TYPES:
                    name = lt_cfg["name"]
                    defaults = {
                        "payment":          lt_cfg.get("payment", "unpaid"),
                        "total_days":       lt_cfg.get("total_days", 1),
                        "color":            lt_cfg.get("color", "#6b7280"),
                        "reset":            lt_cfg.get("reset", False),
                        "reset_based":      lt_cfg.get("reset_based", None),
                        "reset_month":      lt_cfg.get("reset_month", ""),
                        "reset_day":        lt_cfg.get("reset_day", None),
                        "carryforward_type": lt_cfg.get("carryforward_type", "no carryforward"),
                        "carryforward_max": lt_cfg.get("carryforward_max", None),
                        "require_approval": lt_cfg.get("require_approval", "yes"),
                        "limit_leave":      True,
                        "count":            1,
                        "period_in":        "day",
                    }
                    lt, created = LeaveType.objects.get_or_create(name=name, defaults=defaults)
                    if force and not created:
                        for field, val in defaults.items():
                            setattr(lt, field, val)
                        lt.save()
                    mark = "✔" if created else " "
                    self.stdout.write(f"  {mark} {name} ({lt_cfg['payment']}, {lt_cfg['total_days']} ngày)")
            except Exception as exc:
                self.stdout.write(self.style.WARNING(f"  ⚠ Không thể tạo loại nghỉ phép: {exc}"))
        else:
            self.stdout.write("  [bỏ qua loại nghỉ phép]")

        self.stdout.write(self.style.SUCCESS("\n✅ Hoàn tất khởi tạo dữ liệu Công ty Hồng Ngọc Hà!"))
        self.stdout.write(
            "   Bước tiếp theo:\n"
            "   • Vào Admin > Companies để upload logo công ty\n"
            "   • Vào Leave > Leave Types để điều chỉnh ngày phép chi tiết\n"
            "   • Vào Attendance > Shifts để cấu hình lịch từng ca\n"
        )

"""
Import nhân viên HNH từ file Excel (DSNV.report).

Usage:
    python manage.py import_hnh_employees "path/to/DSNV.report.xlsx"
    python manage.py import_hnh_employees "path/to/file.xlsx" --dry-run
    python manage.py import_hnh_employees "path/to/file.xlsx" --only-active
    python manage.py import_hnh_employees "path/to/file.xlsx" --update
"""

import re
from datetime import datetime

import openpyxl
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from base.models import (
    Company,
    Department,
    EmployeeShift,
    EmployeeType,
    JobPosition,
    JobRole,
    WorkType,
)
from employee.models import Employee, EmployeeBankDetails, EmployeeWorkInformation

# ── Column index mapping (0-based) ──────────────────────────────────────────
COL = {
    "ma_ns": 0,
    "ho_ten": 1,
    "ho_dem": 2,
    "ten": 3,
    "tai_khoan": 4,
    "trang_thai": 5,
    "chuc_danh": 7,
    "phan_loai_ns": 8,
    "khu_vuc": 10,
    "van_phong": 11,
    "vi_tri": 12,
    "loai_vi_tri": 13,
    "dien_thoai": 14,
    "email": 15,
    "ngay_sinh": 22,
    "gioi_tinh": 23,
    "ngay_bat_dau": 24,
    "ngay_chinh_thuc": 25,
    "ngay_nghi_viec": 26,
    "ly_do_nghi": 27,
    "luong": 34,
    "luong_co_ban": 35,
    "so_tk_nh": 37,
    "ten_tk_nh": 38,
    "ten_nh": 39,
    "chi_nhanh_nh": 40,
    "ma_so_thue": 42,
    "so_cccd": 43,
    "ngay_cap_cccd": 44,
    "noi_cap_cccd": 45,
    "hon_nhan": 46,
    "so_bhxh": 50,
    "dia_chi": 52,
    "noi_sinh": 53,
    "lich_lv": 54,
    "ma_cham_cong": 65,
    "quan_ly_m1": 67,
    "ho_khau": 75,
    "quoc_tich": 76,
    "dan_toc": 77,
}

# ── Mapping Excel values → Horilla field values ─────────────────────────────
GENDER_MAP = {
    "nam": "male",
    "nữ": "female",
    "khác": "other",
}

MARITAL_MAP = {
    "chưa kết hôn": "single",
    "đã kết hôn": "married",
    "ly hôn": "divorced",
    "divorced": "divorced",
}

# Excel "Phân loại nhân sự" → Horilla EmployeeType
EMPLOYEE_TYPE_MAP = {
    "Chính thức": "Chính thức",
    "Thử việc": "Thử việc",
    "Học việc": "Học việc",
    "Công tác viên": "Công tác viên",
}

# Excel "Văn phòng" → Horilla WorkType (work location concept)
OFFICE_LOCATION_MAP = {
    "VĂN PHÒNG CHÍNH (HCM)": "HCM",
    "CHI NHÁNH HÀ NỘI (HAN)": "Hà Nội",
    "CHI NHÁNH ĐÀ NẴNG (DAD)": "Đà Nẵng",
    "Công ty Cổ Phần Du Lịch Beyond": "Beyond",
}


def cell(row, key):
    idx = COL[key]
    val = row[idx] if idx < len(row) else None
    if val is None:
        return ""
    return str(val).strip()


def parse_date(val):
    if not val:
        return None
    val = str(val).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def parse_money(val):
    if not val:
        return 0
    val = str(val).strip().replace(",", "").replace(".", "")
    try:
        return int(val)
    except ValueError:
        return 0


def clean_phone(val):
    if not val:
        return ""
    cleaned = re.sub(r"[^\d+]", "", str(val))
    return cleaned[:25]


class Command(BaseCommand):
    help = "Import nhân viên HNH từ file Excel DSNV report"

    def add_arguments(self, parser):
        parser.add_argument("file", help="Đường dẫn file Excel (.xlsx)")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Chỉ phân tích, không ghi DB",
        )
        parser.add_argument(
            "--only-active",
            action="store_true",
            help="Chỉ import nhân viên đang làm (bỏ Nghỉ việc)",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Cập nhật nhân viên đã tồn tại (match theo badge_id hoặc email)",
        )
        parser.add_argument(
            "--sheet",
            default="sheet-1",
            help="Tên sheet chứa dữ liệu (mặc định: sheet-1)",
        )

    def handle(self, *args, **options):
        file_path = options["file"]
        dry_run = options["dry_run"]
        only_active = options["only_active"]
        update = options["update"]
        sheet_name = options["sheet"]

        try:
            wb = openpyxl.load_workbook(file_path, data_only=True)
        except Exception as e:
            raise CommandError(f"Không đọc được file: {e}")

        if sheet_name not in wb.sheetnames:
            raise CommandError(
                f"Sheet '{sheet_name}' không tồn tại. Có: {wb.sheetnames}"
            )

        ws = wb[sheet_name]
        rows = list(ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True))
        rows = [r for r in rows if r[0]]  # bỏ dòng trống

        self.stdout.write(f"Đọc được {len(rows)} nhân viên từ file")

        if only_active:
            before = len(rows)
            rows = [r for r in rows if cell(r, "trang_thai") != "Nghỉ việc"]
            self.stdout.write(
                f"Lọc chỉ nhân viên đang làm: {len(rows)} (bỏ {before - len(rows)} nghỉ việc)"
            )

        company = Company.objects.filter(hq=True).first()
        if not company:
            company = Company.objects.first()
        if not company:
            raise CommandError(
                "Chưa có Company trong DB. Chạy: python manage.py setup_hnh_company"
            )

        self.stdout.write(f"Company: {company.company}")

        # Pre-build lookup caches
        dept_cache = {}
        position_cache = {}
        role_cache = {}
        type_cache = {}
        shift_cache = {}

        stats = {
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "errors": [],
            "depts_created": 0,
            "positions_created": 0,
            "roles_created": 0,
            "types_created": 0,
            "shifts_created": 0,
        }

        if dry_run:
            self.stdout.write(self.style.WARNING("\n── DRY RUN — không ghi DB ──\n"))
            self._dry_run_analysis(rows, stats)
            return

        with transaction.atomic():
            for i, row in enumerate(rows, 1):
                try:
                    self._import_row(
                        row, company, update,
                        dept_cache, position_cache, role_cache,
                        type_cache, shift_cache, stats,
                    )
                except Exception as e:
                    ma = cell(row, "ma_ns")
                    stats["errors"].append(f"[{ma}] {e}")
                    stats["skipped"] += 1

                if i % 50 == 0:
                    self.stdout.write(f"  ... {i}/{len(rows)}")

        self.stdout.write(self.style.SUCCESS(f"\n{'='*50}"))
        self.stdout.write(self.style.SUCCESS(f"Import hoàn tất:"))
        self.stdout.write(f"  Tạo mới:     {stats['created']}")
        self.stdout.write(f"  Cập nhật:    {stats['updated']}")
        self.stdout.write(f"  Bỏ qua:     {stats['skipped']}")
        self.stdout.write(f"  Phòng ban:   +{stats['depts_created']}")
        self.stdout.write(f"  Vị trí:      +{stats['positions_created']}")
        self.stdout.write(f"  Chức danh:   +{stats['roles_created']}")
        self.stdout.write(f"  Loại NV:     +{stats['types_created']}")
        self.stdout.write(f"  Ca làm:      +{stats['shifts_created']}")

        if stats["errors"]:
            self.stdout.write(self.style.ERROR(f"\nLỗi ({len(stats['errors'])}):"))
            for err in stats["errors"][:20]:
                self.stdout.write(f"  {err}")
            if len(stats["errors"]) > 20:
                self.stdout.write(f"  ... và {len(stats['errors'])-20} lỗi khác")

    def _get_or_create_dept(self, name, company, cache, stats):
        if not name:
            return None
        key = name.strip()
        if key in cache:
            return cache[key]
        dept, created = Department.objects.get_or_create(department=key)
        if created or not dept.company_id.filter(pk=company.pk).exists():
            dept.company_id.add(company)
        if created:
            stats["depts_created"] += 1
        cache[key] = dept
        return dept

    def _get_or_create_position(self, name, dept, company, cache, stats):
        if not name or not dept:
            return None
        key = (name.strip()[:50], dept.pk)
        if key in cache:
            return cache[key]
        pos, created = JobPosition.objects.get_or_create(
            job_position=name.strip()[:50],
            department_id=dept,
        )
        if created or not pos.company_id.filter(pk=company.pk).exists():
            pos.company_id.add(company)
        if created:
            stats["positions_created"] += 1
        cache[key] = pos
        return pos

    def _get_or_create_role(self, name, position, company, cache, stats):
        if not name or not position:
            return None
        key = (name.strip()[:50], position.pk)
        if key in cache:
            return cache[key]
        role, created = JobRole.objects.get_or_create(
            job_role=name.strip()[:50],
            job_position_id=position,
        )
        if created or not role.company_id.filter(pk=company.pk).exists():
            role.company_id.add(company)
        if created:
            stats["roles_created"] += 1
        cache[key] = role
        return role

    def _get_or_create_emp_type(self, name, company, cache, stats):
        if not name:
            return None
        key = name.strip()
        if key in cache:
            return cache[key]
        et, created = EmployeeType.objects.get_or_create(employee_type=key)
        if created or not et.company_id.filter(pk=company.pk).exists():
            et.company_id.add(company)
        if created:
            stats["types_created"] += 1
        cache[key] = et
        return et

    def _get_or_create_shift(self, name, company, cache, stats):
        if not name:
            return None
        key = name.strip()
        if key in cache:
            return cache[key]
        shift, created = EmployeeShift.objects.get_or_create(employee_shift=key)
        if created or not shift.company_id.filter(pk=company.pk).exists():
            shift.company_id.add(company)
        if created:
            stats["shifts_created"] += 1
        cache[key] = shift
        return shift

    def _import_row(
        self, row, company, update,
        dept_cache, position_cache, role_cache,
        type_cache, shift_cache, stats,
    ):
        ma_ns = cell(row, "ma_ns")
        ho_dem = cell(row, "ho_dem")
        ten = cell(row, "ten")
        email_val = cell(row, "email").lower()
        phone = clean_phone(cell(row, "dien_thoai"))
        trang_thai = cell(row, "trang_thai")

        if not ten:
            parts = cell(row, "ho_ten").rsplit(maxsplit=1)
            ho_dem = parts[0] if len(parts) > 1 else ""
            ten = parts[-1] if parts else ma_ns

        if not email_val:
            email_val = f"{ma_ns.lower()}@hongngocha.com"

        if not phone:
            phone = "0000000000"

        # Check existing employee
        existing = None
        if update:
            existing = Employee.objects.filter(badge_id=ma_ns).first()
            if not existing:
                existing = Employee.objects.filter(email=email_val).first()

        if not update and not existing:
            if Employee.objects.filter(badge_id=ma_ns).exists():
                stats["skipped"] += 1
                return
            if Employee.objects.filter(email=email_val).exists():
                stats["skipped"] += 1
                return

        # ── Employee ────────────────────────────────────────────────
        gender = GENDER_MAP.get(cell(row, "gioi_tinh").lower(), "")
        marital = MARITAL_MAP.get(cell(row, "hon_nhan").lower(), "")
        dob = parse_date(cell(row, "ngay_sinh"))
        is_active = trang_thai != "Nghỉ việc"

        address_parts = []
        dia_chi = cell(row, "dia_chi")
        ho_khau = cell(row, "ho_khau")
        if dia_chi:
            address_parts.append(dia_chi)
        elif ho_khau:
            address_parts.append(ho_khau)
        address = "; ".join(address_parts)[:200] if address_parts else ""

        # additional_info for fields without dedicated Horilla columns
        additional = {}
        so_cccd = cell(row, "so_cccd")
        if so_cccd:
            additional["so_cccd"] = so_cccd
        ngay_cap = cell(row, "ngay_cap_cccd")
        if ngay_cap:
            additional["ngay_cap_cccd"] = ngay_cap
        noi_cap = cell(row, "noi_cap_cccd")
        if noi_cap:
            additional["noi_cap_cccd"] = noi_cap
        mst = cell(row, "ma_so_thue")
        if mst:
            additional["ma_so_thue"] = mst
        bhxh = cell(row, "so_bhxh")
        if bhxh:
            additional["so_bhxh"] = bhxh
        quoc_tich = cell(row, "quoc_tich")
        if quoc_tich:
            additional["quoc_tich"] = quoc_tich
        dan_toc = cell(row, "dan_toc")
        if dan_toc:
            additional["dan_toc"] = dan_toc
        noi_sinh = cell(row, "noi_sinh")
        if noi_sinh:
            additional["noi_sinh"] = noi_sinh
        if ho_khau:
            additional["ho_khau_thuong_tru"] = ho_khau
        ly_do_nghi = cell(row, "ly_do_nghi")
        if ly_do_nghi:
            additional["ly_do_nghi_viec"] = ly_do_nghi
        ngay_nghi = cell(row, "ngay_nghi_viec")
        if ngay_nghi:
            additional["ngay_nghi_viec"] = ngay_nghi
        ma_cham_cong = cell(row, "ma_cham_cong")
        if ma_cham_cong:
            additional["ma_cham_cong"] = ma_cham_cong

        emp_data = {
            "employee_first_name": ten,
            "employee_last_name": ho_dem,
            "phone": phone,
            "badge_id": ma_ns,
            "gender": gender,
            "dob": dob,
            "marital_status": marital,
            "address": address,
            "country": "Việt Nam",
            "is_active": is_active,
            "additional_info": additional or None,
        }

        if existing:
            for k, v in emp_data.items():
                if v or k in ("is_active", "additional_info"):
                    setattr(existing, k, v)
            existing.save()
            emp = existing
            stats["updated"] += 1
        else:
            user = User.objects.create_user(
                username=email_val,
                email=email_val,
                password=f"Hnh@{ma_ns}",
                first_name=ten,
                last_name=ho_dem,
                is_active=is_active,
            )
            emp = Employee.objects.create(
                employee_user_id=user,
                email=email_val,
                **emp_data,
            )
            stats["created"] += 1

        # ── Work Information ────────────────────────────────────────
        khu_vuc = cell(row, "khu_vuc")
        vi_tri = cell(row, "vi_tri")
        chuc_danh = cell(row, "chuc_danh")
        phan_loai = EMPLOYEE_TYPE_MAP.get(cell(row, "phan_loai_ns"), "")
        van_phong = cell(row, "van_phong")
        lich_lv = cell(row, "lich_lv")
        ngay_bat_dau = parse_date(cell(row, "ngay_bat_dau"))
        luong_co_ban = parse_money(cell(row, "luong_co_ban"))

        dept = self._get_or_create_dept(khu_vuc, company, dept_cache, stats)
        position = self._get_or_create_position(vi_tri, dept, company, position_cache, stats)
        role = self._get_or_create_role(chuc_danh, position, company, role_cache, stats)
        emp_type = self._get_or_create_emp_type(phan_loai, company, type_cache, stats) if phan_loai else None
        shift = self._get_or_create_shift(lich_lv, company, shift_cache, stats)

        location = OFFICE_LOCATION_MAP.get(van_phong, van_phong)

        work_data = {
            "company_id": company,
            "department_id": dept,
            "job_position_id": position,
            "job_role_id": role,
            "employee_type_id": emp_type,
            "shift_id": shift,
            "location": location[:50] if location else "",
            "date_joining": ngay_bat_dau,
            "basic_salary": luong_co_ban,
            "email": email_val,
            "mobile": phone,
        }

        wi, _ = EmployeeWorkInformation.objects.get_or_create(employee_id=emp)
        for k, v in work_data.items():
            if v is not None:
                setattr(wi, k, v)
        wi.save()

        # ── Bank Details ────────────────────────────────────────────
        so_tk = cell(row, "so_tk_nh")
        if so_tk:
            ten_nh = cell(row, "ten_nh")
            ten_tk = cell(row, "ten_tk_nh")
            chi_nhanh = cell(row, "chi_nhanh_nh")

            bank, _ = EmployeeBankDetails.objects.get_or_create(employee_id=emp)
            bank.bank_name = ten_nh[:50] if ten_nh else ""
            bank.account_number = so_tk[:50]
            bank.branch = chi_nhanh[:50] if chi_nhanh else ""
            bank.any_other_code1 = ten_tk[:50] if ten_tk else ""
            bank.save()

    def _dry_run_analysis(self, rows, stats):
        emails = set()
        badges = set()
        depts = set()
        positions = set()
        roles = set()
        types = set()
        shifts = set()
        issues = []

        for row in rows:
            ma = cell(row, "ma_ns")
            email_val = cell(row, "email").lower()
            if not email_val:
                email_val = f"{ma.lower()}@hongngocha.com"
                issues.append(f"[{ma}] Email trống → tự tạo: {email_val}")

            phone = clean_phone(cell(row, "dien_thoai"))
            if not phone:
                issues.append(f"[{ma}] SĐT trống → dùng placeholder")

            if email_val in emails:
                issues.append(f"[{ma}] Email trùng: {email_val}")
            emails.add(email_val)

            if ma in badges:
                issues.append(f"[{ma}] Mã nhân sự trùng!")
            badges.add(ma)

            khu_vuc = cell(row, "khu_vuc")
            if khu_vuc:
                depts.add(khu_vuc)

            vi_tri = cell(row, "vi_tri")
            if vi_tri and khu_vuc:
                positions.add((vi_tri, khu_vuc))

            chuc_danh = cell(row, "chuc_danh")
            if chuc_danh and vi_tri:
                roles.add((chuc_danh, vi_tri))

            phan_loai = cell(row, "phan_loai_ns")
            if phan_loai:
                types.add(phan_loai)

            lich_lv = cell(row, "lich_lv")
            if lich_lv:
                shifts.add(lich_lv)

        # Check against existing DB
        existing_badges = set(
            Employee.objects.filter(badge_id__in=badges).values_list("badge_id", flat=True)
        )
        existing_emails = set(
            Employee.objects.filter(email__in=emails).values_list("email", flat=True)
        )

        self.stdout.write(f"\nTổng nhân viên sẽ import: {len(rows)}")
        self.stdout.write(f"  Đã tồn tại (badge_id): {len(existing_badges)}")
        self.stdout.write(f"  Đã tồn tại (email):    {len(existing_emails - set())}")
        self.stdout.write(f"  Mới hoàn toàn:         {len(badges - existing_badges)}")

        self.stdout.write(f"\nSẽ tạo/cập nhật:")
        self.stdout.write(f"  Phòng ban:       {len(depts)}")
        for d in sorted(depts):
            marker = " (mới)" if not Department.objects.filter(department=d).exists() else ""
            self.stdout.write(f"    - {d}{marker}")

        self.stdout.write(f"  Vị trí:          {len(positions)}")
        self.stdout.write(f"  Chức danh:       {len(roles)}")
        self.stdout.write(f"  Loại NV:         {len(types)} → {types}")
        self.stdout.write(f"  Ca/Lịch LV:      {len(shifts)}")
        for s in sorted(shifts):
            marker = " (mới)" if not EmployeeShift.objects.filter(employee_shift=s).exists() else ""
            self.stdout.write(f"    - {s}{marker}")

        if issues:
            self.stdout.write(self.style.WARNING(f"\nCảnh báo ({len(issues)}):"))
            for issue in issues[:30]:
                self.stdout.write(f"  {issue}")
            if len(issues) > 30:
                self.stdout.write(f"  ... và {len(issues)-30} cảnh báo khác")

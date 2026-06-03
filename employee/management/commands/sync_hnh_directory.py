"""
Đồng bộ thông tin nhân viên từ file Danh Bạ HNH (DanhBaNhanVien*.xlsx).

Cập nhật: số điện thoại, giới tính, email công việc, quản lý trực tiếp.
Match ưu tiên: badge_id → email.

Usage:
    python manage.py sync_hnh_directory "path/to/DanhBaNhanVien.xlsx"
    python manage.py sync_hnh_directory "path/to/file.xlsx" --dry-run
"""

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from employee.models import Employee, EmployeeWorkInformation


def _str(val):
    return str(val).strip() if val else ""


class Command(BaseCommand):
    help = "Sync employee phone/gender/email/manager from HNH directory Excel"

    def add_arguments(self, parser):
        parser.add_argument("excel_path", help="Path to DanhBaNhanVien*.xlsx")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without saving",
        )

    def handle(self, *args, **options):
        path = options["excel_path"]
        dry = options["dry_run"]

        # ── 1. Parse Excel ──────────────────────────────────────────────────
        try:
            wb = openpyxl.load_workbook(path)
        except FileNotFoundError:
            raise CommandError(f"File not found: {path}")

        ws = wb.active
        rows = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            maNV = _str(row[3])
            if not maNV or maNV.startswith("=") or maNV == "Mã NV":
                continue
            gender_raw = _str(row[5])
            rows.append(
                {
                    "badge_id": maNV,
                    "gender": "female" if "ữ" in gender_raw else "male",
                    "phone": _str(row[8]),
                    "email": _str(row[9]).lower(),
                    "manager_badge": _str(row[10]),
                }
            )

        self.stdout.write(f"Excel: {len(rows)} dòng nhân viên")

        # ── 2. Build lookup maps ────────────────────────────────────────────
        emp_by_badge: dict[str, Employee] = {}
        emp_by_email: dict[str, Employee] = {}
        for emp in Employee.objects.all():
            if emp.badge_id:
                emp_by_badge[emp.badge_id.strip()] = emp
            if emp.email:
                emp_by_email[emp.email.strip().lower()] = emp

        self.stdout.write(
            f"DB: {len(emp_by_badge)} có badge_id | {len(emp_by_email)} có email"
        )

        def find_emp(badge, email):
            if badge and badge in emp_by_badge:
                return emp_by_badge[badge], "badge"
            if email and email in emp_by_email:
                return emp_by_email[email], "email"
            return None, None

        # ── 3. Process ──────────────────────────────────────────────────────
        emp_updated = 0
        work_updated = 0
        not_found = []
        mgr_not_found = []

        with transaction.atomic():
            for r in rows:
                emp, match_by = find_emp(r["badge_id"], r["email"])
                if emp is None:
                    not_found.append(r["badge_id"])
                    continue

                # --- Employee base fields ---
                emp_fields = []
                if r["gender"] and emp.gender != r["gender"]:
                    emp.gender = r["gender"]
                    emp_fields.append("gender")
                if r["phone"] and emp.phone != r["phone"]:
                    emp.phone = r["phone"]
                    emp_fields.append("phone")
                if match_by == "email" and r["badge_id"] and emp.badge_id != r["badge_id"]:
                    if r["badge_id"] not in emp_by_badge:
                        emp.badge_id = r["badge_id"]
                        emp_by_badge[r["badge_id"]] = emp
                        emp_fields.append("badge_id")

                if emp_fields:
                    if not dry:
                        emp.save(update_fields=emp_fields)
                    emp_updated += 1
                    if options["verbosity"] >= 2:
                        self.stdout.write(f"  emp {r['badge_id']}: {emp_fields}")

                # --- EmployeeWorkInformation ---
                try:
                    wi = EmployeeWorkInformation.objects.get(employee_id=emp)
                except EmployeeWorkInformation.DoesNotExist:
                    wi = EmployeeWorkInformation(employee_id=emp)

                wi_fields = []
                if r["email"] and wi.email != r["email"]:
                    wi.email = r["email"]
                    wi_fields.append("email")
                if r["phone"] and wi.mobile != r["phone"]:
                    wi.mobile = r["phone"]
                    wi_fields.append("mobile")

                # Reporting manager
                if r["manager_badge"]:
                    mgr_emp, _ = find_emp(r["manager_badge"], "")
                    if mgr_emp is None:
                        mgr_not_found.append((r["badge_id"], r["manager_badge"]))
                    else:
                        current_mgr_id = wi.reporting_manager_id_id if wi.pk else None
                        if current_mgr_id != mgr_emp.pk:
                            wi.reporting_manager_id = mgr_emp
                            wi_fields.append("reporting_manager_id")

                if wi_fields:
                    if not dry:
                        if wi.pk:
                            EmployeeWorkInformation.objects.filter(pk=wi.pk).update(
                                **{f: getattr(wi, f) for f in wi_fields}
                            )
                        else:
                            wi.save()
                    work_updated += 1
                    if options["verbosity"] >= 2:
                        self.stdout.write(f"  work {r['badge_id']}: {wi_fields}")

            if dry:
                transaction.set_rollback(True)

        # ── 4. Summary ──────────────────────────────────────────────────────
        prefix = "[DRY RUN] " if dry else ""
        self.stdout.write(self.style.SUCCESS(f"\n{prefix}Kết quả:"))
        self.stdout.write(f"  ✓ Employee cập nhật:     {emp_updated}")
        self.stdout.write(f"  ✓ WorkInfo cập nhật:     {work_updated}")
        self.stdout.write(f"  ⚠ Không tìm thấy ({len(not_found)}): {not_found[:30]}")
        if mgr_not_found:
            self.stdout.write(
                f"  ⚠ Mã quản lý không có trong DB ({len(mgr_not_found)}): {mgr_not_found[:10]}"
            )

"""
hnh_import.py

Import chấm công từ file Excel xuất ra bởi máy chấm công HNH.
Format: Mã nhân sự | Tên | Khu vực | Ngày (dd/mm/yyyy) | Giờ vào | Giờ ra | Tất cả dữ liệu | IP
"""

from datetime import datetime, timedelta

import openpyxl
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils.translation import gettext as _
from django.views.decorators.http import require_http_methods

from attendance.models import Attendance
from base.models import EmployeeShift, WorkType
from employee.models import Employee, EmployeeWorkInformation
from horilla.decorators import permission_required


def _to_time_str(val):
    """'07:41' or datetime.time → '07:41', None → None."""
    if val is None:
        return None
    if hasattr(val, "strftime"):
        return val.strftime("%H:%M")
    return str(val).strip()[:5]


def _calc_worked(check_in: str, check_out: str) -> str:
    """Return 'HH:MM' duration. Returns '00:00' if either is missing."""
    if not check_in or not check_out:
        return "00:00"
    fmt = "%H:%M"
    try:
        ci = datetime.strptime(check_in, fmt)
        co = datetime.strptime(check_out, fmt)
        if co < ci:
            co += timedelta(days=1)
        total = int((co - ci).total_seconds() // 60)
        h, m = divmod(total, 60)
        return f"{h:02d}:{m:02d}"
    except Exception:
        return "00:00"


def _parse_date(val):
    """Parse dd/mm/yyyy string or datetime.date → date object."""
    if val is None:
        return None
    if hasattr(val, "date"):
        return val.date() if hasattr(val, "hour") else val
    s = str(val).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


@login_required
@permission_required("attendance.add_attendance")
@require_http_methods(["POST"])
def hnh_attendance_import(request):
    """
    Upload và import file chấm công từ máy chấm công HNH.

    Columns expected (row 1 = header):
        A: Mã nhân sự  B: Tên  C: Khu vực  D: Ngày  E: Giờ vào  F: Giờ ra  G: All data  H: IP
    """
    file = request.FILES.get("hnh_attendance_file")
    if not file:
        return HttpResponse("<p>Chưa chọn file.</p>", status=400)

    try:
        wb = openpyxl.load_workbook(file, data_only=True)
        ws = wb.active
    except Exception as exc:
        return HttpResponse(f"<p>Không đọc được file: {exc}</p>", status=400)

    # --- pre-load employees by badge_id ---
    all_employees = {
        emp.badge_id: emp
        for emp in Employee.objects.filter(is_active=True, badge_id__isnull=False)
        .select_related("employee_work_info__shift_id", "employee_work_info__work_type_id")
    }

    # default shift / work_type fallbacks
    default_shift = EmployeeShift.objects.first()
    default_work_type = WorkType.objects.first()

    # pre-load existing attendance keys for duplicate check
    badge_ids_in_file: set[str] = set()
    rows_data = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        badge_id = str(row[0]).strip()
        badge_ids_in_file.add(badge_id)
        rows_data.append(row)

    existing_keys: set[tuple] = {
        (att.employee_id.badge_id, att.attendance_date)
        for att in Attendance.objects.filter(
            employee_id__badge_id__in=badge_ids_in_file
        ).select_related("employee_id")
    }

    created: list[Attendance] = []
    errors: list[dict] = []
    skipped_absent = 0

    for row in rows_data:
        badge_id = str(row[0]).strip() if row[0] else None
        date_val = row[3] if len(row) > 3 else None
        check_in_raw = row[4] if len(row) > 4 else None
        check_out_raw = row[5] if len(row) > 5 else None

        check_in = _to_time_str(check_in_raw)
        check_out = _to_time_str(check_out_raw)

        # Skip rows with no check-in AND no check-out (ngày vắng)
        if not check_in and not check_out:
            skipped_absent += 1
            continue

        att_date = _parse_date(date_val)

        if not badge_id:
            errors.append({"row": str(row), "error": "Thiếu Mã nhân sự"})
            continue

        if att_date is None:
            errors.append({"badge_id": badge_id, "error": f"Ngày không hợp lệ: {date_val}"})
            continue

        employee = all_employees.get(badge_id)
        if not employee:
            errors.append({"badge_id": badge_id, "date": str(att_date), "error": "Không tìm thấy nhân viên với mã này"})
            continue

        # duplicate guard
        if (badge_id, att_date) in existing_keys:
            errors.append({"badge_id": badge_id, "date": str(att_date), "error": "Bản ghi đã tồn tại, bỏ qua"})
            continue

        # Resolve shift and work_type from employee work info
        work_info: EmployeeWorkInformation | None = getattr(employee, "employee_work_info", None)
        shift = (work_info.shift_id if work_info and work_info.shift_id else default_shift)
        work_type = (work_info.work_type_id if work_info and work_info.work_type_id else default_work_type)

        worked = _calc_worked(check_in, check_out)
        # minimum_hour: use 08:00 as default; will be recalculated by Attendance.save() hooks
        min_hour = "08:00"

        check_in_time = None
        if check_in:
            try:
                check_in_time = datetime.strptime(check_in, "%H:%M").time()
            except ValueError:
                errors.append({"badge_id": badge_id, "date": str(att_date), "error": f"Giờ vào không hợp lệ: {check_in}"})
                continue

        check_out_time = None
        if check_out:
            try:
                check_out_time = datetime.strptime(check_out, "%H:%M").time()
            except ValueError:
                errors.append({"badge_id": badge_id, "date": str(att_date), "error": f"Giờ ra không hợp lệ: {check_out}"})
                continue

        obj = Attendance(
            employee_id=employee,
            attendance_date=att_date,
            shift_id=shift,
            work_type_id=work_type,
            attendance_clock_in_date=att_date,
            attendance_clock_in=check_in_time,
            attendance_clock_out_date=att_date if check_out_time else None,
            attendance_clock_out=check_out_time,
            attendance_worked_hour=worked,
            minimum_hour=min_hour,
            attendance_validated=False,
        )
        created.append(obj)
        existing_keys.add((badge_id, att_date))

    if created:
        Attendance.objects.bulk_create(created, ignore_conflicts=True)

    created_count = len(created)
    error_count = len(errors)

    context = {
        "created_count": created_count,
        "error_count": error_count,
        "skipped_absent": skipped_absent,
        "model": "Chấm công HNH",
        "path_info": None,
        "errors": errors[:50],  # hiển thị tối đa 50 lỗi đầu
    }
    html = render_to_string("attendance/attendance/hnh_import_result.html", context)
    return HttpResponse(html)

"""Export attendance activity data as JSON preview or Excel (.xlsx)."""
import io
from datetime import date, timedelta

from django.db.models import Min, Max
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import Attendance, AttendanceActivity
from employee.models import Employee


DAY_NAMES_VI = {
    0: "T2", 1: "T3", 2: "T4", 3: "T5", 4: "T6", 5: "T7", 6: "CN",
}


def _is_cnb(user):
    if user.is_superuser:
        return True
    gnames = [g.name.lower() for g in user.groups.all()]
    return any(
        "c&b" in g or "c & b" in g or "chuyên viên c" in g or "cb" == g.strip()
        for g in gnames
    )


def _build_rows(year, month):
    import calendar
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])

    employees = Employee.objects.filter(is_active=True).select_related(
        "employee_work_info__shift_id"
    ).order_by("stt", "employee_first_name")

    rows = []
    stt = 0
    for emp in employees:
        wi = getattr(emp, "employee_work_info", None)
        shift = wi.shift_id if wi else None

        atts = Attendance.objects.filter(
            employee_id=emp,
            attendance_date__gte=first,
            attendance_date__lte=last,
        ).order_by("attendance_date")

        for att in atts:
            stt += 1
            d = att.attendance_date
            weekday = DAY_NAMES_VI.get(d.weekday(), "")

            acts = AttendanceActivity.objects.filter(
                employee_id=emp,
                attendance_date=d,
            ).order_by("clock_in")

            earliest_in = None
            latest_out = None
            detail_parts = []
            for act in acts:
                cin = act.clock_in
                cout = act.clock_out
                if cin:
                    cin_str = str(cin)[:5]
                    if earliest_in is None or cin < earliest_in:
                        earliest_in = cin
                else:
                    cin_str = "--:--"
                if cout:
                    cout_str = str(cout)[:5]
                    if latest_out is None or cout > latest_out:
                        latest_out = cout
                else:
                    cout_str = "--:--"
                detail_parts.append(f"{cin_str}-{cout_str}")

            worked = att.attendance_worked_hour or "00:00"
            earliest_str = str(earliest_in)[:5] if earliest_in else "--:--"
            latest_str = str(latest_out)[:5] if latest_out else "--:--"
            detail = " ".join(detail_parts) if detail_parts else ""

            is_late = False
            is_early = False
            if shift and earliest_in:
                from base.models import EmployeeShiftSchedule, EmployeeShiftDay
                day_name = d.strftime("%A").lower()
                try:
                    day_obj = EmployeeShiftDay.objects.get(day=day_name)
                    sched = EmployeeShiftSchedule.objects.filter(
                        shift_id=shift, day=day_obj
                    ).first()
                    if sched and sched.start_time and earliest_in > sched.start_time:
                        is_late = True
                    if sched and sched.end_time and latest_out and latest_out < sched.end_time:
                        is_early = True
                except Exception:
                    pass

            rows.append({
                "stt": stt,
                "employee_code": emp.employee_code or emp.badge_id or "",
                "accounting_code": emp.accounting_code or "",
                "first_name": emp.employee_first_name,
                "full_name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                "date": d.isoformat(),
                "weekday": weekday,
                "clock_in": earliest_str,
                "clock_out": latest_str,
                "worked": worked[:5] if len(worked) >= 5 else worked,
                "detail": detail,
                "is_late": is_late,
                "is_early": is_early,
            })

    return rows


class AttendanceExportPreviewView(APIView):
    """GET: Preview attendance data for a month (JSON)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request.user):
            return Response({"error": "Chỉ C&B mới được xuất"}, status=403)

        year = int(request.query_params.get("year", date.today().year))
        month = int(request.query_params.get("month", date.today().month))

        rows = _build_rows(year, month)
        return Response({
            "year": year,
            "month": month,
            "count": len(rows),
            "results": rows,
        })


class AttendanceExportExcelView(APIView):
    """GET: Download attendance data as .xlsx file."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request.user):
            return Response({"error": "Chỉ C&B mới được xuất"}, status=403)

        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        year = int(request.query_params.get("year", date.today().year))
        month = int(request.query_params.get("month", date.today().month))

        rows = _build_rows(year, month)

        wb = Workbook()
        ws = wb.active
        ws.title = f"CC T{month}-{year}"

        headers = [
            "STT", "Mã N.Viên", "Mã KT", "Tên", "Họ tên đầy đủ",
            "Ngày", "Thứ", "Giờ vào", "Giờ ra", "Giờ làm",
            "Chi tiết hoạt động", "Đi trễ", "Về sớm",
        ]

        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="142B6F", end_color="142B6F", fill_type="solid")
        thin_border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin"),
        )

        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border

        late_fill = PatternFill(start_color="FDE2E2", end_color="FDE2E2", fill_type="solid")
        early_fill = PatternFill(start_color="FFF3CD", end_color="FFF3CD", fill_type="solid")

        for i, r in enumerate(rows, 2):
            vals = [
                r["stt"], r["employee_code"], r["accounting_code"],
                r["first_name"], r["full_name"],
                r["date"], r["weekday"], r["clock_in"], r["clock_out"],
                r["worked"], r["detail"],
                "Có" if r["is_late"] else "",
                "Có" if r["is_early"] else "",
            ]
            for col, v in enumerate(vals, 1):
                cell = ws.cell(row=i, column=col, value=v)
                cell.border = thin_border
                cell.alignment = Alignment(vertical="center")
                if r["is_late"] and col == 12:
                    cell.fill = late_fill
                if r["is_early"] and col == 13:
                    cell.fill = early_fill

        col_widths = [6, 14, 10, 15, 25, 12, 6, 10, 10, 10, 35, 8, 8]
        for i, w in enumerate(col_widths, 1):
            ws.column_dimensions[chr(64 + i) if i <= 26 else ""].width = w

        ws.auto_filter.ref = ws.dimensions

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        filename = f"HoatDong_ChamCong_T{month}_{year}.xlsx"
        response = HttpResponse(
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

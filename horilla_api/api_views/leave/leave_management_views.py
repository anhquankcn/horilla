"""
horilla_api/api_views/leave/leave_management_views.py

HNH Leave Management APIs:
- /api/leave/hnh-leave-summary/      — 4-type balance for current user
- /api/leave/hnh-compensatory/       — list & create Phép Bù proposals (manager)
- /api/leave/hnh-compensatory/<pk>/approve/  — C&B approve
- /api/leave/hnh-compensatory/<pk>/reject/   — C&B reject
- /api/leave/hnh-compensatory/<pk>/          — manager delete pending proposal
"""

import math
from calendar import monthrange
from datetime import date, timedelta

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from employee.models import Employee
from leave.models import AvailableLeave, HNHCompensatoryProposal


def _get_employee(request):
    try:
        return request.user.employee_get
    except Exception:
        return None


def _is_cnb(request):
    """Chuyên viên C&B or superuser → can approve/reject and see all proposals."""
    if request.user.is_superuser:
        return True
    gnames = [g.name.lower() for g in request.user.groups.all()]
    return any("c&b" in g or "chuyên viên c" in g for g in gnames)


def _is_manager(request):
    """Line manager or C&B."""
    if _is_cnb(request):
        return True
    emp = _get_employee(request)
    if emp is None:
        return False
    return Employee.objects.filter(
        employee_work_info__reporting_manager_id=emp, is_active=True
    ).exists()


def _seniority_days(emp: Employee) -> float:
    """Extra leave days = floor(years_service - 5) for employees >5 years."""
    try:
        join_date = emp.employee_work_info.date_joining
    except Exception:
        return 0.0
    if not join_date:
        return 0.0
    today = date.today()
    years = (today - join_date).days / 365.25
    if years <= 5:
        return 0.0
    return float(math.floor(years - 5))


def _leave_summary(emp: Employee):
    """
    Returns 4 leave types summary: Phép Năm, Phép Bù, Phép Ốm, Phép Thâm Niên.
    Phép Thâm Niên is calculated dynamically.
    Phép Bù accumulates from approved HNHCompensatoryProposals minus used days.
    """
    balances = list(
        AvailableLeave.objects.filter(employee_id=emp, is_active=True)
        .select_related("leave_type_id")
    )

    # Build name → balance map (case insensitive)
    bal_map: dict[str, AvailableLeave] = {b.leave_type_id.name.lower(): b for b in balances}

    def find_bal(keywords: list[str]):
        for b in balances:
            n = b.leave_type_id.name.lower()
            if any(k in n for k in keywords):
                return b
        return None

    annual_bal = find_bal(["phép năm", "annual"])
    bu_bal = find_bal(["phép bù", "bù"])
    om_bal = find_bal(["ốm", "sick"])
    thamni_bal = find_bal(["thâm niên", "seniority"])

    seniority_days = _seniority_days(emp)

    def _fmt(bal, override_avail=None, override_total=None):
        if bal is None:
            return None
        return {
            "id": bal.id,
            "leave_type_id": bal.leave_type_id.id,
            "name": bal.leave_type_id.name,
            "available_days": override_avail if override_avail is not None else bal.available_days,
            "total_days": override_total if override_total is not None else bal.leave_type_id.total_days,
            "carryforward_days": bal.carryforward_days,
        }

    result = {
        "annual": _fmt(annual_bal),
        "compensatory": _fmt(bu_bal),
        "sick": _fmt(om_bal),
        "seniority": _fmt(thamni_bal, override_avail=seniority_days, override_total=seniority_days) if thamni_bal else {
            "id": None,
            "leave_type_id": None,
            "name": "Phép Thâm Niên",
            "available_days": seniority_days,
            "total_days": seniority_days,
            "carryforward_days": 0,
        },
        "seniority_days": seniority_days,
    }

    # Phép Bù: total approved proposals
    approved_days = HNHCompensatoryProposal.objects.filter(
        employee_id=emp, status="approved"
    ).values_list("days", flat=True)
    total_approved = sum(approved_days)
    if bu_bal:
        result["compensatory"]["total_days"] = total_approved
    else:
        result["compensatory"] = {
            "id": None,
            "leave_type_id": None,
            "name": "Phép Bù",
            "available_days": bu_bal.available_days if bu_bal else 0.0,
            "total_days": total_approved,
            "carryforward_days": 0,
        }

    return result


def _usage_this_year(emp):
    """Số lượt + số ngày đã áp dụng theo TỪNG hình thức nghỉ, từ đầu năm tới nay.
    Gồm cả hình thức NV có số dư (dù chưa dùng, count=0) → 'các hình thức đang có'.
    Loại trừ đơn bị từ chối/huỷ."""
    from datetime import date as _date
    from leave.models import LeaveRequest, AvailableLeave

    year = _date.today().year
    usage = {}
    # Hình thức NV có số dư (đang có) — đưa vào dù chưa dùng
    for al in AvailableLeave.objects.filter(employee_id=emp).select_related("leave_type_id"):
        lt = al.leave_type_id
        if lt:
            usage.setdefault(lt.id, {"leave_type_id": lt.id, "name": lt.name, "count": 0, "days": 0.0})
    # Số lượt đã áp dụng năm nay
    lrs = (
        LeaveRequest.objects.filter(employee_id=emp, start_date__year=year)
        .exclude(status__in=["rejected", "cancelled"])
        .select_related("leave_type_id")
    )
    for lr in lrs:
        lt = lr.leave_type_id
        if not lt:
            continue
        u = usage.setdefault(lt.id, {"leave_type_id": lt.id, "name": lt.name, "count": 0, "days": 0.0})
        u["count"] += 1
        u["days"] += (lr.requested_days or 0)
    for u in usage.values():
        u["days"] = round(u["days"], 2)
    # Ưu tiên hình thức đã dùng nhiều, rồi tới còn lại
    return sorted(usage.values(), key=lambda x: (-x["count"], x["name"]))


class HNHLeaveSummaryView(APIView):
    """GET /api/leave/hnh-leave-summary/ — 4 leave types + scope for current user."""

    def get(self, request):
        emp = _get_employee(request)
        if emp is None:
            return Response({"detail": "No employee record found."}, status=404)
        summary = _leave_summary(emp)
        # Scope: "cnb" | "manager" | "employee"
        if _is_cnb(request):
            summary["scope"] = "cnb"
        elif _is_manager(request):
            summary["scope"] = "manager"
        else:
            summary["scope"] = "employee"
        summary["usage_this_year"] = _usage_this_year(emp)
        return Response(summary)


class HNHCompensatoryProposalListCreateView(APIView):
    """
    GET  — manager sees their team's proposals; C&B sees all pending.
    POST — manager creates a proposal for a team member.
    """

    def get(self, request):
        emp = _get_employee(request)
        if emp is None:
            return Response([], status=200)

        if _is_cnb(request):
            qs = HNHCompensatoryProposal.objects.all().select_related(
                "employee_id", "proposed_by", "approved_by"
            )
        elif _is_manager(request):
            team = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp, is_active=True
            )
            qs = HNHCompensatoryProposal.objects.filter(
                employee_id__in=team
            ).select_related("employee_id", "proposed_by", "approved_by")
        else:
            return Response({"detail": "Không có quyền."}, status=403)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        # Lọc theo công ty / phòng ban (C&B/Admin xem toàn bộ + lọc được).
        company_id = request.query_params.get("company")
        department_id = request.query_params.get("department")
        if company_id:
            qs = qs.filter(employee_id__employee_work_info__company_id=company_id)
        if department_id:
            qs = qs.filter(employee_id__employee_work_info__department_id=department_id)
        qs = qs.select_related(
            "employee_id__employee_work_info__company_id",
            "employee_id__employee_work_info__department_id",
        )

        data = []
        for p in qs[:500]:
            wi = getattr(p.employee_id, "employee_work_info", None)
            data.append({
                "id": p.id,
                "employee_id": p.employee_id_id,
                "employee_name": str(p.employee_id),
                "company": wi.company_id.company if wi and wi.company_id else None,
                "department": wi.department_id.department if wi and wi.department_id else None,
                "proposed_by_id": p.proposed_by_id,
                "proposed_by_name": str(p.proposed_by) if p.proposed_by else "",
                "days": p.days,
                "note": p.note,
                "status": p.status,
                "reject_reason": p.reject_reason,
                "approved_by_name": str(p.approved_by) if p.approved_by else "",
                "approved_at": p.approved_at.isoformat() if p.approved_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            })
        return Response(data)

    def post(self, request):
        emp = _get_employee(request)
        if emp is None:
            return Response({"detail": "No employee record."}, status=400)
        if not _is_manager(request):
            return Response({"detail": "Không có quyền."}, status=403)

        target_id = request.data.get("employee_id")
        days = request.data.get("days")
        note = request.data.get("note", "")

        if not target_id or not days:
            return Response({"detail": "Cần employee_id và days."}, status=400)

        try:
            days = float(days)
            if days <= 0:
                raise ValueError
        except (ValueError, TypeError):
            return Response({"detail": "Số ngày không hợp lệ."}, status=400)

        try:
            target_emp = Employee.objects.get(id=target_id, is_active=True)
        except Employee.DoesNotExist:
            return Response({"detail": "Nhân viên không tồn tại."}, status=404)

        # Only managers can propose for their own team (C&B can propose for anyone)
        if not _is_cnb(request):
            team_ids = list(
                Employee.objects.filter(
                    employee_work_info__reporting_manager_id=emp, is_active=True
                ).values_list("id", flat=True)
            )
            if target_emp.id not in team_ids:
                return Response({"detail": "Nhân viên không thuộc nhóm bạn quản lý."}, status=403)

        proposal = HNHCompensatoryProposal.objects.create(
            employee_id=target_emp,
            proposed_by=emp,
            days=days,
            note=note,
            status="requested",
        )
        return Response({"id": proposal.id, "status": "requested"}, status=201)


class HNHCompensatoryProposalApproveView(APIView):
    """POST /api/leave/hnh-compensatory/<pk>/approve/ — C&B only."""

    def post(self, request, pk):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B mới có thể duyệt."}, status=403)

        try:
            proposal = HNHCompensatoryProposal.objects.get(id=pk)
        except HNHCompensatoryProposal.DoesNotExist:
            return Response({"detail": "Không tìm thấy đề xuất."}, status=404)

        if proposal.status != "requested":
            return Response({"detail": f"Đề xuất đã ở trạng thái {proposal.status}."}, status=400)

        emp = _get_employee(request)
        proposal.status = "approved"
        proposal.approved_by = emp
        proposal.approved_at = timezone.now()
        proposal.save()

        # Credit Phép Bù days to employee's AvailableLeave
        _credit_bu_days(proposal.employee_id, proposal.days)

        return Response({"status": "approved"})


class HNHCompensatoryProposalRejectView(APIView):
    """POST /api/leave/hnh-compensatory/<pk>/reject/ — C&B only."""

    def post(self, request, pk):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B mới có thể từ chối."}, status=403)

        try:
            proposal = HNHCompensatoryProposal.objects.get(id=pk)
        except HNHCompensatoryProposal.DoesNotExist:
            return Response({"detail": "Không tìm thấy đề xuất."}, status=404)

        if proposal.status != "requested":
            return Response({"detail": f"Đề xuất đã ở trạng thái {proposal.status}."}, status=400)

        reason = request.data.get("reason", "")
        proposal.status = "rejected"
        proposal.reject_reason = reason
        proposal.save()
        return Response({"status": "rejected"})


class HNHCompensatoryProposalDeleteView(APIView):
    """DELETE /api/leave/hnh-compensatory/<pk>/ — manager can delete their own pending proposals."""

    def delete(self, request, pk):
        emp = _get_employee(request)
        try:
            proposal = HNHCompensatoryProposal.objects.get(id=pk)
        except HNHCompensatoryProposal.DoesNotExist:
            return Response({"detail": "Không tìm thấy."}, status=404)

        if not _is_cnb(request) and proposal.proposed_by != emp:
            return Response({"detail": "Không có quyền."}, status=403)

        if proposal.status != "requested":
            return Response({"detail": "Chỉ có thể xóa đề xuất đang chờ duyệt."}, status=400)

        proposal.delete()
        return Response(status=204)


class HNHTeamEmployeesView(APIView):
    """GET /api/leave/hnh-team-employees/ — employees that current user manages (for proposal form)."""

    def get(self, request):
        emp = _get_employee(request)
        if emp is None:
            return Response([], status=200)

        if _is_cnb(request):
            qs = Employee.objects.filter(is_active=True).select_related("employee_work_info")
        elif _is_manager(request):
            qs = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp, is_active=True
            ).select_related("employee_work_info")
        else:
            return Response([], status=200)

        data = []
        for e in qs[:200]:
            data.append({
                "id": e.id,
                "name": str(e),
                "badge_id": e.badge_id or "",
                "department": str(e.employee_work_info.department_id) if hasattr(e, "employee_work_info") and e.employee_work_info and e.employee_work_info.department_id else "",
            })
        return Response(data)


class LeaveExcelExportView(APIView):
    """GET /api/leave/export-excel/?year=2026&month=6&status=approved&department_id=1
    Scope: C&B/superuser → toàn cty; Manager → team trực tiếp; Employee → chỉ mình.
    """
    permission_classes = []  # dùng IsAuthenticated kế thừa từ APIView settings

    def get(self, request):
        from django.http import HttpResponse
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from leave.models import LeaveRequest

        emp = _get_employee(request)
        if emp is None:
            return Response({"error": "No employee"}, status=403)

        year = int(request.query_params.get("year") or date.today().year)
        month = int(request.query_params.get("month") or date.today().month)
        status_filter = request.query_params.get("status") or None
        dept_id = request.query_params.get("department_id") or None

        # Scope
        qs = LeaveRequest.objects.select_related(
            "employee_id", "employee_id__employee_work_info__department_id", "leave_type_id"
        ).filter(
            start_date__year=year, start_date__month=month,
        )
        if _is_cnb(request):
            pass  # all
        elif _is_manager(request):
            sub_ids = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp, is_active=True
            ).values_list("id", flat=True)
            qs = qs.filter(employee_id__in=sub_ids)
        else:
            qs = qs.filter(employee_id=emp)

        if status_filter:
            qs = qs.filter(status=status_filter)
        if dept_id:
            qs = qs.filter(employee_id__employee_work_info__department_id=dept_id)

        qs = qs.order_by("employee_id__badge_id", "start_date")

        STATUS_VI = {"requested": "Chờ duyệt", "approved": "Đã duyệt", "rejected": "Từ chối"}
        BD_VI = {"full_day": "Cả ngày", "first_half": "Buổi sáng", "second_half": "Buổi chiều"}

        wb = Workbook()
        ws = wb.active
        ws.title = f"NghiPhep T{month}-{year}"

        headers = [
            "STT", "Mã NV", "Tên nhân viên", "Phòng ban",
            "Loại nghỉ", "Hình thức", "Từ ngày", "Đến ngày",
            "Số ngày/giờ", "Buổi", "Trạng thái", "Lý do", "Ngày gửi",
        ]
        COL_W = [5, 10, 22, 18, 20, 10, 12, 12, 12, 14, 12, 30, 14]

        hdr_font  = Font(bold=True, color="FFFFFF", size=10)
        hdr_fill  = PatternFill(start_color="C0222B", end_color="C0222B", fill_type="solid")
        thin = Border(
            left=Side(style="thin"), right=Side(style="thin"),
            top=Side(style="thin"), bottom=Side(style="thin"),
        )
        approved_fill = PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid")
        rejected_fill = PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid")
        pending_fill  = PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid")

        for col, (h, w) in enumerate(zip(headers, COL_W), 1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = hdr_font
            cell.fill = hdr_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin
            ws.column_dimensions[cell.column_letter].width = w
        ws.row_dimensions[1].height = 26

        for stt, lr in enumerate(qs, 1):
            e = lr.employee_id
            dept = ""
            try:
                dept = str(e.employee_work_info.department_id)
            except Exception:
                pass
            lt = lr.leave_type_id

            if lr.is_hourly and lr.requested_hours:
                qty = f"{lr.requested_hours}h"
                form = "Theo giờ"
                buoi = (
                    f"{lr.start_time.strftime('%H:%M') if lr.start_time else '?'}"
                    f" – {lr.end_time.strftime('%H:%M') if lr.end_time else '?'}"
                )
            else:
                d = lr.requested_days or 0
                qty = f"{int(d) if d == int(d) else round(d, 2)} ngày"
                form = "Theo ngày"
                buoi = BD_VI.get(lr.start_date_breakdown or "", lr.start_date_breakdown or "")

            vals = [
                stt,
                e.badge_id or "",
                f"{e.employee_first_name} {e.employee_last_name or ''}".strip(),
                dept,
                lt.name if lt else "",
                form,
                lr.start_date.strftime("%d/%m/%Y") if lr.start_date else "",
                lr.end_date.strftime("%d/%m/%Y") if lr.end_date else "",
                qty,
                buoi,
                STATUS_VI.get(lr.status, lr.status),
                lr.description or "",
                lr.requested_date.strftime("%d/%m/%Y") if lr.requested_date else "",
            ]
            row_fill = (
                approved_fill if lr.status == "approved" else
                rejected_fill if lr.status == "rejected" else
                pending_fill
            )
            for col, v in enumerate(vals, 1):
                cell = ws.cell(row=stt + 1, column=col, value=v)
                cell.border = thin
                cell.fill = row_fill
                cell.alignment = Alignment(vertical="center", wrap_text=(col == 12))
            ws.row_dimensions[stt + 1].height = 18

        import io
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        fname = f"NghiPhep_T{month:02d}-{year}.xlsx"
        resp = HttpResponse(
            buf.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = f'attachment; filename="{fname}"'
        return resp


class HNHLeaveOverviewView(APIView):
    """
    GET /api/leave/hnh-leave-overview/?year=&month=&dept_id=
    Returns employees + leave cells for the monthly Gantt grid.
    Scope: C&B → all active; Manager → direct reports; Employee → self only.
    """

    def get(self, request):
        from leave.models import LeaveRequest

        emp_user = _get_employee(request)
        if emp_user is None:
            return Response({"detail": "No employee"}, status=403)

        today = date.today()
        year = int(request.query_params.get("year") or today.year)
        month = int(request.query_params.get("month") or today.month)
        dept_filter = request.query_params.get("dept_id") or None
        company_filter = request.query_params.get("company_id") or None

        days_count = monthrange(year, month)[1]
        month_start = date(year, month, 1)
        month_end = date(year, month, days_count)
        day_strs = [
            (month_start + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(days_count)
        ]

        # Employee scope
        base_qs = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info__department_id",
            "employee_work_info__company_id",
        )
        if _is_cnb(request):
            # Trụ sở chính Hồng Ngọc Hà (company id=1) xếp đầu → chi nhánh con
            # (order theo company_id tăng dần), rồi tới badge_id.
            emp_qs = base_qs.order_by("employee_work_info__company_id", "badge_id")
        elif _is_manager(request):
            emp_qs = base_qs.filter(
                employee_work_info__reporting_manager_id=emp_user
            ).order_by("employee_work_info__company_id", "badge_id")
        else:
            emp_qs = base_qs.filter(id=emp_user.id)

        if dept_filter:
            emp_qs = emp_qs.filter(employee_work_info__department_id=dept_filter)
        if company_filter:
            emp_qs = emp_qs.filter(employee_work_info__company_id=company_filter)

        employees = list(emp_qs[:400])
        emp_ids = [e.id for e in employees]

        # Số dư phép tính Phép năm + Phép bù + Phép thâm niên (KHÔNG ốm):
        #   Phép đầu = số dư THỰC TẾ hôm nay (available + carryforward) của các loại này.
        #   Phép cuối = Phép đầu − số ngày các loại này ĐÃ DUYỆT có start_date trong tháng.
        from leave.models import AvailableLeave, LeaveType
        lc_ids = list(
            LeaveType.objects.filter(
                name__in=["Nghỉ phép năm", "Phép Bù", "Phép Thâm Niên"]
            ).values_list("id", flat=True)
        )
        bal_start: dict = {}
        for al in AvailableLeave.objects.filter(employee_id__in=emp_ids, leave_type_id__in=lc_ids):
            bal_start[al.employee_id_id] = bal_start.get(al.employee_id_id, 0.0) + (al.available_days or 0) + (al.carryforward_days or 0)
        taken_month: dict = {}
        for lr in LeaveRequest.objects.filter(
            employee_id__in=emp_ids, status="approved", leave_type_id__in=lc_ids,
            start_date__gte=month_start, start_date__lte=month_end,
        ):
            taken_month[lr.employee_id_id] = taken_month.get(lr.employee_id_id, 0.0) + (lr.requested_days or 0)

        # Build employee data + collect department/company list
        dept_map: dict = {}
        comp_map: dict = {}
        emp_data = []
        for e in employees:
            dept_name = ""
            dept_id_val = None
            comp_name = ""
            comp_id_val = None
            try:
                wi = e.employee_work_info
                if wi and wi.department_id:
                    dept_name = str(wi.department_id)
                    dept_id_val = wi.department_id_id
                    dept_map[str(dept_id_val)] = dept_name
                if wi and wi.company_id:
                    comp_name = wi.company_id.company
                    comp_id_val = wi.company_id_id
                    comp_map[str(comp_id_val)] = comp_name
            except Exception:
                pass
            start_v = round(bal_start.get(e.id, 0.0), 2)
            taken_v = round(taken_month.get(e.id, 0.0), 2)
            emp_data.append({
                "id": e.id,
                "name": str(e),
                "badge_id": e.badge_id or "",
                "accounting_code": getattr(e, "accounting_code", None) or "",
                "department": dept_name,
                "dept_id": dept_id_val,
                "company": comp_name,
                "company_id": comp_id_val,
                "leave_start": start_v,       # Phép đầu
                "leave_taken": taken_v,       # Phát sinh (tổng đã duyệt trong tháng)
                "leave_end": round(start_v - taken_v, 2),  # Còn lại (Phép cuối)
            })

        # Dropdown lọc: TOÀN BỘ công ty + phòng ban (không co theo bộ lọc đang chọn).
        from base.models import Company as _Company, Department as _Department
        companies = [{"id": str(c.id), "name": c.company} for c in _Company.objects.all()]
        departments = [
            {"id": str(d.id), "name": d.department, "company_ids": [c.id for c in d.company_id.all()]}
            for d in _Department.objects.prefetch_related("company_id").all()
        ]

        # Fetch leave requests overlapping with the month
        lr_qs = (
            LeaveRequest.objects.filter(
                employee_id__in=emp_ids,
                start_date__lte=month_end,
                end_date__gte=month_start,
            )
            .select_related("leave_type_id")
            .order_by("start_date")
        )

        def _code(name: str) -> str:
            """First letter of each word, max 4 chars, uppercase."""
            if not name:
                return "?"
            # Strip leading "Đơn " prefix
            n = name
            if n.lower().startswith("đơn "):
                n = n[4:]
            words = [w for w in n.split() if w]
            return ("".join(w[0].upper() for w in words))[:4] or "?"

        cells: dict = {}

        for lr in lr_qs:
            emp_id = lr.employee_id_id
            # Clamp to month
            s = max(lr.start_date, month_start)
            e_date = min(lr.end_date, month_end)
            code = _code(lr.leave_type_id.name if lr.leave_type_id else "?")
            is_single = lr.start_date == lr.end_date

            time_range = None
            if getattr(lr, "is_hourly", False) and getattr(lr, "start_time", None) and getattr(lr, "end_time", None):
                time_range = f"{lr.start_time.strftime('%H:%M')}-{lr.end_time.strftime('%H:%M')}"

            for offset in range((e_date - s).days + 1):
                d = s + timedelta(days=offset)
                is_first = d == lr.start_date
                is_last = d == lr.end_date

                is_morning = True
                is_afternoon = True

                if is_single:
                    bd = (getattr(lr, "start_date_breakdown", None) or "full_day")
                    if bd == "first_half":
                        is_afternoon = False
                    elif bd == "second_half":
                        is_morning = False
                elif is_first:
                    bd = (getattr(lr, "start_date_breakdown", None) or "full_day")
                    if bd == "second_half":
                        is_morning = False
                elif is_last:
                    bd = (getattr(lr, "end_date_breakdown", None) or "full_day")
                    if bd == "first_half":
                        is_afternoon = False

                key = f"{emp_id}_{d.strftime('%Y-%m-%d')}"
                entry = {
                    "id": lr.id,
                    "code": code,
                    "status": lr.status,
                    "is_morning": is_morning,
                    "is_afternoon": is_afternoon,
                    "is_hourly": bool(getattr(lr, "is_hourly", False)),
                    "time_range": time_range,
                }
                cells.setdefault(key, []).append(entry)

        return Response({
            "employees": emp_data,
            "cells": cells,
            "days": day_strs,
            "departments": departments,
            "companies": companies,
            "year": year,
            "month": month,
        })


class LeaveImportTemplateView(APIView):
    """GET /api/leave/hnh-leave-import/template/?year= — export blank+prefilled Excel template."""

    def get(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B mới có thể xuất mẫu."}, status=403)

        from django.http import HttpResponse
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from leave.models import LeaveRequest, LeaveType
        from django.db.models import Sum

        year = int(request.query_params.get("year") or date.today().year)

        def _find_type(*keywords):
            for kw in keywords:
                t = LeaveType.objects.filter(name__icontains=kw).first()
                if t:
                    return t
            return None

        annual_type = _find_type("phép năm", "annual")
        bu_type = _find_type("phép bù")

        emps = list(
            Employee.objects.filter(is_active=True)
            .select_related("employee_work_info__department_id")
            .order_by("badge_id")
        )
        emp_ids = [e.id for e in emps]

        # Used days this year for annual leave
        used_map: dict[int, float] = {}
        if annual_type:
            for row in (
                LeaveRequest.objects.filter(
                    employee_id__in=emp_ids,
                    leave_type_id=annual_type,
                    status="approved",
                    start_date__year=year,
                )
                .values("employee_id_id")
                .annotate(total=Sum("requested_days"))
            ):
                used_map[row["employee_id_id"]] = float(row["total"] or 0)

        # Current balances
        annual_map: dict[int, AvailableLeave] = {}
        if annual_type:
            for av in AvailableLeave.objects.filter(leave_type_id=annual_type, employee_id__in=emp_ids):
                annual_map[av.employee_id_id] = av

        bu_map_av: dict[int, AvailableLeave] = {}
        if bu_type:
            for av in AvailableLeave.objects.filter(leave_type_id=bu_type, employee_id__in=emp_ids):
                bu_map_av[av.employee_id_id] = av

        wb = Workbook()
        ws = wb.active
        ws.title = f"PhepNam_{year}"

        hdr_font  = Font(bold=True, color="FFFFFF", size=10)
        hdr_fill  = PatternFill(start_color="C0222B", end_color="C0222B", fill_type="solid")
        info_fill = PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")
        calc_fill = PatternFill(start_color="E0E0E0", end_color="E0E0E0", fill_type="solid")
        edit_fill = PatternFill(start_color="FFFDE7", end_color="FFFDE7", fill_type="solid")
        thin = Border(
            left=Side(style="thin"), right=Side(style="thin"),
            top=Side(style="thin"), bottom=Side(style="thin"),
        )
        center = Alignment(horizontal="center", vertical="center")
        left   = Alignment(horizontal="left", vertical="center")

        HEADERS = [
            "STT", "Mã NV", "Họ tên", "Phòng ban",
            "Phép đầu năm", "Phép đã dùng", "Phép bù", "Phép tồn",
        ]
        COL_W = [5, 10, 24, 18, 14, 14, 10, 10]

        for col, (h, w) in enumerate(zip(HEADERS, COL_W), 1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = hdr_font
            cell.fill = hdr_fill
            cell.alignment = center
            cell.border = thin
            ws.column_dimensions[get_column_letter(col)].width = w
        ws.row_dimensions[1].height = 26

        # Sub-header note row
        note_row = ["", "", "", "",
                    "Số ngày còn được dùng", "Tự động tính (bỏ qua khi nhập)",
                    "Phép bù hiện có", "Ngày chuyển sang năm sau"]
        ws.append(note_row)
        for col in range(1, 9):
            cell = ws.cell(row=2, column=col)
            cell.font = Font(italic=True, color="888888", size=8)
            cell.alignment = center
            cell.fill = info_fill if col <= 4 else (calc_fill if col == 6 else edit_fill)
            cell.border = thin
        ws.row_dimensions[2].height = 14

        for stt, emp in enumerate(emps, 1):
            dept = ""
            try:
                dept = str(emp.employee_work_info.department_id)
            except Exception:
                pass

            av   = annual_map.get(emp.id)
            bu_a = bu_map_av.get(emp.id)
            annual_avail = float(av.available_days or 0) if av else 0.0
            annual_carry = float(av.carryforward_days or 0) if av else 0.0
            used  = used_map.get(emp.id, 0.0)
            bu_av = float(bu_a.available_days or 0) if bu_a else 0.0

            row_vals = [
                stt,
                emp.badge_id or "",
                f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                dept,
                annual_avail,
                used,
                bu_av,
                annual_carry,
            ]
            data_row = stt + 2  # rows 1-2 are header + note
            for col, val in enumerate(row_vals, 1):
                cell = ws.cell(row=data_row, column=col, value=val)
                cell.border = thin
                cell.alignment = center if col in (1, 2, 5, 6, 7, 8) else left
                if col <= 4:
                    cell.fill = info_fill
                elif col == 6:
                    cell.fill = calc_fill
                    cell.font = Font(italic=True, color="888888", size=10)
                else:
                    cell.fill = edit_fill
            ws.row_dimensions[data_row].height = 18

        ws.freeze_panes = "E3"  # freeze cols A-D + rows 1-2

        import io
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        fname = f"MauNhapPhep_{year}.xlsx"
        resp = HttpResponse(
            buf.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = f'attachment; filename="{fname}"'
        return resp


class LeaveImportView(APIView):
    """POST /api/leave/hnh-leave-import/?dry_run=true — parse+preview or import Excel."""

    def post(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B mới có thể nhập dữ liệu."}, status=403)

        from openpyxl import load_workbook
        from leave.models import LeaveType
        import io

        dry_run = request.query_params.get("dry_run", "false").lower() == "true"

        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Vui lòng upload file Excel (.xlsx)."}, status=400)

        try:
            wb = load_workbook(io.BytesIO(uploaded.read()), data_only=True)
            ws = wb.active
        except Exception:
            return Response({"detail": "File không hợp lệ. Vui lòng dùng file .xlsx từ mẫu."}, status=400)

        def _find_type(*keywords):
            for kw in keywords:
                t = LeaveType.objects.filter(name__icontains=kw).first()
                if t:
                    return t
            return None

        annual_type = _find_type("phép năm", "annual")
        bu_type     = _find_type("phép bù")

        emp_map = {
            e.badge_id: e
            for e in Employee.objects.filter(is_active=True)
            if e.badge_id
        }

        errors: list[dict] = []
        preview: list[dict] = []
        updated = 0
        skipped = 0

        # Rows start at row 3 (row 1 = header, row 2 = note)
        all_rows = list(ws.iter_rows(min_row=3, values_only=True))

        def _parse_num(val, label):
            if val is None or val == "":
                return None, None
            try:
                n = float(val)
                if n < 0:
                    return None, f"{label} không thể âm"
                return round(n, 2), None
            except (ValueError, TypeError):
                return None, f"{label} không hợp lệ: '{val}'"

        for row_idx, row in enumerate(all_rows, 3):
            if not row or not any(row):
                continue

            badge_id = str(row[1]).strip() if row[1] is not None else ""
            if not badge_id:
                skipped += 1
                continue

            emp = emp_map.get(badge_id)
            if emp is None:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": f"Không tìm thấy NV mã '{badge_id}'"})
                skipped += 1
                continue

            annual_new, err = _parse_num(row[4], "Phép đầu năm")
            if err:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": err})
                skipped += 1
                continue

            bu_new, err = _parse_num(row[6], "Phép bù")
            if err:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": err})
                skipped += 1
                continue

            carry_new, err = _parse_num(row[7], "Phép tồn")
            if err:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": err})
                skipped += 1
                continue

            # Read current values for diff preview
            annual_before = 0.0
            carry_before  = 0.0
            bu_before     = 0.0

            if annual_type:
                av = AvailableLeave.objects.filter(employee_id=emp, leave_type_id=annual_type).first()
                if av:
                    annual_before = float(av.available_days or 0)
                    carry_before  = float(av.carryforward_days or 0)

            if bu_type:
                bav = AvailableLeave.objects.filter(employee_id=emp, leave_type_id=bu_type).first()
                if bav:
                    bu_before = float(bav.available_days or 0)

            annual_after = annual_new if annual_new is not None else annual_before
            bu_after     = bu_new     if bu_new     is not None else bu_before
            carry_after  = carry_new  if carry_new  is not None else carry_before

            changed = (
                annual_after != annual_before or
                bu_after     != bu_before     or
                carry_after  != carry_before
            )

            preview.append({
                "row": row_idx,
                "badge_id": badge_id,
                "name": str(emp),
                "annual_before": annual_before,
                "annual_after": annual_after,
                "bu_before": bu_before,
                "bu_after": bu_after,
                "carry_before": carry_before,
                "carry_after": carry_after,
                "changed": changed,
            })

            if not dry_run:
                if annual_type and (annual_new is not None or carry_new is not None):
                    av, _ = AvailableLeave.objects.get_or_create(
                        employee_id=emp,
                        leave_type_id=annual_type,
                        defaults={"available_days": 0, "total_leave_days": 0, "carryforward_days": 0, "is_active": True},
                    )
                    if annual_new is not None:
                        av.available_days = annual_new
                        av.total_leave_days = annual_new
                    if carry_new is not None:
                        av.carryforward_days = carry_new
                    av.is_active = True
                    av.save()

                if bu_type and bu_new is not None:
                    bav, _ = AvailableLeave.objects.get_or_create(
                        employee_id=emp,
                        leave_type_id=bu_type,
                        defaults={"available_days": 0, "total_leave_days": 0, "is_active": True},
                    )
                    bav.available_days = bu_new
                    bav.total_leave_days = bu_new
                    bav.is_active = True
                    bav.save()

            updated += 1

        return Response({
            "dry_run": dry_run,
            "rows_processed": updated + skipped,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:30],
            "preview": preview[:200],
        })


def _credit_bu_days(employee: Employee, days: float):
    """Add approved Phép Bù days to the employee's AvailableLeave for Phép Bù LeaveType."""
    from leave.models import AvailableLeave, LeaveType

    bu_type = LeaveType.objects.filter(
        name__icontains="phép bù"
    ).first()
    if bu_type is None:
        return

    avail, created = AvailableLeave.objects.get_or_create(
        employee_id=employee,
        leave_type_id=bu_type,
        defaults={"available_days": 0, "total_leave_days": 0},
    )
    avail.available_days = (avail.available_days or 0) + days
    avail.total_leave_days = (avail.total_leave_days or 0) + days
    avail.save()

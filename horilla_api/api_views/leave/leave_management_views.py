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

        data = []
        for p in qs[:50]:
            data.append({
                "id": p.id,
                "employee_id": p.employee_id_id,
                "employee_name": str(p.employee_id),
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

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

from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from employee.models import Employee
from leave.models import AvailableLeave, HNHCompensatoryProposal

# Đăng ký transform __unaccent (Postgres) để tìm HỌ TÊN không dấu. Cần extension
# unaccent (bật bằng migration). Idempotent — bọc try để không lỗi khi import lại.
try:
    import unicodedata as _ud
    from django.db.models import CharField as _CF, TextField as _TF, Transform as _Tr

    class _Unaccent(_Tr):
        lookup_name = "unaccent"
        function = "UNACCENT"

    try:
        _CF.register_lookup(_Unaccent)
        _TF.register_lookup(_Unaccent)
    except Exception:
        pass

    def _vn_unaccent(s: str) -> str:
        """Bỏ dấu tiếng Việt phía value (khớp UNACCENT của Postgres, gồm đ→d)."""
        s = _ud.normalize("NFD", s or "")
        s = "".join(c for c in s if _ud.category(c) != "Mn")
        return s.replace("đ", "d").replace("Đ", "D")
except Exception:  # pragma: no cover
    def _vn_unaccent(s: str) -> str:
        return s or ""


def _parse_ymd(v):
    try:
        return date.fromisoformat((v or "").strip())
    except (ValueError, TypeError):
        return None


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
    """Ngày phép thâm niên = floor(số năm làm việc / 5) — luật VN: +1 ngày mỗi
    5 năm thâm niên (khớp số dư đã nhập từ file). Trước đây dùng floor(years-5)
    (+1 ngày MỖI NĂM sau năm 5) → hiển thị dư khủng khiếp cho NV lâu năm."""
    try:
        join_date = emp.employee_work_info.date_joining
    except Exception:
        return 0.0
    if not join_date:
        return 0.0
    years = (date.today() - join_date).days / 365.25
    return float(math.floor(years / 5))


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


# Loại phép TRỪ vào số dư (cộng ra "Phép đầu" — khớp cột grid Nghỉ phép Tháng).
_DEDUCT_LEAVE_NAMES = ["Nghỉ phép năm", "Phép Bù", "Phép Thâm Niên"]


def _find_leave_type(*keywords):
    """Tìm LeaveType theo tên (icontains, thử lần lượt từng keyword)."""
    from leave.models import LeaveType
    for kw in keywords:
        t = LeaveType.objects.filter(name__icontains=kw).first()
        if t:
            return t
    return None


def _vn_full_name(emp) -> str:
    """Tên NV chuẩn VN: Họ đệm + Tên (last_name + first_name), KHÔNG kèm mã.
    Khác Employee.__str__ (= 'first_name last_name (badge)') vốn sai thứ tự VN."""
    last = (emp.employee_last_name or "").strip()
    first = (emp.employee_first_name or "").strip()
    return f"{last} {first}".strip()


# 4 trường phép cốt lõi HNH luôn phải hiển thị (kể cả NV chưa có số dư → 0 để C&B
# sửa tay). Phép tồn = carryforward_days nằm trong card Phép năm, nên chỉ cần đảm
# bảo 3 loại row: Phép năm, Phép thâm niên, Phép bù.
_CORE_LEAVE_TYPE_KEYWORDS = [
    ("phép năm", "annual"),
    ("thâm niên", "seniority"),
    ("phép bù",),
]


def _can_view_employee(request, me, emp):
    """C&B xem mọi NV; quản lý xem NV dưới quyền; NV xem chính mình."""
    if me and emp and emp.id == me.id:
        return True
    if _is_cnb(request):
        return True
    if me is None:
        return False
    return Employee.objects.filter(
        id=emp.id, employee_work_info__reporting_manager_id=me, is_active=True
    ).exists()


class HNHLeaveDetailView(APIView):
    """GET /api/leave/hnh-leave-detail/?employee_id=<id>

    Chi tiết số dư phép của 1 NV theo TỪNG loại + đã dùng năm nay, cộng ra tổng
    (khớp cột "Phép đầu" của Nghỉ phép Tháng). C&B xem mọi NV; QL xem NV dưới
    quyền; NV xem chính mình.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        me = _get_employee(request)
        if me is None:
            return Response({"detail": "Không có hồ sơ nhân viên"}, status=404)

        emp_id = request.query_params.get("employee_id")
        if not emp_id:
            emp = me
        else:
            emp = (
                Employee.objects.filter(id=emp_id)
                .select_related("employee_work_info__department_id", "employee_work_info__company_id")
                .first()
            )
            if emp is None:
                return Response({"detail": "Không tìm thấy nhân viên"}, status=404)

        if not _can_view_employee(request, me, emp):
            return Response({"detail": "Không có quyền xem nhân viên này"}, status=403)

        # đã dùng năm nay theo leave_type_id
        usage = {u["leave_type_id"]: u for u in _usage_this_year(emp)}

        balances = []
        total_start = 0.0
        for al in AvailableLeave.objects.filter(employee_id=emp).select_related("leave_type_id"):
            lt = al.leave_type_id
            if not lt:
                continue
            start = round((al.available_days or 0) + (al.carryforward_days or 0), 2)
            u = usage.get(lt.id, {})
            deduct = lt.name in _DEDUCT_LEAVE_NAMES
            balances.append({
                "id": al.id,
                "leave_type_id": lt.id,
                "name": lt.name,
                "available_days": round(al.available_days or 0, 2),
                "carryforward_days": round(al.carryforward_days or 0, 2),
                "start": start,                          # Phép đầu (loại này)
                "taken_this_year": u.get("days", 0.0),   # đã dùng năm nay
                "count_this_year": u.get("count", 0),
                "deduct": deduct,                        # có trừ vào tổng dư không
            })
            if deduct:
                total_start += start

        # Luôn hiện đủ các loại phép cốt lõi — NV chưa có row (VD nhân sự mới up
        # lên) vẫn hiện 0 để C&B sửa tay. hnh-adjust-balance get_or_create theo
        # leave_type_id nên lưu được dù id=None.
        present_ids = {b["leave_type_id"] for b in balances}
        for kws in _CORE_LEAVE_TYPE_KEYWORDS:
            lt = _find_leave_type(*kws)
            if lt is None or lt.id in present_ids:
                continue
            u = usage.get(lt.id, {})
            balances.append({
                "id": None,
                "leave_type_id": lt.id,
                "name": lt.name,
                "available_days": 0.0,
                "carryforward_days": 0.0,
                "start": 0.0,
                "taken_this_year": u.get("days", 0.0),
                "count_this_year": u.get("count", 0),
                "deduct": lt.name in _DEDUCT_LEAVE_NAMES,
            })
            present_ids.add(lt.id)

        # loại trừ-dư lên đầu, rồi theo tên
        balances.sort(key=lambda b: (not b["deduct"], b["name"]))

        wi = getattr(emp, "employee_work_info", None)
        dept = str(wi.department_id) if (wi and wi.department_id) else ""
        comp = wi.company_id.company if (wi and wi.company_id) else ""

        return Response({
            "employee": {
                "id": emp.id,
                "name": _vn_full_name(emp),
                "badge_id": emp.badge_id or "",
                "master_data_code": getattr(emp, "master_data_code", "") or "",
                "department": dept,
                "company": comp,
            },
            "balances": balances,
            "total_start": round(total_start, 2),   # tổng Phép đầu (các loại trừ-dư)
            "is_cnb": _is_cnb(request),
        })


class HNHAdjustBalanceView(APIView):
    """POST /api/leave/hnh-adjust-balance/ — C&B chỉnh tay số dư 1 loại phép cho
    1 NV (upsert AvailableLeave), không phải import cả công ty cho mỗi điều chỉnh.

    Body: {employee_id, leave_type_id, available_days, carryforward_days, reason}
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B được chỉnh số dư phép"}, status=403)

        from leave.models import LeaveType

        emp = Employee.objects.filter(id=request.data.get("employee_id")).first()
        lt = LeaveType.objects.filter(id=request.data.get("leave_type_id")).first()
        if not emp or not lt:
            return Response({"detail": "Thiếu nhân viên hoặc loại phép"}, status=400)
        try:
            avail = round(float(request.data.get("available_days")), 2)
            carry = round(float(request.data.get("carryforward_days", 0) or 0), 2)
        except (TypeError, ValueError):
            return Response({"detail": "Số ngày không hợp lệ"}, status=400)
        if avail < 0 or carry < 0:
            return Response({"detail": "Số ngày không được âm"}, status=400)

        al, created = AvailableLeave.objects.get_or_create(
            employee_id=emp, leave_type_id=lt,
            defaults={"available_days": 0, "carryforward_days": 0, "assigned_date": date.today()},
        )
        old_avail, old_carry = al.available_days, al.carryforward_days
        al.available_days = avail
        al.carryforward_days = carry
        al.is_active = True
        al.save()  # save() tự tính total_leave_days

        reason = (request.data.get("reason") or "").strip()
        import logging
        logging.getLogger("hnh.leave").info(
            "ADJUST BALANCE by=%s emp=%s(%s) type=%s avail %s->%s carry %s->%s reason=%r",
            getattr(request.user, "username", "?"), emp.id, emp.badge_id, lt.name,
            old_avail, avail, old_carry, carry, reason,
        )

        return Response({
            "id": al.id,
            "leave_type_id": lt.id,
            "name": lt.name,
            "available_days": round(al.available_days, 2),
            "carryforward_days": round(al.carryforward_days, 2),
            "start": round(al.available_days + al.carryforward_days, 2),
            "created": created,
        })


def _refund_leave_balance(lr):
    """Hoàn số dư phép đã trừ lúc duyệt về AvailableLeave của loại nghỉ (chống hoàn
    2 lần bằng cờ balance_refunded). Trả (available_hoàn, carryforward_hoàn)."""
    from leave.models import AvailableLeave
    if getattr(lr, "balance_refunded", False):
        return 0.0, 0.0
    av = round(lr.approved_available_days or 0, 2)
    cf = round(lr.approved_carryforward_days or 0, 2)
    lr.balance_refunded = True
    if av <= 0 and cf <= 0:
        return 0.0, 0.0  # đơn chưa từng trừ (huỷ khi đang chờ / nghỉ không lương)
    al, _ = AvailableLeave.objects.get_or_create(
        employee_id=lr.employee_id, leave_type_id=lr.leave_type_id
    )
    al.available_days = round((al.available_days or 0) + av, 2)
    al.carryforward_days = round((al.carryforward_days or 0) + cf, 2)
    al.save()
    return av, cf


class HNHCancelApprovedView(APIView):
    """POST /api/leave/hnh-cancel-approved/<pk>/ — C&B hủy đơn ĐÃ DUYỆT khi NV
    không nghỉ nữa (vẫn đi làm). HOÀN LẠI số dư phép đã trừ (không mất). Đơn giữ
    lại ở trạng thái 'cancelled' (xem ở tab Đã Xóa). Body: {reason}.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B được hủy đơn đã duyệt"}, status=403)

        from leave.models import LeaveRequest

        lr = (
            LeaveRequest.objects.filter(id=pk)
            .select_related("employee_id__employee_user_id", "leave_type_id")
            .first()
        )
        if lr is None:
            return Response({"detail": "Không tìm thấy đơn"}, status=404)
        if lr.status != "approved":
            return Response(
                {"detail": f"Chỉ hủy được đơn đã duyệt (đơn đang: {lr.status})"},
                status=400,
            )

        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "Cần nhập lý do hủy"}, status=400)

        me = _get_employee(request)
        lr.status = "cancelled"
        lr.cancelled_by = me
        lr.cancel_reason = reason
        lr.cancelled_at = timezone.now()
        # HOÀN số dư phép đã trừ về NV (không để mất). Chống hoàn 2 lần.
        ref_av, ref_cf = _refund_leave_balance(lr)
        lr.save()

        import logging

        logging.getLogger("hnh.leave").info(
            "CANCEL APPROVED by=%s lr=%s emp=%s type=%s %s..%s reason=%r",
            getattr(request.user, "username", "?"), lr.id, lr.employee_id_id,
            lr.leave_type_id.name, lr.start_date, lr.end_date, reason,
        )

        # Báo NV + watchers (không chặn nếu notify lỗi)
        import contextlib

        from notifications.signals import notify

        verb = (
            f"Đơn nghỉ {lr.leave_type_id.name} ({lr.start_date}) đã bị C&B hủy: {reason}"
        )
        redirect = f"/leave/user-request-view?id={lr.id}"
        emp = lr.employee_id
        if emp and emp.employee_user_id_id:
            with contextlib.suppress(Exception):
                notify.send(request.user, recipient=emp.employee_user_id, verb=verb,
                            icon="close-circle", redirect=redirect)
        with contextlib.suppress(Exception):
            from leave.models import LeaveRequestWatcher

            watchers = LeaveRequestWatcher.objects.filter(
                leave_request_id=lr
            ).select_related("employee_id__employee_user_id")
            for link in watchers:
                w = link.employee_id
                if w and w.employee_user_id_id and (me is None or w.id != me.id):
                    with contextlib.suppress(Exception):
                        notify.send(request.user, recipient=w.employee_user_id,
                                    verb=verb, icon="close-circle", redirect=redirect)

        return Response({
            "id": lr.id,
            "status": lr.status,
            "cancelled_by": str(me) if me else None,
            "cancel_reason": lr.cancel_reason,
            "cancelled_at": lr.cancelled_at.isoformat() if lr.cancelled_at else None,
            "refunded_days": round(ref_av + ref_cf, 2),
        })


class HNHApprovedLeavesView(APIView):
    """GET /api/leave/hnh-approved-leaves/?status=approved|requested&company&department&month=YYYY-MM&only_conflicts=1
    — liệt kê đơn nghỉ cho C&B xem/xử lý. `status=approved` (mặc định): đơn ĐÃ DUYỆT
    trong tháng đang xem, kèm `worked_days` = ngày NV ĐÃ CHẤM CÔNG trong khoảng nghỉ
    (rỗng nếu không xung đột) → `has_conflict` cảnh báo "NV đã đi làm ngày nghỉ";
    only_conflicts=1 → chỉ trả đơn xung đột. `status=requested`: đơn ĐANG CHỜ DUYỆT
    (toàn công ty, KHÔNG lọc tháng) để C&B duyệt/từ chối. Chỉ C&B.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B"}, status=403)

        from attendance.models import AttendanceActivity
        from leave.models import LeaveRequest

        status_param = request.query_params.get("status", "approved")
        if status_param not in ("approved", "requested", "cancelled"):
            status_param = "approved"

        today = timezone.localdate()
        try:
            y, m = (int(x) for x in request.query_params.get("month", "").split("-"))
            date(y, m, 1)
        except (AttributeError, ValueError):
            y, m = today.year, today.month
        m_start = date(y, m, 1)
        m_end = date(y, m, monthrange(y, m)[1])
        only_conflicts = request.query_params.get("only_conflicts") in ("1", "true")

        qs = LeaveRequest.objects.filter(status=status_param)
        if status_param == "approved":
            # Đơn đã duyệt: lọc theo tháng đang xem (khớp UX cũ).
            qs = qs.filter(start_date__lte=m_end).filter(
                Q(end_date__gte=m_start) | Q(end_date__isnull=True)
            )
        elif status_param == "cancelled":
            # Đơn đã xóa: lọc theo NGÀY HỦY trong tháng đang xem.
            qs = qs.filter(cancelled_at__date__gte=m_start, cancelled_at__date__lte=m_end)
        # Đơn chờ duyệt: KHÔNG lọc tháng — hiện tất cả để C&B duyệt kịp.

        company_id = request.query_params.get("company")
        dept_id = request.query_params.get("department")
        if company_id:
            qs = qs.filter(employee_id__employee_work_info__company_id=company_id)
        if dept_id:
            qs = qs.filter(employee_id__employee_work_info__department_id=dept_id)
        # Tìm theo Họ tên, Mã nhân sự HRM (badge_id) và Mã Kế toán (accounting_code).
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(employee_id__employee_first_name__icontains=q)
                | Q(employee_id__employee_last_name__icontains=q)
                | Q(employee_id__badge_id__icontains=q)
                | Q(employee_id__accounting_code__icontains=q)
            )
        qs = qs.select_related(
            "employee_id",
            "leave_type_id",
            "cancelled_by",
            "employee_id__employee_work_info__department_id",
            "employee_id__employee_work_info__company_id",
        )
        # Sắp xếp: Đơn CHỜ/ĐÃ DUYỆT theo ngày gửi mới nhất; Đơn ĐÃ XÓA theo ngày
        # HỦY mới nhất trên cùng.
        if status_param == "cancelled":
            from django.db.models.functions import Coalesce
            qs = qs.order_by(Coalesce("cancelled_at", "created_at").desc(), "-id")
        else:
            qs = qs.order_by("-created_at", "-id")

        lrs = list(qs[:500])

        # Đơn NÀO C&B hiện tại đã đánh dấu "đã xem xét" (toggle nhanh) — áp dụng
        # cho cả đơn chờ duyệt lẫn đã duyệt.
        seen_ids: set = set()
        if lrs:
            me = _get_employee(request)
            if me is not None:
                from leave.models import HNHLeaveRequestSeen
                seen_ids = set(
                    HNHLeaveRequestSeen.objects.filter(
                        employee=me, leave_request_id__in=[lr.id for lr in lrs]
                    ).values_list("leave_request_id", flat=True)
                )

        results = []
        for lr in lrs:
            end = lr.end_date or lr.start_date
            # Chỉ đơn đã duyệt mới cần dò xung đột chấm công.
            if status_param == "approved":
                worked = list(
                    AttendanceActivity.objects.filter(
                        employee_id=lr.employee_id,
                        attendance_date__range=[lr.start_date, end],
                    )
                    .values_list("attendance_date", flat=True)
                    .distinct()
                )
            else:
                worked = []
            if only_conflicts and not worked:
                continue
            wi = getattr(lr.employee_id, "employee_work_info", None)
            results.append({
                "id": lr.id,
                "employee_id": lr.employee_id_id,
                "employee_name": str(lr.employee_id),
                "badge_id": lr.employee_id.badge_id,
                "accounting_code": getattr(lr.employee_id, "accounting_code", None) or "",
                "department": wi.department_id.department if wi and wi.department_id else None,
                "company": wi.company_id.company if wi and wi.company_id else None,
                "leave_type": lr.leave_type_id.name,
                "start_date": lr.start_date.isoformat(),
                "end_date": end.isoformat(),
                "requested_days": lr.requested_days,
                "description": lr.description,
                "status": lr.status,
                "has_conflict": bool(worked),
                "worked_days": sorted(d.isoformat() for d in worked),
                # Ngày gửi (để hiện + tham chiếu), ngày duyệt, trạng thái đã xem.
                "requested_date": (lr.created_at.isoformat() if lr.created_at
                                   else (lr.requested_date.isoformat() if lr.requested_date else None)),
                "approved_at": lr.approved_at.isoformat() if getattr(lr, "approved_at", None) else None,
                "seen": lr.id in seen_ids,
                # Thông tin HỦY (cho tab Đã Xóa).
                "cancelled_at": lr.cancelled_at.isoformat() if getattr(lr, "cancelled_at", None) else None,
                "cancelled_by": _vn_full_name(lr.cancelled_by) if getattr(lr, "cancelled_by", None) else None,
                "cancel_reason": getattr(lr, "cancel_reason", "") or "",
                "refunded_days": round((lr.approved_available_days or 0) + (lr.approved_carryforward_days or 0), 2) if getattr(lr, "balance_refunded", False) else 0,
            })

        # Tab ĐÃ DUYỆT & CHƯA DUYỆT: sắp xếp CHƯA XEM trước (đẩy đơn đã xem xuống);
        # trong mỗi nhóm, đơn có NGÀY NGHỈ (start_date) SÁT ngày hiện tại lên trước.
        if status_param in ("approved", "requested"):
            def _seen_date_sort_key(r):
                try:
                    dist = abs((date.fromisoformat(r["start_date"]) - today).days)
                except (ValueError, TypeError):
                    dist = 10 ** 9
                return (r["seen"], dist, r["start_date"])
            results.sort(key=_seen_date_sort_key)

        return Response(results)


class HNHMarkLeaveSeenView(APIView):
    """POST /api/leave/hnh-mark-seen/<pk>/ {seen?: bool} — C&B TOGGLE đánh dấu 1
    đơn (chờ duyệt hoặc đã duyệt) "đã xem xét" hay chưa. Body `seen=false` để bỏ
    đánh dấu; mặc định (hoặc true) để đánh dấu đã xem. Mỗi C&B có trạng thái riêng."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B"}, status=403)
        me = _get_employee(request)
        if me is None:
            return Response({"detail": "Không có hồ sơ nhân viên"}, status=400)
        from leave.models import HNHLeaveRequestSeen, LeaveRequest
        if not LeaveRequest.objects.filter(id=pk).exists():
            return Response({"detail": "Không tìm thấy đơn"}, status=404)
        raw = request.data.get("seen", True)
        seen = raw if isinstance(raw, bool) else str(raw).strip().lower() not in ("false", "0", "no", "")
        if seen:
            HNHLeaveRequestSeen.objects.get_or_create(leave_request_id=pk, employee=me)
        else:
            HNHLeaveRequestSeen.objects.filter(leave_request_id=pk, employee=me).delete()
        return Response({"seen": seen})


class HNHLeaveRequestDetailView(APIView):
    """GET /api/leave/hnh-leave-request-detail/<pk>/ — chi tiết ĐẦY ĐỦ 1 đơn nghỉ:
    thông tin đơn, người gửi, ngày gửi, ngày duyệt, người duyệt, người theo dõi.
    Quyền: C&B / quản lý NV / chính chủ đơn."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from leave.models import LeaveRequest, LeaveRequestWatcher
        lr = (
            LeaveRequest.objects.select_related(
                "employee_id", "leave_type_id", "created_by", "approved_by",
                "cancelled_by", "employee_id__employee_work_info__department_id",
                "employee_id__employee_work_info__company_id",
            )
            .filter(id=pk)
            .first()
        )
        if lr is None:
            return Response({"detail": "Không tìm thấy đơn"}, status=404)
        me = _get_employee(request)
        is_watcher = bool(
            me and LeaveRequestWatcher.objects.filter(
                leave_request_id=lr, employee_id=me
            ).exists()
        )
        if not (
            _is_cnb(request)
            or (me and lr.employee_id_id == me.id)
            or _can_view_employee(request, me, lr.employee_id)
            or is_watcher
        ):
            return Response({"detail": "Không có quyền xem đơn này"}, status=403)

        wi = getattr(lr.employee_id, "employee_work_info", None)
        watchers = [
            {
                "id": w.employee_id_id,
                "name": _vn_full_name(w.employee_id),
                "badge_id": w.employee_id.badge_id,
            }
            for w in LeaveRequestWatcher.objects.filter(
                leave_request_id=lr
            ).select_related("employee_id")
        ]
        end = lr.end_date or lr.start_date
        return Response({
            "id": lr.id,
            "employee_name": _vn_full_name(lr.employee_id),
            "badge_id": lr.employee_id.badge_id,
            "department": wi.department_id.department if wi and wi.department_id else None,
            "company": wi.company_id.company if wi and wi.company_id else None,
            "leave_type": lr.leave_type_id.name if lr.leave_type_id else None,
            "start_date": lr.start_date.isoformat() if lr.start_date else None,
            "end_date": end.isoformat() if end else None,
            "is_hourly": bool(getattr(lr, "is_hourly", False)),
            "start_time": lr.start_time.strftime("%H:%M") if getattr(lr, "start_time", None) else None,
            "end_time": lr.end_time.strftime("%H:%M") if getattr(lr, "end_time", None) else None,
            "start_date_breakdown": getattr(lr, "start_date_breakdown", None),
            "requested_days": lr.requested_days,
            "requested_hours": getattr(lr, "requested_hours", None),
            "description": lr.description or "",
            "status": lr.status,
            "reject_reason": getattr(lr, "reject_reason", "") or "",
            # Người gửi + thời gian gửi
            "requested_date": (lr.created_at.isoformat() if lr.created_at
                               else (lr.requested_date.isoformat() if lr.requested_date else None)),
            "created_by": _vn_full_name(lr.created_by) if lr.created_by else _vn_full_name(lr.employee_id),
            # Người duyệt + thời gian duyệt
            "approved_at": lr.approved_at.isoformat() if getattr(lr, "approved_at", None) else None,
            "approved_by": _vn_full_name(lr.approved_by) if getattr(lr, "approved_by", None) else None,
            # Hủy (nếu có)
            "cancelled_at": lr.cancelled_at.isoformat() if getattr(lr, "cancelled_at", None) else None,
            "cancelled_by": _vn_full_name(lr.cancelled_by) if getattr(lr, "cancelled_by", None) else None,
            "cancel_reason": getattr(lr, "cancel_reason", "") or "",
            # Người theo dõi
            "watchers": watchers,
        })


class HNHLeaveCountsView(APIView):
    """GET /api/leave/hnh-leave-counts/?month=&company=&department= — số lượng để
    hiển thị cạnh nhãn tab: đơn CHỜ duyệt, đơn ĐÃ duyệt (trong tháng đang xem),
    đề xuất Phép Bù đang chờ. Chỉ C&B (khớp scope các list tương ứng)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request):
            return Response({"pending": 0, "approved": 0, "bu_pending": 0})
        from leave.models import LeaveRequest

        company_id = request.query_params.get("company")
        dept_id = request.query_params.get("department")

        def _scope(qs):
            if company_id:
                qs = qs.filter(employee_id__employee_work_info__company_id=company_id)
            if dept_id:
                qs = qs.filter(employee_id__employee_work_info__department_id=dept_id)
            return qs

        pending = _scope(LeaveRequest.objects.filter(status="requested")).count()

        today = timezone.localdate()
        try:
            y, m = (int(x) for x in request.query_params.get("month", "").split("-"))
            date(y, m, 1)
        except (AttributeError, ValueError):
            y, m = today.year, today.month
        m_start = date(y, m, 1)
        m_end = date(y, m, monthrange(y, m)[1])
        approved = _scope(
            LeaveRequest.objects.filter(status="approved", start_date__lte=m_end).filter(
                Q(end_date__gte=m_start) | Q(end_date__isnull=True)
            )
        ).count()

        bu_pending = _scope(
            HNHCompensatoryProposal.objects.filter(status="requested")
        ).count()

        # Đơn ĐÃ XÓA trong tháng đang xem (theo ngày huỷ) — cho badge tab Đã Xóa.
        cancelled = _scope(
            LeaveRequest.objects.filter(status="cancelled", cancelled_at__date__gte=m_start,
                                        cancelled_at__date__lte=m_end)
        ).count()

        return Response({"pending": pending, "approved": approved, "bu_pending": bu_pending,
                         "cancelled": cancelled})


def _cb_rule_dict(r):
    return {
        "id": r.id,
        "company_id": r.company_id_id,
        "company": r.company_id.company if r.company_id else None,
        "department_id": r.department_id_id,
        "department": r.department_id.department if r.department_id else None,
        "manager_id": r.manager_id_id,
        "manager_name": str(r.manager_id) if r.manager_id else None,
        "manager_badge": r.manager_id.badge_id if r.manager_id else None,
    }


class HNHCBManagersView(APIView):
    """GET  /api/leave/hnh-cb-managers/  — C&B liệt kê rule người duyệt (cty/phòng→người).
    POST /api/leave/hnh-cb-managers/  — upsert theo (company_id, department_id).
    Body: {company_id|null, department_id|null, manager_id}. Chỉ C&B.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B"}, status=403)
        from leave.models import CBLeaveManager

        qs = CBLeaveManager.objects.select_related(
            "company_id", "department_id", "manager_id"
        ).order_by("company_id__company", "department_id__department")
        return Response([_cb_rule_dict(r) for r in qs])

    def post(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B"}, status=403)
        from leave.models import CBLeaveManager

        manager = Employee.objects.filter(
            id=request.data.get("manager_id"), is_active=True
        ).first()
        if not manager:
            return Response({"detail": "Thiếu/không hợp lệ người duyệt"}, status=400)
        company_id = request.data.get("company_id") or None
        department_id = request.data.get("department_id") or None

        # unique_together (company_id, department_id) → upsert đúng 1 rule/tổ hợp.
        rule, created = CBLeaveManager.objects.update_or_create(
            company_id_id=company_id,
            department_id_id=department_id,
            defaults={"manager_id": manager},
        )
        rule = (
            CBLeaveManager.objects.select_related(
                "company_id", "department_id", "manager_id"
            ).get(id=rule.id)
        )
        return Response({**_cb_rule_dict(rule), "created": created})


class HNHCBManagerDetailView(APIView):
    """DELETE /api/leave/hnh-cb-managers/<pk>/ — xoá 1 rule. Chỉ C&B."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B"}, status=403)
        from leave.models import CBLeaveManager

        deleted, _ = CBLeaveManager.objects.filter(id=pk).delete()
        if not deleted:
            return Response({"detail": "Không tìm thấy rule"}, status=404)
        return Response(status=204)


class HNHApproverMapView(APIView):
    """GET /api/leave/hnh-approver-map/?company&department — mỗi NV: quản lý trực
    tiếp (reporting_manager) + người C&B duyệt (resolved theo rule). Chỉ C&B.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B"}, status=403)
        from leave.models import resolve_cb_manager

        qs = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info__reporting_manager_id",
            "employee_work_info__department_id",
            "employee_work_info__company_id",
        )
        company_id = request.query_params.get("company")
        dept_id = request.query_params.get("department")
        if company_id:
            qs = qs.filter(employee_work_info__company_id=company_id)
        if dept_id:
            qs = qs.filter(employee_work_info__department_id=dept_id)

        data = []
        for e in qs.order_by("employee_first_name")[:300]:
            wi = getattr(e, "employee_work_info", None)
            rm = wi.reporting_manager_id if wi else None
            cb = resolve_cb_manager(e)
            data.append({
                "id": e.id,
                "name": _vn_full_name(e),
                "badge_id": e.badge_id,
                "department": wi.department_id.department if wi and wi.department_id else None,
                "company": wi.company_id.company if wi and wi.company_id else None,
                "reporting_manager": str(rm) if rm else None,
                "cb_manager": str(cb) if cb else None,
            })
        return Response(data)


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
                "name": _vn_full_name(e),
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

        # Nghỉ không lương — tách riêng, KHÔNG trừ vào số dư phép (Còn lại)
        unpaid_ids = list(
            LeaveType.objects.filter(name__in=["Nghỉ không lương"]).values_list("id", flat=True)
        )
        taken_unpaid: dict = {}
        if unpaid_ids:
            for lr in LeaveRequest.objects.filter(
                employee_id__in=emp_ids, status="approved", leave_type_id__in=unpaid_ids,
                start_date__gte=month_start, start_date__lte=month_end,
            ):
                taken_unpaid[lr.employee_id_id] = taken_unpaid.get(lr.employee_id_id, 0.0) + (lr.requested_days or 0)

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
            deduct_v = round(taken_month.get(e.id, 0.0), 2)    # Phát sinh: Trừ phép
            unpaid_v = round(taken_unpaid.get(e.id, 0.0), 2)   # Phát sinh: Không lương
            emp_data.append({
                "id": e.id,
                "name": _vn_full_name(e),
                "badge_id": e.badge_id or "",
                "accounting_code": getattr(e, "accounting_code", None) or "",
                "department": dept_name,
                "dept_id": dept_id_val,
                "company": comp_name,
                "company_id": comp_id_val,
                "leave_start": start_v,        # Phép đầu
                "leave_deduct": deduct_v,      # Phát sinh: Trừ phép (trừ vào số dư)
                "leave_unpaid": unpaid_v,      # Phát sinh: Không lương (không trừ số dư)
                "leave_taken": round(deduct_v + unpaid_v, 2),  # Tổng phát sinh (dùng cho lọc)
                "leave_end": round(start_v - deduct_v, 2),     # Còn lại = Phép đầu − Trừ phép
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
            lt_name = lr.leave_type_id.name if lr.leave_type_id else "?"
            code = _code(lt_name)
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
                    "name": lt_name,
                    "status": lr.status,
                    "is_morning": is_morning,
                    "is_afternoon": is_afternoon,
                    "is_hourly": bool(getattr(lr, "is_hourly", False)),
                    "time_range": time_range,
                    # Chi tiết đơn (cho modal khi bấm vào ô) — toàn bộ đơn, không phải 1 ngày.
                    "start_date": lr.start_date.isoformat() if lr.start_date else None,
                    "end_date": (lr.end_date or lr.start_date).isoformat() if lr.start_date else None,
                    "requested_days": lr.requested_days,
                    "requested_hours": getattr(lr, "requested_hours", None),
                    "description": lr.description or "",
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


class HNHLeaveOverviewExportView(APIView):
    """GET /api/leave/hnh-leave-overview/export/?year=&month=&dept_id=&company_id=&search=&arising=
    Xuất Excel ĐÚNG lưới Tổng quan Nghỉ phép đang hiển thị: cột cố định (Mã NV,
    Tên NV, Mã kế toán, Phòng ban, Công ty, Phép đầu, Trừ phép, Không lương, Còn
    lại) + từng NGÀY trong tháng (Gantt — mã loại phép mỗi ô). Tái dùng logic của
    HNHLeaveOverviewView để dữ liệu không lệch; lọc search + phát sinh để khớp
    đúng các dòng đang hiển thị trên màn hình.
    """

    def get(self, request):
        # Tái dùng nguyên khối tính toán của view tổng quan (cùng scope + filter).
        overview = HNHLeaveOverviewView().get(request)
        if getattr(overview, "status_code", 200) != 200:
            return overview
        data = overview.data
        employees = list(data["employees"])
        cells = data["cells"]
        day_strs = data["days"]  # ['YYYY-MM-DD', ...]
        year = data["year"]
        month = data["month"]

        # Lọc phía client (search + phát sinh) để khớp đúng bảng đang hiển thị.
        import unicodedata

        def _no_accent(s: str) -> str:
            s = unicodedata.normalize("NFD", s or "")
            return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()

        search = (request.query_params.get("search") or "").strip()
        arising = (request.query_params.get("arising") or "all").strip()

        def _match(e) -> bool:
            taken = e.get("leave_taken") or 0
            if arising == "yes" and not (taken > 0):
                return False
            if arising == "no" and taken > 0:
                return False
            if search:
                qn = _no_accent(search)
                if not (
                    qn in _no_accent(e.get("name", ""))
                    or qn in (e.get("badge_id", "") or "").lower()
                    or qn in (e.get("accounting_code", "") or "").lower()
                ):
                    return False
            return True

        employees = [e for e in employees if _match(e)]

        # Map mã viết tắt → tên loại phép đầy đủ (cho sheet chú thích).
        code_to_name: dict = {}
        for lst in cells.values():
            for en in lst:
                c = (en.get("code") or "").strip()
                if c and c not in code_to_name:
                    code_to_name[c] = en.get("name") or c

        from django.http import HttpResponse
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        WD_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
        thin = Border(
            left=Side(style="thin", color="D9D9D9"), right=Side(style="thin", color="D9D9D9"),
            top=Side(style="thin", color="D9D9D9"), bottom=Side(style="thin", color="D9D9D9"),
        )
        hdr_font = Font(bold=True, color="FFFFFF", size=9)
        hdr_fill = PatternFill(start_color="C0222B", end_color="C0222B", fill_type="solid")
        we_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
        we_hdr_fill = PatternFill(start_color="8A1A20", end_color="8A1A20", fill_type="solid")
        st_fill = {
            "approved": PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid"),
            "requested": PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid"),
            "rejected": PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid"),
        }
        center = Alignment(horizontal="center", vertical="center", wrap_text=True)
        left_al = Alignment(horizontal="left", vertical="center")

        wb = Workbook()
        ws = wb.active
        ws.title = f"TongQuan T{month:02d}-{year}"

        fixed = [
            ("STT", 5), ("Mã NV", 11), ("Tên nhân viên", 24), ("Mã kế toán", 12),
            ("Phòng ban", 20), ("Công ty", 22),
            ("Phép đầu", 8), ("Trừ phép", 8), ("Không lương", 9), ("Còn lại", 8),
        ]
        nfix = len(fixed)

        # Hàng tiêu đề
        for col, (title, w) in enumerate(fixed, 1):
            c = ws.cell(row=1, column=col, value=title)
            c.font = hdr_font
            c.fill = hdr_fill
            c.alignment = center
            c.border = thin
            ws.column_dimensions[c.column_letter].width = w
        day_dates = [date(year, month, i + 1) for i in range(len(day_strs))]
        for i, d in enumerate(day_dates):
            col = nfix + 1 + i
            wd = d.weekday()
            c = ws.cell(row=1, column=col, value=f"{d.day}\n{WD_VI[wd]}")
            c.font = hdr_font
            c.fill = we_hdr_fill if wd >= 5 else hdr_fill
            c.alignment = center
            c.border = thin
            ws.column_dimensions[c.column_letter].width = 5
        ws.row_dimensions[1].height = 30

        def _cell_text(entries) -> tuple:
            """Trả (text, status_ưu_tiên) cho 1 ô ngày."""
            if not entries:
                return "", None
            parts = []
            statuses = []
            for en in entries:
                code = en.get("code") or "?"
                statuses.append(en.get("status"))
                if en.get("is_hourly") and en.get("time_range"):
                    parts.append(f"{code} {en['time_range']}")
                else:
                    half = ""
                    m, a = en.get("is_morning", True), en.get("is_afternoon", True)
                    if m and not a:
                        half = "(S)"
                    elif a and not m:
                        half = "(C)"
                    parts.append(f"{code}{half}")
            # Ưu tiên tô màu: approved > requested > rejected
            for s in ("approved", "requested", "rejected"):
                if s in statuses:
                    return "/".join(parts), s
            return "/".join(parts), statuses[0]

        r = 2
        for idx, e in enumerate(employees, 1):
            vals = [
                idx, e.get("badge_id", ""), e.get("name", ""), e.get("accounting_code", ""),
                e.get("department", ""), e.get("company", ""),
                e.get("leave_start", 0), e.get("leave_deduct", 0),
                e.get("leave_unpaid", 0), e.get("leave_end", 0),
            ]
            for col, v in enumerate(vals, 1):
                c = ws.cell(row=r, column=col, value=v)
                c.border = thin
                c.alignment = left_al if col in (3, 5, 6) else center
            for i, ds in enumerate(day_strs):
                col = nfix + 1 + i
                text, status = _cell_text(cells.get(f"{e['id']}_{ds}", []))
                c = ws.cell(row=r, column=col, value=text)
                c.border = thin
                c.alignment = center
                c.font = Font(size=8, bold=True)
                if status and status in st_fill:
                    c.fill = st_fill[status]
                elif day_dates[i].weekday() >= 5:
                    c.fill = we_fill
            ws.row_dimensions[r].height = 16
            r += 1

        # Cố định tiêu đề + cột thông tin khi cuộn.
        ws.freeze_panes = ws.cell(row=2, column=nfix + 1).coordinate

        # Sheet chú thích: mã loại phép + ký hiệu.
        ws2 = wb.create_sheet("Chú thích")
        ws2.cell(row=1, column=1, value="Mã").font = Font(bold=True)
        ws2.cell(row=1, column=2, value="Loại phép").font = Font(bold=True)
        ws2.column_dimensions["A"].width = 8
        ws2.column_dimensions["B"].width = 30
        rr = 2
        for code, name in sorted(code_to_name.items()):
            ws2.cell(row=rr, column=1, value=code)
            ws2.cell(row=rr, column=2, value=name)
            rr += 1
        rr += 1
        for note in [
            "(S) = nghỉ buổi Sáng", "(C) = nghỉ buổi Chiều",
            "Nền xanh = Đã duyệt", "Nền vàng = Chờ duyệt", "Nền đỏ = Từ chối",
            "Cột nền xám = ngày cuối tuần (T7/CN)",
        ]:
            ws2.cell(row=rr, column=1, value=note)
            rr += 1

        import io
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        fname = f"TongQuanNghiPhep_T{month:02d}-{year}.xlsx"
        resp = HttpResponse(
            buf.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = f'attachment; filename="{fname}"'
        return resp


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
        seniority_type = _find_type("thâm niên", "seniority")
        bu_type = _find_type("phép bù")

        emps = list(
            Employee.objects.filter(is_active=True)
            .select_related("employee_work_info__department_id")
            .order_by("badge_id")
        )
        emp_ids = [e.id for e in emps]

        # Current balances theo từng loại phép
        annual_map: dict[int, AvailableLeave] = {}
        if annual_type:
            for av in AvailableLeave.objects.filter(leave_type_id=annual_type, employee_id__in=emp_ids):
                annual_map[av.employee_id_id] = av

        seniority_map: dict[int, AvailableLeave] = {}
        if seniority_type:
            for av in AvailableLeave.objects.filter(leave_type_id=seniority_type, employee_id__in=emp_ids):
                seniority_map[av.employee_id_id] = av

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

        # Cột: 1 STT · 2 Mã NS · 3 Tên · 4 Ngày vào làm · 5 Tổng phép (tự tính) ·
        # 6 Phép trong năm · 7 Phép thâm niên · 8 Phép bù · 9 Phép tồn (ô vàng = nhập).
        HEADERS = [
            "STT", "Mã nhân sự", "Tên nhân sự", "Ngày vào làm",
            "Tổng ngày phép đang có", "Phép trong năm", "Phép thâm niên",
            "Phép bù", "Phép tồn",
        ]
        COL_W = [5, 12, 26, 14, 18, 14, 14, 10, 10]
        EDIT_COLS = {6, 7, 8, 9}   # các cột được phép nhập
        CALC_COLS = {5}            # cột tự tính (bỏ qua khi import)

        for col, (h, w) in enumerate(zip(HEADERS, COL_W), 1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = hdr_font
            cell.fill = hdr_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin
            ws.column_dimensions[get_column_letter(col)].width = w
        ws.row_dimensions[1].height = 32

        for stt, emp in enumerate(emps, 1):
            wi = getattr(emp, "employee_work_info", None)
            date_joining = getattr(wi, "date_joining", None) if wi else None
            date_str = date_joining.strftime("%d/%m/%Y") if date_joining else ""

            av   = annual_map.get(emp.id)
            sav  = seniority_map.get(emp.id)
            bu_a = bu_map_av.get(emp.id)
            annual_avail = float(av.available_days or 0) if av else 0.0
            annual_carry = float(av.carryforward_days or 0) if av else 0.0
            seniority_avail = float(sav.available_days or 0) if sav else 0.0
            bu_av = float(bu_a.available_days or 0) if bu_a else 0.0
            total_avail = round(annual_avail + seniority_avail + bu_av, 2)

            row_vals = [
                stt,
                emp.badge_id or "",
                f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                date_str,
                total_avail,
                annual_avail,
                seniority_avail,
                bu_av,
                annual_carry,
            ]
            data_row = stt + 1  # dòng 1 = header, data từ dòng 2
            for col, val in enumerate(row_vals, 1):
                cell = ws.cell(row=data_row, column=col, value=val)
                cell.border = thin
                cell.alignment = center if col in (1, 2, 4, 5, 6, 7, 8, 9) else left
                if col in EDIT_COLS:
                    cell.fill = edit_fill
                elif col in CALC_COLS:
                    cell.fill = calc_fill
                    cell.font = Font(italic=True, color="888888", size=10)
                else:
                    cell.fill = info_fill
            ws.row_dimensions[data_row].height = 18

        ws.freeze_panes = "D2"  # freeze cột A-C (STT/Mã/Tên) + dòng header

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
        seniority_type = _find_type("thâm niên", "seniority")
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

        # Data bắt đầu từ dòng 2 (dòng 1 = header). Dòng chú thích (nếu có) không có
        # mã NV nên tự bị bỏ qua ở guard badge_id rỗng bên dưới → nhận cả 2 kiểu file.
        all_rows = list(ws.iter_rows(min_row=2, values_only=True))

        def _parse_num(val, label):
            """Parse số kiểu VN: '9,92' (phẩy thập phân), '-' = 0, ô trống = None (giữ nguyên).
            Trả (value, error); value=None nghĩa là KHÔNG đổi giá trị hiện tại."""
            if val is None:
                return None, None
            if isinstance(val, str):
                s = val.strip().replace(" ", "").replace("\xa0", "")
                if s == "":
                    return None, None
                if s in ("-", "–", "—"):
                    return 0.0, None                     # dấu gạch (kế toán) = 0 rõ ràng
                if "," in s:
                    s = s.replace(".", "").replace(",", ".")  # '.'=phân tách nghìn, ','=thập phân
                try:
                    n = float(s)
                except ValueError:
                    return None, f"{label} không hợp lệ: '{val}'"
            else:
                try:
                    n = float(val)
                except (ValueError, TypeError):
                    return None, f"{label} không hợp lệ: '{val}'"
            if n < 0:
                return None, f"{label} không thể âm"
            return round(n, 2), None

        # Cột file mẫu mới (0-index): 0 STT · 1 Mã NS · 2 Tên · 3 Ngày vào làm ·
        # 4 Tổng phép (hiển thị) · 5 Phép trong năm · 6 Phép thâm niên · 7 Phép bù · 8 Phép tồn.
        for row_idx, row in enumerate(all_rows, 2):
            if not row or not any(row):
                continue

            badge_id = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
            if not badge_id:
                skipped += 1
                continue

            emp = emp_map.get(badge_id)
            if emp is None:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": f"Không tìm thấy NV mã '{badge_id}'"})
                skipped += 1
                continue

            def _cell(i):
                return row[i] if len(row) > i else None

            annual_new, err = _parse_num(_cell(5), "Phép trong năm")
            if err:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": err})
                skipped += 1
                continue

            seniority_new, err = _parse_num(_cell(6), "Phép thâm niên")
            if err:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": err})
                skipped += 1
                continue

            bu_new, err = _parse_num(_cell(7), "Phép bù")
            if err:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": err})
                skipped += 1
                continue

            carry_new, err = _parse_num(_cell(8), "Phép tồn")
            if err:
                errors.append({"row": row_idx, "badge_id": badge_id, "message": err})
                skipped += 1
                continue

            # Read current values for diff preview
            annual_before = 0.0
            carry_before  = 0.0
            seniority_before = 0.0
            bu_before     = 0.0

            if annual_type:
                av = AvailableLeave.objects.filter(employee_id=emp, leave_type_id=annual_type).first()
                if av:
                    annual_before = float(av.available_days or 0)
                    carry_before  = float(av.carryforward_days or 0)

            if seniority_type:
                sav = AvailableLeave.objects.filter(employee_id=emp, leave_type_id=seniority_type).first()
                if sav:
                    seniority_before = float(sav.available_days or 0)

            if bu_type:
                bav = AvailableLeave.objects.filter(employee_id=emp, leave_type_id=bu_type).first()
                if bav:
                    bu_before = float(bav.available_days or 0)

            annual_after    = annual_new    if annual_new    is not None else annual_before
            seniority_after = seniority_new if seniority_new is not None else seniority_before
            bu_after        = bu_new        if bu_new        is not None else bu_before
            carry_after     = carry_new     if carry_new     is not None else carry_before

            changed = (
                annual_after    != annual_before or
                seniority_after != seniority_before or
                bu_after        != bu_before     or
                carry_after     != carry_before
            )

            preview.append({
                "row": row_idx,
                "badge_id": badge_id,
                "name": _vn_full_name(emp),
                "annual_before": annual_before,
                "annual_after": annual_after,
                "seniority_before": seniority_before,
                "seniority_after": seniority_after,
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

                if seniority_type and seniority_new is not None:
                    sav, _ = AvailableLeave.objects.get_or_create(
                        employee_id=emp,
                        leave_type_id=seniority_type,
                        defaults={"available_days": 0, "total_leave_days": 0, "is_active": True},
                    )
                    sav.available_days = seniority_new
                    sav.total_leave_days = seniority_new
                    sav.is_active = True
                    sav.save()

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
            "seniority_supported": bool(seniority_type),
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


def _team_ids(me):
    """Team của QL = chính QL + cấp dưới TRỰC TIẾP đang active (mỗi QL chỉ thấy team
    trực tiếp của mình)."""
    ids = {me.id}
    ids.update(
        Employee.objects.filter(
            employee_work_info__reporting_manager_id=me, is_active=True
        ).values_list("id", flat=True)
    )
    return ids


class TeamLeavesView(APIView):
    """GET /api/leave/team-leaves/?month=YYYY-MM&status=all|requested|approved|cancelled|rejected

    QL xem đơn nghỉ phép của TEAM mình (cấp dưới trực tiếp + chính QL). Phạm vi tự
    giới hạn theo team của người gọi — không xem được team khác."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        me = _get_employee(request)
        if me is None:
            return Response({"detail": "Không có hồ sơ nhân viên"}, status=400)
        team = _team_ids(me)

        from leave.models import LeaveRequest

        today = timezone.localdate()
        try:
            y, m = (int(x) for x in request.query_params.get("month", "").split("-"))
            date(y, m, 1)
        except (AttributeError, ValueError):
            y, m = today.year, today.month
        m_start, m_end = date(y, m, 1), date(y, m, monthrange(y, m)[1])

        qs = LeaveRequest.objects.filter(employee_id__in=team)
        # Đơn có khoảng nghỉ giao với tháng đang xem.
        qs = qs.filter(start_date__lte=m_end).filter(
            Q(end_date__gte=m_start) | Q(end_date__isnull=True)
        )
        status_param = request.query_params.get("status")
        if status_param and status_param != "all":
            qs = qs.filter(status=status_param)
        qs = qs.select_related(
            "employee_id", "leave_type_id",
            "employee_id__employee_work_info__department_id",
        ).order_by("-start_date", "-id")

        rows = []
        for lr in qs[:500]:
            wi = getattr(lr.employee_id, "employee_work_info", None)
            end = lr.end_date or lr.start_date
            rows.append({
                "id": lr.id,
                "employee_id": lr.employee_id_id,
                "employee_name": _vn_full_name(lr.employee_id),
                "badge_id": lr.employee_id.badge_id,
                "department": wi.department_id.department if wi and wi.department_id else None,
                "is_self": lr.employee_id_id == me.id,
                "leave_type": lr.leave_type_id.name if lr.leave_type_id else "",
                "start_date": lr.start_date.isoformat(),
                "end_date": end.isoformat(),
                "requested_days": lr.requested_days,
                "status": lr.status,
                "description": lr.description or "",
                "requested_date": lr.created_at.isoformat() if lr.created_at else None,
            })
        return Response({"team_size": len(team), "results": rows})


# ============================================================================
# Quản lý DS Đơn (Request List) — App Feature CHỈ cho C&B.
# 1 trang gộp DS đơn nghỉ; lọc đa chiều (khoảng ngày · tình trạng xem · tình
# trạng xử lý · công ty/phòng/tên-mã); xử lý đơn + xuất Excel. Đơn TỪ CHỐI
# (rejected) hiển thị ĐẦY ĐỦ ở đây — trước bị ẩn ở màn Quản lý phép cũ.
# ============================================================================

STATUS_LABEL_VI = {
    "requested": "Chờ duyệt",
    "approved": "Đã duyệt",
    "rejected": "Đã từ chối",
    "cancelled": "Đã xóa",
}
BREAKDOWN_VI = {"full_day": "Cả ngày", "first_half": "Buổi sáng", "second_half": "Buổi chiều"}


def _request_list_qs(request, me):
    """Queryset đơn nghỉ theo filter cho Quản lý DS Đơn."""
    from leave.models import LeaveRequest

    today = timezone.localdate()
    dfrom = _parse_ymd(request.query_params.get("from"))
    dto = _parse_ymd(request.query_params.get("to"))
    if not dfrom and not dto:
        dfrom = today.replace(day=1)
        dto = date(today.year, today.month, monthrange(today.year, today.month)[1])

    qs = LeaveRequest.objects.all()
    # Lọc theo KHOẢNG NGÀY nghỉ (giao với [from, to]).
    if dfrom:
        qs = qs.filter(Q(end_date__gte=dfrom) | Q(end_date__isnull=True, start_date__gte=dfrom))
    if dto:
        qs = qs.filter(start_date__lte=dto)

    status_param = (request.query_params.get("status") or "all").strip()
    if status_param in ("requested", "approved", "rejected", "cancelled"):
        qs = qs.filter(status=status_param)

    # Tình trạng XEM của C&B hiện tại (mỗi C&B có trạng thái riêng qua cb_seen_set).
    seen_param = (request.query_params.get("seen") or "all").strip()
    if me is not None and seen_param in ("seen", "unseen"):
        if seen_param == "seen":
            qs = qs.filter(cb_seen_set__employee=me)
        else:
            qs = qs.exclude(cb_seen_set__employee=me)

    company_id = request.query_params.get("company")
    if company_id:
        qs = qs.filter(employee_id__employee_work_info__company_id=company_id)
    dept_id = request.query_params.get("department")
    if dept_id:
        qs = qs.filter(employee_id__employee_work_info__department_id=dept_id)

    # Tìm Họ tên (CÓ/KHÔNG dấu — dùng UNACCENT Postgres), Mã NV, Mã Kế toán.
    q = (request.query_params.get("q") or "").strip()
    if q:
        qv = _vn_unaccent(q)
        qs = qs.filter(
            Q(employee_id__employee_first_name__unaccent__icontains=qv)
            | Q(employee_id__employee_last_name__unaccent__icontains=qv)
            | Q(employee_id__badge_id__icontains=q)
            | Q(employee_id__accounting_code__icontains=q)
        )

    # Sắp xếp theo THỜI GIAN TẠO ĐƠN: created_desc (mới→cũ, mặc định) | created_asc (cũ→mới).
    sort = (request.query_params.get("sort") or "created_desc").strip()
    ordering = ("created_at", "id") if sort == "created_asc" else ("-created_at", "-id")

    return (
        qs.select_related(
            "employee_id",
            "leave_type_id",
            "cancelled_by",
            "employee_id__employee_work_info__department_id",
            "employee_id__employee_work_info__company_id",
            "employee_id__employee_work_info__job_position_id",
        )
        .order_by(*ordering)
        .distinct()
    )


def _serialize_request_rows(qs, me, limit=1000):
    lrs = list(qs[:limit])
    seen_ids: set = set()
    if lrs and me is not None:
        from leave.models import HNHLeaveRequestSeen
        seen_ids = set(
            HNHLeaveRequestSeen.objects.filter(
                employee=me, leave_request_id__in=[lr.id for lr in lrs]
            ).values_list("leave_request_id", flat=True)
        )
    rows = []
    for lr in lrs:
        e = lr.employee_id
        wi = getattr(e, "employee_work_info", None)
        end = lr.end_date or lr.start_date
        rows.append({
            "id": lr.id,
            "employee_id": lr.employee_id_id,
            "employee_name": _vn_full_name(e),
            "badge_id": e.badge_id,
            "accounting_code": getattr(e, "accounting_code", None) or "",
            "department": wi.department_id.department if wi and wi.department_id else None,
            "company": wi.company_id.company if wi and wi.company_id else None,
            "job_position": (wi.job_position_id.job_position
                             if wi and getattr(wi, "job_position_id", None) else None),
            "request_type": "leave",
            "request_type_label": "Nghỉ phép",
            "leave_type": lr.leave_type_id.name if lr.leave_type_id else "",
            "start_date": lr.start_date.isoformat(),
            "end_date": end.isoformat(),
            "start_breakdown": getattr(lr, "start_date_breakdown", "") or "",
            "end_breakdown": getattr(lr, "end_date_breakdown", "") or "",
            "requested_days": lr.requested_days,
            "status": lr.status,
            "status_label": STATUS_LABEL_VI.get(lr.status, lr.status),
            "description": lr.description or "",
            "reject_reason": getattr(lr, "reject_reason", "") or "",
            "requested_date": (lr.created_at.isoformat() if lr.created_at
                               else (lr.requested_date.isoformat() if lr.requested_date else None)),
            "approved_at": lr.approved_at.isoformat() if getattr(lr, "approved_at", None) else None,
            "cancelled_at": lr.cancelled_at.isoformat() if getattr(lr, "cancelled_at", None) else None,
            "cancelled_by": _vn_full_name(lr.cancelled_by) if getattr(lr, "cancelled_by", None) else None,
            "cancel_reason": getattr(lr, "cancel_reason", "") or "",
            "refunded_days": (round((lr.approved_available_days or 0) + (lr.approved_carryforward_days or 0), 2)
                              if getattr(lr, "balance_refunded", False) else 0),
            "seen": lr.id in seen_ids,
        })
    return rows


class HNHRequestListView(APIView):
    """GET /api/leave/hnh-request-list/ — Quản lý DS Đơn (C&B). Lọc:
    from,to (YYYY-MM-DD, mặc định tháng này) · status=all|requested|approved|rejected|cancelled
    · seen=all|seen|unseen · company · department · q (Họ tên có/không dấu, Mã NV, Mã KT).
    Trả {results, count, companies, departments}. Đơn TỪ CHỐI hiển thị đầy đủ."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ Nhân viên nhóm C&B mới dùng được"}, status=403)
        me = _get_employee(request)
        rows = _serialize_request_rows(_request_list_qs(request, me), me)

        from base.models import Company, Department
        companies = [{"id": c.id, "name": c.company}
                     for c in Company.objects.all().order_by("company")]
        departments = [
            {"id": d.id, "name": d.department,
             "company_ids": list(d.company_id.values_list("id", flat=True))}
            for d in Department.objects.prefetch_related("company_id").order_by("department")
        ]
        return Response({
            "results": rows, "count": len(rows),
            "companies": companies, "departments": departments,
        })


class HNHRequestListExportView(APIView):
    """GET /api/leave/hnh-request-list/export/ — Xuất Excel DS đơn (cùng filter)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_cnb(request):
            return Response({"detail": "Chỉ C&B"}, status=403)
        import io
        from django.http import HttpResponse
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        me = _get_employee(request)
        rows = _serialize_request_rows(_request_list_qs(request, me), me, limit=5000)

        wb = Workbook()
        ws = wb.active
        ws.title = "DS Don"
        headers = [
            "STT", "Mã NV", "Mã KT", "Họ tên", "Công ty", "Phòng ban", "Chức vụ",
            "Loại đơn", "Loại nghỉ", "Từ ngày", "Buổi (từ)", "Đến ngày", "Buổi (đến)",
            "Số ngày", "Tình trạng", "C&B xem", "Lý do", "Lý do từ chối",
            "Ngày gửi", "Ngày duyệt", "Ngày hủy", "Người hủy", "Ngày hoàn",
        ]
        COL_W = [5, 10, 10, 22, 20, 18, 18, 12, 18, 12, 11, 12, 11, 8, 12, 11, 28, 24, 16, 16, 16, 18, 10]
        hdr_font = Font(bold=True, color="FFFFFF", size=10)
        hdr_fill = PatternFill(start_color="C0222B", end_color="C0222B", fill_type="solid")
        thin = Border(left=Side(style="thin"), right=Side(style="thin"),
                      top=Side(style="thin"), bottom=Side(style="thin"))
        fills = {
            "approved": PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid"),
            "rejected": PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid"),
            "requested": PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid"),
            "cancelled": PatternFill(start_color="F5F5F5", end_color="F5F5F5", fill_type="solid"),
        }
        for col, (h, w) in enumerate(zip(headers, COL_W), 1):
            c = ws.cell(row=1, column=col, value=h)
            c.font = hdr_font
            c.fill = hdr_fill
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = thin
            ws.column_dimensions[c.column_letter].width = w
        ws.row_dimensions[1].height = 28

        def _d(iso):
            if not iso:
                return ""
            p = iso.split("T")[0].split("-")
            return f"{p[2]}/{p[1]}/{p[0]}" if len(p) == 3 else iso

        for stt, r in enumerate(rows, 1):
            vals = [
                stt, r["badge_id"], r["accounting_code"], r["employee_name"],
                r["company"] or "", r["department"] or "", r["job_position"] or "",
                r["request_type_label"], r["leave_type"], _d(r["start_date"]),
                BREAKDOWN_VI.get(r["start_breakdown"], ""), _d(r["end_date"]),
                BREAKDOWN_VI.get(r["end_breakdown"], ""), r["requested_days"],
                r["status_label"], "Đã xem" if r["seen"] else "Chưa xem",
                r["description"], r["reject_reason"], _d(r["requested_date"]),
                _d(r["approved_at"]), _d(r["cancelled_at"]), r["cancelled_by"] or "",
                r["refunded_days"] or "",
            ]
            fill = fills.get(r["status"])
            for col, v in enumerate(vals, 1):
                cell = ws.cell(row=stt + 1, column=col, value=v)
                cell.border = thin
                cell.alignment = Alignment(vertical="center", wrap_text=(col in (4, 17, 18)))
                if fill:
                    cell.fill = fill

        ws.freeze_panes = "A2"
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        resp = HttpResponse(
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = 'attachment; filename="DS_Don.xlsx"'
        return resp

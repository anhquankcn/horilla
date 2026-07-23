import contextlib

from django.contrib.auth.decorators import permission_required
from django.contrib.auth.models import AnonymousUser
from django.db.models import Count
from django.http import Http404, QueryDict
from django.utils.decorators import method_decorator
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.methods import filtersubordinates
from horilla_api.api_serializers.leave.serializers import *
from leave.filters import *
from leave.methods import filter_conditional_leave_request
from leave.models import LeaveRequest
from notifications.signals import notify

from ...api_decorators.base.decorators import manager_permission_required
from ...api_methods.base.methods import groupby_queryset

_LEAVE_ERR_VI = {
    "there is already a leave request for this date range.": "Đã có đơn nghỉ phép trong khoảng thời gian này.",
    "this date range is not within your shift.": "Ngày nghỉ nằm ngoài ca làm việc.",
    "leave type is not found.": "Loại nghỉ phép không tồn tại.",
    "leave balance is not sufficient.": "Số ngày phép không đủ.",
    "maximum leave days exceeded.": "Đã vượt quá số ngày phép tối đa.",
}

def _translate_leave_err(msg: str) -> str:
    return _LEAVE_ERR_VI.get(msg.strip().lower(), msg)


# ── HNH: C&B cố định + người theo dõi (watcher) ───────────────────────

def _augment_with_cb(employee, approver_ids, watcher_ids):
    """Luôn chèn C&B cố định vào CẢ Người duyệt + Người theo dõi (server-side
    enforce — client không thể bỏ chọn)."""
    from leave.models import resolve_cb_manager

    approver_ids = list(approver_ids or [])
    watcher_ids = list(watcher_ids or [])
    cb = resolve_cb_manager(employee)
    if cb:
        if cb.id not in approver_ids:
            approver_ids.append(cb.id)
        if cb.id not in watcher_ids:
            watcher_ids.append(cb.id)
    return approver_ids, watcher_ids


def _persist_watchers(created_requests, watcher_ids):
    """Lưu watcher vào DB cho từng đơn vừa tạo."""
    from employee.models import Employee
    from leave.models import LeaveRequestWatcher

    for lr in created_requests:
        for wid in watcher_ids or []:
            with contextlib.suppress(Exception):
                w = Employee.objects.get(id=wid, is_active=True)
                LeaveRequestWatcher.objects.get_or_create(
                    leave_request_id=lr, employee_id=w
                )


def _notify_watchers(lr, actor, verb):
    """Thông báo cho mọi người theo dõi đơn (trừ chính actor)."""
    from leave.models import LeaveRequestWatcher

    with contextlib.suppress(Exception):
        links = LeaveRequestWatcher.objects.filter(
            leave_request_id=lr
        ).select_related("employee_id__employee_user_id")
        for link in links:
            emp = link.employee_id
            if emp and emp.employee_user_id_id and emp.id != actor.id:
                with contextlib.suppress(Exception):
                    notify.send(actor, recipient=emp.employee_user_id, verb=verb,
                                icon="eye", redirect=f"/leave/user-request-view?id={lr.id}")


def _is_cnb_user(user):
    """Chuyên viên C&B (theo group) hoặc superuser — được duyệt/từ chối mọi đơn."""
    if user.is_superuser:
        return True
    return any(
        ("c&b" in g.name.lower() or "chuyên viên c" in g.name.lower())
        for g in user.groups.all()
    )


def _can_approve_leave(user, lr):
    """Ai được duyệt: superuser/staff, C&B, reporting manager của người xin, hoặc
    có dòng ConditionApproval cho đơn (gồm cả C&B đã pin). Củng cố quy tắc 'chỉ cần
    1 người duyệt' — chỉ đúng người trong danh sách duyệt mới bấm được."""
    if user.is_superuser or user.is_staff:
        return True
    if _is_cnb_user(user):
        return True
    emp = getattr(user, "employee_get", None)
    if not emp:
        return False
    wi = getattr(lr.employee_id, "employee_work_info", None)
    if wi and wi.reporting_manager_id_id == emp.id:
        return True
    from leave.models import LeaveRequestConditionApproval

    return LeaveRequestConditionApproval.objects.filter(
        leave_request_id=lr, manager_id=emp
    ).exists()


def _person_dict(emp, is_direct=False, locked=False):
    wi = getattr(emp, "employee_work_info", None)
    return {
        "id": emp.id,
        "name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
        "badge_id": emp.badge_id,
        "accounting_code": getattr(emp, "accounting_code", None),
        "position": wi.job_position_id.job_position if wi and wi.job_position_id else None,
        "department": wi.department_id.department if wi and wi.department_id else None,
        "company": wi.company_id.company if wi and wi.company_id else None,
        "is_direct": is_direct,
        "locked": locked,
    }


class EmployeeAvailableLeaveGetAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        available_leave = employee.available_leave.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(available_leave, request)
        serializer = GetAvailableLeaveTypeSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class EmployeeLeaveRequestGetCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = UserLeaveRequestFilter

    def get(self, request):
        employee = request.user.employee_get
        # Ẩn đơn NV đã tự hủy (status='cancelled') khỏi danh sách của chính mình —
        # giữ UX như cũ (trước đây hủy = xóa hẳn). Bản ghi vẫn tồn tại để thông
        # báo phía quản lý hiển thị trạng thái "Đã huỷ".
        leave_request = (
            employee.leaverequest_set.exclude(status="cancelled").order_by("-id")
        )
        filterset = self.filterset_class(request.GET, queryset=leave_request)
        paginator = PageNumberPagination()
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, filterset.qs)
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = userLeaveRequestGetAllSerilaizer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        employee_id = request.user.employee_get.id
        data = request.data
        if isinstance(data, QueryDict):
            data = data.dict()
        approver_ids = data.pop("approver_ids", None) or []
        watcher_ids = data.pop("watcher_ids", None) or []
        approver_ids, watcher_ids = _augment_with_cb(
            request.user.employee_get, approver_ids, watcher_ids
        )
        data.pop("approval_mode", None)
        data["employee_id"] = employee_id
        data["end_date"] = (
            data.get("start_date") if not data.get("end_date") else data.get("end_date")
        )
        serializer = LeaveRequestCreateUpdateSerializer(data=data)
        if serializer.is_valid():
            leave_request = serializer.save()
            _persist_watchers([leave_request], watcher_ids)
            actor = request.user.employee_get
            emp_name = f"{actor.employee_first_name} {actor.employee_last_name or ''}".strip()

            from employee.models import Employee
            from leave.models import LeaveRequestConditionApproval

            for seq, aid in enumerate(approver_ids, start=1):
                with contextlib.suppress(Exception):
                    approver = Employee.objects.get(id=aid, is_active=True)
                    LeaveRequestConditionApproval.objects.get_or_create(
                        leave_request_id=leave_request,
                        manager_id=approver,
                        defaults={"sequence": seq, "is_approved": False, "is_rejected": False},
                    )

            with contextlib.suppress(Exception):
                notify.send(
                    actor,
                    recipient=leave_request.employee_id.employee_work_info.reporting_manager_id.employee_user_id,
                    verb=f"{emp_name} đã gửi đề xuất nghỉ phép",
                    icon="people-circle",
                    redirect=f"/leave/request-view?id={leave_request.id}",
                    api_redirect=f"/api/leave/request/{leave_request.id}/",
                )

            notified_user_ids = set()
            with contextlib.suppress(Exception):
                rm = leave_request.employee_id.employee_work_info.reporting_manager_id
                if rm:
                    notified_user_ids.add(rm.employee_user_id.id)

            for aid in approver_ids:
                with contextlib.suppress(Exception):
                    approver = Employee.objects.get(id=aid, is_active=True)
                    if approver.employee_user_id.id not in notified_user_ids:
                        notify.send(
                            actor,
                            recipient=approver.employee_user_id,
                            verb=f"{emp_name} đã gửi đề xuất nghỉ phép cần phê duyệt",
                            icon="people-circle",
                            redirect=f"/leave/request-view?id={leave_request.id}",
                        )
                        notified_user_ids.add(approver.employee_user_id.id)

            for wid in watcher_ids:
                with contextlib.suppress(Exception):
                    watcher = Employee.objects.get(id=wid, is_active=True)
                    if watcher.employee_user_id.id not in notified_user_ids:
                        notify.send(
                            actor,
                            recipient=watcher.employee_user_id,
                            verb=f"{emp_name} đã gửi đề xuất nghỉ phép (theo dõi)",
                            icon="people-circle",
                            redirect=f"/leave/request-view?id={leave_request.id}",
                        )
                        notified_user_ids.add(watcher.employee_user_id.id)

            return Response(
                userLeaveRequestGetAllSerilaizer(leave_request).data, status=201
            )
        return Response(serializer.errors, status=400)


# ── HNH: gộp 3 loại phép TRỪ DƯ thành 1 pool ──────────────────────────────────
# Người dùng chỉ chọn 1 "Nghỉ phép" chung; khi duyệt trừ lần lượt:
# Phép Bù → Phép Thâm Niên → Nghỉ phép năm (hết loại nào sang loại kế).

def _hnh_pool_rank(name: str):
    n = (name or "").lower()
    if "bù" in n:
        return 0
    if "thâm niên" in n or "seniority" in n:
        return 1
    if "phép năm" in n or "annual" in n:
        return 2
    return 99


def _is_pool_type(lt) -> bool:
    """LeaveType có thuộc pool trừ dư HNH (bù / thâm niên / năm) không."""
    return bool(lt) and _hnh_pool_rank(getattr(lt, "name", "")) < 99


def _hnh_pool_rows(employee):
    """AvailableLeave của NV theo thứ tự trừ: bù → thâm niên → năm (chỉ loại đang có)."""
    from leave.models import AvailableLeave
    rows = [
        al for al in AvailableLeave.objects.filter(
            employee_id=employee, is_active=True
        ).select_related("leave_type_id")
        if al.leave_type_id and _hnh_pool_rank(al.leave_type_id.name) < 99
    ]
    rows.sort(key=lambda al: _hnh_pool_rank(al.leave_type_id.name))
    return rows


def _hnh_pool_balance(employee) -> float:
    total = 0.0
    for al in _hnh_pool_rows(employee):
        total += (al.available_days or 0) + (al.carryforward_days or 0)
    return round(total, 2)


def _leave_notif_desc(created, lt, total_req, reason) -> str:
    """Mô tả ĐẦY ĐỦ đơn nghỉ cho thông báo — để người duyệt đọc đủ thông tin và
    Duyệt nhanh ngay trên màn Xem thông báo (không cần mở màn khác)."""
    if not created:
        return ""
    rows = sorted(created, key=lambda r: (r.start_date, str(r.start_time or "")))
    first, last = rows[0], rows[-1]
    parts = [f"Loại nghỉ: {getattr(lt, 'name', '')}"]
    if getattr(first, "is_hourly", False) and first.start_time and first.end_time:
        for r in rows:
            parts.append(
                f"• {r.start_date.strftime('%d/%m/%Y')} "
                f"{r.start_time.strftime('%H:%M')}–{r.end_time.strftime('%H:%M')}"
            )
        parts.append(f"Tổng: {total_req} ngày")
    elif first.start_date == last.end_date:
        parts.append(f"Ngày: {first.start_date.strftime('%d/%m/%Y')} — {total_req} ngày")
    else:
        parts.append(
            f"Từ {first.start_date.strftime('%d/%m/%Y')} "
            f"đến {last.end_date.strftime('%d/%m/%Y')} — {total_req} ngày"
        )
    if reason:
        parts.append(f"Lý do: {reason}")
    return "\n".join(parts)


class EmployeeLeaveRequestDaysAPIView(APIView):
    """P1 — Đơn nghỉ phép/bù THEO NGÀY: chọn nhiều ngày rời, mỗi ngày Sáng/Chiều/
    Cả ngày. Tạo LeaveRequest tối ưu: gộp các ngày 'cả ngày' liên tiếp thành 1 range,
    nửa ngày tách riêng. Trừ phép theo tổng requested_days. Atomic — lỗi 1 đoạn rollback hết.
    """
    permission_classes = [IsAuthenticated]

    _BD = {"full_day", "first_half", "second_half"}

    def post(self, request):
        from datetime import datetime, date as _date
        from django.db import transaction
        from leave.models import LeaveRequest, AvailableLeave, LeaveType, cal_effective_requested_days
        from leave.methods import calculate_requested_days
        from employee.models import Employee

        employee = request.user.employee_get
        d = request.data
        leave_type_id = d.get("leave_type_id")
        description = (d.get("description") or "").strip()
        days_in = d.get("days") or []
        approver_ids = d.get("approver_ids") or []
        watcher_ids = d.get("watcher_ids") or []
        approver_ids, watcher_ids = _augment_with_cb(employee, approver_ids, watcher_ids)

        if not leave_type_id:
            return Response({"error": "Thiếu loại nghỉ phép"}, status=400)
        if not days_in:
            return Response({"error": "Chưa chọn ngày nghỉ"}, status=400)
        lt = LeaveType.objects.filter(id=leave_type_id).first()
        if not lt:
            return Response({"error": "Loại nghỉ phép không tồn tại"}, status=400)

        # Parse + validate days
        parsed = []
        seen = set()
        for it in days_in:
            ds = (it.get("date") or "").strip()
            bd = (it.get("breakdown") or "full_day").strip()
            if bd not in self._BD:
                return Response({"error": f"Thời lượng không hợp lệ: {bd}"}, status=400)
            try:
                dt = datetime.strptime(ds, "%Y-%m-%d").date()
            except ValueError:
                return Response({"error": f"Ngày không hợp lệ: {ds}"}, status=400)
            if dt in seen:
                return Response({"error": f"Ngày bị trùng: {ds}"}, status=400)
            seen.add(dt)
            parsed.append({"date": dt, "breakdown": bd})
        parsed.sort(key=lambda x: x["date"])

        # Gom đoạn: ngày 'full_day' liên tiếp → 1 range; nửa ngày → từng ngày riêng
        segments = []
        i, n = 0, len(parsed)
        while i < n:
            cur = parsed[i]
            if cur["breakdown"] == "full_day":
                j = i
                while (j + 1 < n and parsed[j + 1]["breakdown"] == "full_day"
                       and (parsed[j + 1]["date"] - parsed[j]["date"]).days == 1):
                    j += 1
                segments.append((parsed[i]["date"], parsed[j]["date"], "full_day", "full_day"))
                i = j + 1
            else:
                segments.append((cur["date"], cur["date"], cur["breakdown"], cur["breakdown"]))
                i += 1

        # Pre-check tổng số ngày xin so với số dư
        total_req = 0.0
        for (sd, ed, sbd, ebd) in segments:
            rd = calculate_requested_days(sd, ed, sbd, ebd)
            rd = cal_effective_requested_days(start_date=sd, end_date=ed, leave_type_id=lt, requested_days=rd)
            total_req += rd
        total_req = round(total_req, 2)
        if _is_pool_type(lt):
            # Loại trừ dư (bù/thâm niên/năm): kiểm theo TỔNG pool 3 loại.
            balance = _hnh_pool_balance(employee)
            if total_req > balance + 1e-6:
                return Response({"error": f"Vượt số phép: xin {total_req} ngày nhưng còn {round(balance,2)} ngày"}, status=400)
        else:
            avail = AvailableLeave.objects.filter(employee_id=employee, leave_type_id=lt).first()
            if avail is not None:
                balance = (avail.available_days or 0) + (avail.carryforward_days or 0)
                if total_req > balance + 1e-6:
                    return Response({"error": f"Vượt số phép: xin {total_req} ngày nhưng còn {round(balance,2)} ngày"}, status=400)
            elif lt.payment == "paid":
                return Response({"error": "Bạn chưa được cấp loại phép này"}, status=400)

        created = []
        try:
            with transaction.atomic():
                for (sd, ed, sbd, ebd) in segments:
                    data = {
                        "employee_id": employee.id,
                        "leave_type_id": lt.id,
                        "start_date": sd.isoformat(),
                        "end_date": ed.isoformat(),
                        "start_date_breakdown": sbd,
                        "end_date_breakdown": ebd,
                        "description": description,
                    }
                    ser = LeaveRequestCreateUpdateSerializer(data=data)
                    if not ser.is_valid():
                        # Extract human-readable text from DRF ErrorDetail objects
                        msg = next(
                            (str(e) for field_errs in ser.errors.values() for e in field_errs),
                            "Dữ liệu không hợp lệ",
                        )
                        raise ValueError(_translate_leave_err(msg))
                    created.append(ser.save())
                # Approvers (gắn cho mọi request vừa tạo)
                from leave.models import LeaveRequestConditionApproval
                for lr in created:
                    for seq, aid in enumerate(approver_ids, start=1):
                        with contextlib.suppress(Exception):
                            ap = Employee.objects.get(id=aid, is_active=True)
                            LeaveRequestConditionApproval.objects.get_or_create(
                                leave_request_id=lr, manager_id=ap,
                                defaults={"sequence": seq, "is_approved": False, "is_rejected": False},
                            )
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

        _persist_watchers(created, watcher_ids)

        # Notify quản lý + approvers/watchers (1 lần, gộp) — kèm mô tả đầy đủ +
        # id đơn để duyệt nhanh ngay trên màn Xem thông báo.
        actor = employee
        emp_name = f"{actor.employee_first_name} {actor.employee_last_name or ''}".strip()
        _desc = _leave_notif_desc(created, lt, total_req, description)
        _ids = [lr.id for lr in created]
        notified = set()
        with contextlib.suppress(Exception):
            rm = actor.employee_work_info.reporting_manager_id
            if rm:
                notify.send(actor, recipient=rm.employee_user_id,
                            verb=f"{emp_name} gửi đề xuất nghỉ phép {total_req} ngày cần phê duyệt",
                            description=_desc, icon="people-circle",
                            redirect="/leave/request-view", leave_request_ids=_ids)
                notified.add(rm.employee_user_id.id)
        from employee.models import Employee as _Emp
        for uid in list(approver_ids) + list(watcher_ids):
            with contextlib.suppress(Exception):
                u = _Emp.objects.get(id=uid, is_active=True)
                if u.employee_user_id.id not in notified:
                    notify.send(actor, recipient=u.employee_user_id,
                                verb=f"{emp_name} gửi đề xuất nghỉ phép {total_req} ngày cần phê duyệt",
                                description=_desc, icon="people-circle",
                                redirect="/leave/request-view", leave_request_ids=_ids)
                    notified.add(u.employee_user_id.id)

        return Response({
            "ok": True,
            "created": len(created),
            "total_days": total_req,
            "request_ids": _ids,
        }, status=201)


class EmployeeLeaveRequestHoursAPIView(APIView):
    """P2 — Đơn nghỉ phép/bù THEO GIỜ: nhiều cặp [Ngày - Từ giờ - Đến giờ] trong 1 đơn.
    Quy đổi 8h = 1 ngày (requested_days = round(hours/8, 2)). Mỗi ngày = 1 LeaveRequest
    is_hourly. Trừ phép theo tổng. Atomic.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from datetime import datetime
        from django.db import transaction
        from leave.models import LeaveRequest, AvailableLeave, LeaveType
        from employee.models import Employee

        employee = request.user.employee_get
        d = request.data
        leave_type_id = d.get("leave_type_id")
        description = (d.get("description") or "").strip()
        entries_in = d.get("entries") or []
        approver_ids = d.get("approver_ids") or []
        watcher_ids = d.get("watcher_ids") or []
        approver_ids, watcher_ids = _augment_with_cb(employee, approver_ids, watcher_ids)

        if not leave_type_id:
            return Response({"error": "Thiếu loại nghỉ phép"}, status=400)
        if not entries_in:
            return Response({"error": "Chưa chọn ngày/giờ nghỉ"}, status=400)
        lt = LeaveType.objects.filter(id=leave_type_id).first()
        if not lt:
            return Response({"error": "Loại nghỉ phép không tồn tại"}, status=400)

        parsed = []
        for it in entries_in:
            ds = (it.get("date") or "").strip()
            st = (it.get("start_time") or "").strip()
            et = (it.get("end_time") or "").strip()
            try:
                dt = datetime.strptime(ds, "%Y-%m-%d").date()
                t1 = datetime.strptime(st, "%H:%M").time()
                t2 = datetime.strptime(et, "%H:%M").time()
            except ValueError:
                return Response({"error": f"Ngày/giờ không hợp lệ: {ds} {st}-{et}"}, status=400)
            mins = (t2.hour * 60 + t2.minute) - (t1.hour * 60 + t1.minute)
            if mins <= 0:
                return Response({"error": f"Giờ kết thúc phải sau giờ bắt đầu ({ds})"}, status=400)
            parsed.append({"date": dt, "t1": t1, "t2": t2, "hours": mins / 60.0})

        total_hours = round(sum(p["hours"] for p in parsed), 2)
        total_days = round(total_hours / 8.0, 2)

        if _is_pool_type(lt):
            balance = _hnh_pool_balance(employee)
            if total_days > balance + 1e-6:
                return Response({"error": f"Vượt số phép: xin {total_days} ngày ({total_hours}h) nhưng còn {round(balance,2)} ngày"}, status=400)
        else:
            avail = AvailableLeave.objects.filter(employee_id=employee, leave_type_id=lt).first()
            if avail is not None:
                balance = (avail.available_days or 0) + (avail.carryforward_days or 0)
                if total_days > balance + 1e-6:
                    return Response({"error": f"Vượt số phép: xin {total_days} ngày ({total_hours}h) nhưng còn {round(balance,2)} ngày"}, status=400)
            elif lt.payment == "paid":
                return Response({"error": "Bạn chưa được cấp loại phép này"}, status=400)

        created = []
        try:
            with transaction.atomic():
                for p in parsed:
                    lr = LeaveRequest(
                        employee_id=employee,
                        leave_type_id=lt,
                        start_date=p["date"],
                        end_date=p["date"],
                        start_date_breakdown="full_day",
                        end_date_breakdown="full_day",
                        is_hourly=True,
                        requested_hours=round(p["hours"], 2),
                        start_time=p["t1"],
                        end_time=p["t2"],
                        description=description,
                        status="requested",
                    )
                    lr.save()  # save() → requested_days = round(hours/8, 2)
                    created.append(lr)
                from leave.models import LeaveRequestConditionApproval
                for lr in created:
                    for seq, aid in enumerate(approver_ids, start=1):
                        with contextlib.suppress(Exception):
                            ap = Employee.objects.get(id=aid, is_active=True)
                            LeaveRequestConditionApproval.objects.get_or_create(
                                leave_request_id=lr, manager_id=ap,
                                defaults={"sequence": seq, "is_approved": False, "is_rejected": False},
                            )
        except Exception as e:
            return Response({"error": _translate_leave_err(str(e))}, status=400)

        _persist_watchers(created, watcher_ids)

        actor = employee
        emp_name = f"{actor.employee_first_name} {actor.employee_last_name or ''}".strip()
        _desc = _leave_notif_desc(created, lt, total_days, description)
        _ids = [lr.id for lr in created]
        notified = set()
        with contextlib.suppress(Exception):
            rm = actor.employee_work_info.reporting_manager_id
            if rm:
                notify.send(actor, recipient=rm.employee_user_id,
                            verb=f"{emp_name} gửi đề xuất nghỉ phép {total_hours}h cần phê duyệt",
                            description=_desc, icon="people-circle",
                            redirect="/leave/request-view", leave_request_ids=_ids)
                notified.add(rm.employee_user_id.id)
        for uid in list(approver_ids) + list(watcher_ids):
            with contextlib.suppress(Exception):
                u = Employee.objects.get(id=uid, is_active=True)
                if u.employee_user_id.id not in notified:
                    notify.send(actor, recipient=u.employee_user_id,
                                verb=f"{emp_name} gửi đề xuất nghỉ phép {total_hours}h cần phê duyệt",
                                description=_desc, icon="people-circle",
                                redirect="/leave/request-view", leave_request_ids=_ids)
                    notified.add(u.employee_user_id.id)

        return Response({
            "ok": True, "created": len(created),
            "total_hours": total_hours, "total_days": total_days,
            "request_ids": _ids,
        }, status=201)


class EmployeeLeaveRequestUpdateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_request(self, request, pk):
        try:
            return LeaveRequest.objects.get(
                pk=pk, employee_id=request.user.employee_get
            )
        except LeaveRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def get(self, request, pk):
        leave_request = self.get_leave_request(request, pk)
        serializer = UserLeaveRequestGetSerilaizer(leave_request)
        return Response(serializer.data, status=200)

    def put(self, request, pk):
        """Sửa TẠI CHỖ đơn đang CHỜ DUYỆT của chính mình (không cần hủy + tạo lại).
        Sửa được: loại nghỉ, ngày, buổi (theo ngày) hoặc khung giờ (theo giờ), lý do.
        Giữ nguyên chế độ ngày/giờ của đơn; đổi chế độ thì tạo đơn mới."""
        from datetime import datetime as _dt
        from leave.models import LeaveType, AvailableLeave, cal_effective_requested_days
        from leave.methods import calculate_requested_days

        leave_request = self.get_leave_request(request, pk)
        employee = request.user.employee_get
        if not (leave_request.status == "requested" and leave_request.employee_id == employee):
            raise serializers.ValidationError({"error": "Access Denied.."})

        data = request.data
        if isinstance(data, QueryDict):
            data = data.dict()

        lt = LeaveType.objects.filter(id=data.get("leave_type_id") or leave_request.leave_type_id_id).first()
        if lt is None:
            return Response({"error": "Loại nghỉ phép không tồn tại"}, status=400)

        description = data.get("description")
        description = description.strip() if description is not None else leave_request.description

        def _balance_error(total_days):
            if _is_pool_type(lt):
                bal = _hnh_pool_balance(employee)
                if total_days > bal + 1e-6:
                    return f"Vượt số phép: xin {total_days} ngày nhưng còn {round(bal, 2)} ngày"
            else:
                avail = AvailableLeave.objects.filter(employee_id=employee, leave_type_id=lt).first()
                if avail is not None:
                    bal = (avail.available_days or 0) + (avail.carryforward_days or 0)
                    if total_days > bal + 1e-6:
                        return f"Vượt số phép: xin {total_days} ngày nhưng còn {round(bal, 2)} ngày"
                elif lt.payment == "paid":
                    return "Bạn chưa được cấp loại phép này"
            return None

        is_hourly = bool(data.get("is_hourly")) if "is_hourly" in data else leave_request.is_hourly

        if is_hourly:
            ds = data.get("start_date") or leave_request.start_date.isoformat()
            st = (data.get("start_time") or "")[:5]
            et = (data.get("end_time") or "")[:5]
            try:
                dt = _dt.strptime(ds, "%Y-%m-%d").date()
                t1 = _dt.strptime(st, "%H:%M").time()
                t2 = _dt.strptime(et, "%H:%M").time()
            except ValueError:
                return Response({"error": "Ngày/giờ không hợp lệ"}, status=400)
            mins = (t2.hour * 60 + t2.minute) - (t1.hour * 60 + t1.minute)
            if mins <= 0:
                return Response({"error": "Giờ kết thúc phải sau giờ bắt đầu"}, status=400)
            hours = round(mins / 60.0, 2)
            err = _balance_error(round(hours / 8.0, 2))
            if err:
                return Response({"error": err}, status=400)
            leave_request.leave_type_id = lt
            leave_request.is_hourly = True
            leave_request.start_date = dt
            leave_request.end_date = dt
            leave_request.start_date_breakdown = "full_day"
            leave_request.end_date_breakdown = "full_day"
            leave_request.requested_hours = hours
            leave_request.start_time = t1
            leave_request.end_time = t2
            leave_request.description = description
            leave_request.save()  # save() → requested_days = round(hours/8, 2)
        else:
            sd_str = data.get("start_date") or leave_request.start_date.isoformat()
            ed_str = data.get("end_date") or sd_str
            sbd = data.get("start_date_breakdown") or leave_request.start_date_breakdown or "full_day"
            ebd = data.get("end_date_breakdown") or leave_request.end_date_breakdown or sbd
            try:
                sd = _dt.strptime(sd_str, "%Y-%m-%d").date()
                ed = _dt.strptime(ed_str, "%Y-%m-%d").date()
            except ValueError:
                return Response({"error": "Ngày không hợp lệ"}, status=400)
            if ed < sd:
                return Response({"error": "Ngày kết thúc phải sau ngày bắt đầu"}, status=400)
            rd = calculate_requested_days(sd, ed, sbd, ebd)
            rd = cal_effective_requested_days(start_date=sd, end_date=ed, leave_type_id=lt, requested_days=rd)
            err = _balance_error(round(rd, 2))
            if err:
                return Response({"error": err}, status=400)
            payload = {
                "employee_id": employee.id,
                "leave_type_id": lt.id,
                "start_date": sd.isoformat(),
                "end_date": ed.isoformat(),
                "start_date_breakdown": sbd,
                "end_date_breakdown": ebd,
                "description": description,
            }
            serializer = LeaveRequestCreateUpdateSerializer(leave_request, data=payload)
            if not serializer.is_valid():
                msg = next(
                    (str(e) for errs in serializer.errors.values() for e in errs),
                    "Dữ liệu không hợp lệ",
                )
                return Response({"error": _translate_leave_err(msg)}, status=400)
            leave_request = serializer.save()

        return Response(UserLeaveRequestGetSerilaizer(leave_request).data, status=200)

    def delete(self, request, pk):
        leave_request = self.get_leave_request(request, pk)
        employee_id = request.user.employee_get
        if (
            leave_request.status == "requested"
            and leave_request.employee_id == employee_id
        ):
            # Hủy MỀM (status='cancelled') thay vì xóa cứng: giữ lại bản ghi để
            # thông báo "cần duyệt" đã gửi cho quản lý CẬP NHẬT được trạng thái
            # "Đã huỷ" khi mở ra xem (trước đây xóa hẳn → notif trỏ tới đơn không
            # còn tồn tại, quản lý không biết NV đã hủy). Đơn 'cancelled' được ẩn
            # khỏi danh sách đơn của NV nên không gây rối UX (xem GET ở trên).
            from django.utils import timezone as _tz
            leave_request.status = "cancelled"
            leave_request.cancelled_at = _tz.now()
            leave_request.cancelled_by = employee_id
            leave_request.save(update_fields=["status", "cancelled_at", "cancelled_by"])
            return Response(
                {"message": "Leave request cancelled successfully.."}, status=200
            )
        raise serializers.ValidationError({"error": "Access Denied.."})


class LeaveTypeGetCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = LeaveTypeFilter

    # @method_decorator(permission_required('leave.view_leavetype', raise_exception=True), name='dispatch')
    def get(self, request):
        leave_type = LeaveType.objects.all()
        filterset = self.filterset_class(request.GET, queryset=leave_type)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = LeaveTypeAllGetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @method_decorator(
        permission_required("leave.add_leavetype", raise_exception=True),
        name="dispatch",
    )
    def post(self, request):
        serializer = LeaveTypeGetCreateSerilaizer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)


class LeaveTypeGetUpdateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_type(self, pk):
        try:
            return LeaveType.objects.get(pk=pk)
        except LeaveType.DoesNotExist as e:
            raise serializers.ValidationError(e)

    @method_decorator(
        permission_required("leave.view_leavetype", raise_exception=True),
        name="dispatch",
    )
    def get(self, request, pk):
        leave_type = self.get_leave_type(pk)
        serializer = LeaveTypeGetCreateSerilaizer(leave_type)
        return Response(serializer.data, status=200)

    @method_decorator(
        permission_required("leave.change_leavetype", raise_exception=True),
        name="dispatch",
    )
    def put(self, request, pk):
        leave_type = self.get_leave_type(pk)
        serializer = LeaveTypeGetCreateSerilaizer(leave_type, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("leave.delete_leavetype", raise_exception=True),
        name="dispatch",
    )
    def delete(self, request, pk):
        leave_type = self.get_leave_type(pk)
        leave_type.delete()
        return Response(status=201)


class LeaveAllocationRequestGetCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = LeaveAllocationRequestFilter

    def get_user(self, request):
        user = request.user
        if isinstance(user, AnonymousUser):
            raise Http404("AnonymousUser")
        return user

    @manager_permission_required("leave.view_leaveallocationrequest")
    def get(self, request):
        allocation_requests = LeaveAllocationRequest.objects.all().order_by("-id")
        queryset = filtersubordinates(
            request, allocation_requests, "leave.view_leaveallocationrequest"
        )
        filterset = self.filterset_class(request.GET, queryset=queryset)
        paginator = PageNumberPagination()
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, filterset.qs)
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = LeaveAllocationRequestGetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        data = request.data
        employee_id = self.get_user(request).employee_get.id
        if isinstance(data, QueryDict):
            data = data.dict()
        data["created_by"] = employee_id
        serializer = LeaveAllocationRequestCreateSerializer(data=data)
        if serializer.is_valid():
            allocation_request = serializer.save()
            with contextlib.suppress(Exception):
                notify.send(
                    request.user.employee_get,
                    recipient=allocation_request.employee_id.employee_work_info.reporting_manager_id.employee_user_id,
                    verb=f"New leave allocation request created for {allocation_request.employee_id}.",
                    verb_ar=f"تم إنشاء طلب تخصيص إجازة جديد لـ {allocation_request.employee_id}.",
                    verb_de=f"Neue Anfrage zur Urlaubszuweisung erstellt für {allocation_request.employee_id}.",
                    verb_es=f"Nueva solicitud de asignación de permisos creada para {allocation_request.employee_id}.",
                    verb_fr=f"Nouvelle demande d'allocation de congé créée pour {allocation_request.employee_id}.",
                    icon="people-cicle",
                    redirect=f"/leave/leave-allocation-request-view?id={allocation_request.id}",
                    api_redirect=f"/api/leave/allocation-request/{allocation_request.id}/",
                )
            return Response(
                LeaveAllocationRequestGetSerializer(allocation_request).data, status=201
            )
        return Response(serializer.errors, status=400)


class LeaveAllocationRequestGetUpdateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_allocation_request(self, pk):
        try:
            return LeaveAllocationRequest.objects.get(pk=pk)
        except LeaveAllocationRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    @manager_permission_required("leave.view_leaveallocationrequest")
    def get(self, request, pk):
        allocation_request = self.get_leave_allocation_request(pk)
        serializer = LeaveAllocationRequestGetSerializer(allocation_request)
        return Response(serializer.data, status=200)

    @manager_permission_required("leave.change_leaveallocationrequest")
    def put(self, request, pk):
        allocation_request = self.get_leave_allocation_request(pk)
        if allocation_request.status == "requested":
            serializer = LeaveAllocationRequestSerilaizer(
                allocation_request, data=request.data
            )
            if serializer.is_valid():
                allocation_request = serializer.save()
                return Response(
                    LeaveAllocationRequestGetSerializer(allocation_request).data,
                    status=201,
                )
            return Response(serializer.errors, status=400)
        raise serializers.ValidationError({"error": "Access Denied.."})

    @manager_permission_required("leave.delete_leaveallocationrequest")
    def delete(self, request, pk):
        allocation_request = self.get_leave_allocation_request(pk)
        if allocation_request.status == "requested":
            allocation_request.delete()
            return Response(status=200)
        raise serializers.ValidationError({"error": "Access Denied.."})


class AssignLeaveGetCreateAPIView(APIView):

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = AssignedLeaveFilter

    @method_decorator(
        permission_required("leave.view_availableleave", raise_exception=True),
        name="dispatch",
    )
    def get(self, request):
        available_leave = AvailableLeave.objects.all().order_by("-id")
        queryset = filtersubordinates(
            request, available_leave, "leave.view_availableleave"
        )
        filterset = self.filterset_class(request.GET, queryset=queryset)
        paginator = PageNumberPagination()
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, filterset.qs)
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = AssignLeaveGetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @method_decorator(
        permission_required("leave.add_availableleave", raise_exception=True),
        name="dispatch",
    )
    def post(self, request):
        serializer = AssignLeaveCreateSerializer(data=request.data)
        if serializer.is_valid():
            employee_ids = serializer.validated_data.get("employee_ids")
            leave_type_ids = serializer.validated_data.get("leave_type_ids")
            for employee_id in employee_ids:
                for leave_type_id in leave_type_ids:
                    if not AvailableLeave.objects.filter(
                        employee_id=employee_id, leave_type_id=leave_type_id
                    ).exists():
                        AvailableLeave.objects.create(
                            employee_id=employee_id,
                            leave_type_id=leave_type_id,
                            available_days=leave_type_id.total_days,
                        )
                        with contextlib.suppress(Exception):
                            notify.send(
                                request.user.employee_get,
                                recipient=employee_id.employee_user_id,
                                verb="New leave type is assigned to you",
                                verb_ar="تم تعيين نوع إجازة جديد لك",
                                verb_de="Dir wurde ein neuer Urlaubstyp zugewiesen",
                                verb_es="Se te ha asignado un nuevo tipo de permiso",
                                verb_fr="Un nouveau type de congé vous a été attribué",
                                icon="people-circle",
                                redirect="/leave/user-request-view",
                                api_redirect="/api/leave/user-request/",
                            )
            return Response(status=201)
        return Response(serializer.errors, status=400)


class AssignLeaveGetUpdateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_available_leave(self, pk):
        try:
            return AvailableLeave.objects.get(pk=pk)
        except AvailableLeave.DoesNotExist as e:
            raise serializers.ValidationError(e)

    @method_decorator(
        permission_required("leave.view_availableleave", raise_exception=True),
        name="dispatch",
    )
    def get(self, request, pk):
        available_leave = self.get_available_leave(pk)
        serializer = AssignLeaveGetSerializer(available_leave)
        return Response(serializer.data, status=200)

    @method_decorator(
        permission_required("leave.change_availableleave", raise_exception=True),
        name="dispatch",
    )
    def put(self, request, pk):
        available_leave = self.get_available_leave(pk)
        serializer = AvailableLeaveUpdateSerializer(available_leave, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("leave.delete_availableleave", raise_exception=True),
        name="dispatch",
    )
    def delete(self, request, pk):
        available_leave = self.get_available_leave(pk)
        available_leave.delete()
        return Response(status=200)


class LeaveRequestGetCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = LeaveRequestFilter

    @manager_permission_required("leave.view_leaverequest")
    def get(self, request):
        leave_request = LeaveRequest.objects.all().order_by("-id")
        multiple_approvals = filter_conditional_leave_request(request)
        queryset = (
            filtersubordinates(request, leave_request, "leave.view_leaverequest")
            | multiple_approvals
        )
        filterset = self.filterset_class(request.GET, queryset=queryset)
        paginator = PageNumberPagination()
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, filterset.qs)
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = LeaveRequestGetAllSerilaizer(
            page, context={"request": request}, many=True
        )
        return paginator.get_paginated_response(serializer.data)

    @manager_permission_required("leave.add_leaverequest")
    def post(self, request):
        data = request.data
        if isinstance(data, QueryDict):
            data = data.dict()
        data["end_date"] = (
            data.get("start_date") if not data.get("end_date") else data.get("end_date")
        )
        serializer = LeaveRequestCreateUpdateSerializer(data=data)
        if serializer.is_valid():
            leave_request = serializer.save()
            with contextlib.suppress(Exception):
                notify.send(
                    request.user.employee_get,
                    recipient=leave_request.employee_id.employee_work_info.reporting_manager_id.employee_user_id,
                    verb=f"New leave request created for {leave_request.employee_id}.",
                    verb_ar=f"تم إنشاء طلب إجازة جديد لـ {leave_request.employee_id}.",
                    verb_de=f"Neuer Urlaubsantrag erstellt für {leave_request.employee_id}.",
                    verb_es=f"Nueva solicitud de permiso creada para {leave_request.employee_id}.",
                    verb_fr=f"Nouvelle demande de congé créée pour {leave_request.employee_id}.",
                    icon="people-circle",
                    redirect=f"/leave/request-view?id={leave_request.id}",
                    api_redirect=f"/api/leave/request/{leave_request.id}/",
                )
            return Response(
                LeaveRequestGetSerilaizer(
                    leave_request, context={"request": request}
                ).data,
                status=201,
            )
        return Response(serializer.errors, status=400)


class LeaveRequestGetUpdateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_request(self, pk):
        try:
            return LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    @manager_permission_required("leave.view_leaverequest")
    def get(self, request, pk):
        leave_request = self.get_leave_request(pk)
        serializer = LeaveRequestGetSerilaizer(
            leave_request, context={"request": request}
        )
        return Response(serializer.data, status=200)

    @manager_permission_required("leave.change_leaverequest")
    def put(self, request, pk):
        leave_request = self.get_leave_request(pk)
        if leave_request.status == "requested":
            data = request.data
            if isinstance(data, QueryDict):
                data = data.dict()
            data["end_date"] = (
                data.get("start_date")
                if not data.get("end_date")
                else data.get("end_date")
            )
            serializer = LeaveRequestCreateUpdateSerializer(leave_request, data=data)
            if serializer.is_valid():
                leave_request = serializer.save()
                with contextlib.suppress(Exception):
                    notify.send(
                        request.user.employee_get,
                        recipient=leave_request.employee_id.employee_work_info.reporting_manager_id.employee_user_id,
                        verb=f"Leave request updated for {leave_request.employee_id}.",
                        verb_ar=f"تم تحديث طلب الإجازة لـ {leave_request.employee_id}.",
                        verb_de=f"Urlaubsantrag aktualisiert für {leave_request.employee_id}.",
                        verb_es=f"Solicitud de permiso actualizada para {leave_request.employee_id}.",
                        verb_fr=f"Demande de congé mise à jour pour {leave_request.employee_id}.",
                        icon="people-circle",
                        redirect=f"/leave/request-view?id={leave_request.id}",
                        api_redirect=f"/api/leave/request/{leave_request.id}/",
                    )
                return Response(
                    UserLeaveRequestGetSerilaizer(
                        leave_request, context={"request": request}
                    ).data,
                    status=201,
                )
            return Response(serializer.errors, status=400)
        raise serializers.ValidationError({"error": "Access Denied.."})

    @manager_permission_required("leave.delete_leaverequest")
    def delete(self, request, pk):
        leave_request = self.get_leave_request(pk)
        if leave_request.status == "requested":
            leave_request.delete()
            return Response(status=200)
        raise serializers.ValidationError({"error": "Access Denied.."})


class CompanyLeaveGetCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(
        permission_required("leave.view_companyleave", raise_exception=True),
        name="dispatch",
    )
    def get(self, request):
        company_leave = CompanyLeave.objects.all().order_by("-id")
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(company_leave, request)
        serializer = CompanyLeaveSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @method_decorator(
        permission_required("leave.add_companyleave", raise_exception=True),
        name="dispatch",
    )
    def post(self, request):
        serializer = CompanyLeaveSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)


class CompanyLeaveGetUpdateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_company_leave(self, pk):
        try:
            return CompanyLeave.objects.get(pk=pk)
        except CompanyLeave.DoesNotExist as e:
            raise serializers.ValidationError(e)

    @method_decorator(
        permission_required("leave.view_companyleave", raise_exception=True),
        name="dispatch",
    )
    def get(self, request, pk):
        company_leave = self.get_company_leave(pk)
        serializer = CompanyLeaveSerializer(company_leave)
        return Response(serializer.data, status=200)

    @method_decorator(
        permission_required("leave.change_companyleave", raise_exception=True),
        name="dispatch",
    )
    def put(self, request, pk):
        company_leave = self.get_company_leave(pk)
        serializer = CompanyLeaveSerializer(company_leave, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("leave.delete_companyleave", raise_exception=True),
        name="dispatch",
    )
    def delete(self, request, pk):
        company_leave = self.get_company_leave(pk)
        company_leave.delete()
        return Response(status=200)


class HolidayGetCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(
        permission_required("leave.view_holiday", raise_exception=True), name="dispatch"
    )
    def get(self, request):
        holiday = Holiday.objects.all().order_by("-id")
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(holiday, request)
        serializer = HoildaySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @method_decorator(
        permission_required("leave.add_holiday", raise_exception=True), name="dispatch"
    )
    def post(self, request):
        serializer = HoildaySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)


class HolidayGetUpdateDeleteAPIView(APIView):

    def get_holiday(self, pk):
        try:
            return Holiday.objects.get(pk=pk)
        except Holiday.DoesNotExist as e:
            raise serializers.ValidationError(e)

    @method_decorator(
        permission_required("leave.view_holiday", raise_exception=True), name="dispatch"
    )
    def get(self, request, pk):
        holiday = self.get_holiday(pk)
        serializer = HoildaySerializer(holiday)
        return Response(serializer.data, status=200)

    @method_decorator(
        permission_required("leave.change_holiday", raise_exception=True),
        name="dispatch",
    )
    def put(self, request, pk):
        holiday = self.get_holiday(pk)
        serializer = HoildaySerializer(holiday, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("leave.delete_holiday", raise_exception=True),
        name="dispatch",
    )
    def delete(self, request, pk):
        holiday = self.get_holiday(pk)
        holiday.delete()
        return Response(status=200)


class LeaveRequestApproveAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_request(self, pk):
        try:
            return LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def leave_approve_calculation(self, leave_request, available_leave):
        if leave_request.requested_days > available_leave.available_days:
            leave = leave_request.requested_days - available_leave.available_days
            leave_request.approved_available_days = available_leave.available_days
            available_leave.available_days = 0
            available_leave.carryforward_days = (
                available_leave.carryforward_days - leave
            )

            leave_request.approved_carryforward_days = leave
        else:
            temp = available_leave.available_days
            available_leave.available_days = temp - leave_request.requested_days
            leave_request.approved_available_days = leave_request.requested_days
        available_leave.save()

    def leave_multiple_approve(self, request, leave_request, available_leave):
        if request.user.is_superuser:
            LeaveRequestConditionApproval.objects.filter(
                leave_request_id=leave_request
            ).update(is_approved=True)
            self.leave_approve_calculation(leave_request, available_leave)
            leave_request.status = "approved"
            leave_request.save()
        else:
            conditional_requests = leave_request.multiple_approvals()
            approver = [
                manager
                for manager in conditional_requests["managers"]
                if manager.employee_user_id == request.user
            ]
            condition_approval = LeaveRequestConditionApproval.objects.filter(
                manager_id=approver[0], leave_request_id=leave_request
            ).first()
            condition_approval.is_approved = True
            condition_approval.save()
            if approver[0] == conditional_requests["managers"][-1]:
                self.leave_approve_calculation(leave_request, available_leave)
                leave_request.status = "approved"
                leave_request.save()

    @manager_permission_required("leave.change_leaverequest")
    def put(self, request, pk):
        leave_request = self.get_leave_request(pk)
        serializer = LeaveRequestApproveSerializer(leave_request, data=request.data)
        if serializer.is_valid():
            available_leave = serializer.validated_data.get("available_leave")
            if not leave_request.multiple_approvals():
                self.leave_approve_calculation(leave_request, available_leave)
                leave_request.status = "approved"
                leave_request.save()
            else:
                self.leave_multiple_approve(request, leave_request, available_leave)
            with contextlib.suppress(Exception):
                notify.send(
                    request.user.employee_get,
                    recipient=leave_request.employee_id.employee_user_id,
                    verb="Your Leave request has been approved",
                    verb_ar="تمت الموافقة على طلب الإجازة الخاص بك",
                    verb_de="Ihr Urlaubsantrag wurde genehmigt",
                    verb_es="Se ha aprobado su solicitud de permiso",
                    verb_fr="Votre demande de congé a été approuvée",
                    icon="people-circle",
                    redirect=f"/leave/user-request-view?id={leave_request.id}",
                    api_redirect=f"/api/leave/user-request/{leave_request.id}",
                )
            return Response(status=200)
        return Response(serializer.errors, status=400)


class LeaveRequestRejectAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_request(self, pk):
        try:
            return LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def leave_calculation(self, leave_request, employee_id):
        leave_type_id = leave_request.leave_type_id
        available_leave = AvailableLeave.objects.get(
            leave_type_id=leave_type_id, employee_id=employee_id
        )
        available_leave.available_days += leave_request.approved_available_days
        available_leave.carryforward_days += leave_request.approved_carryforward_days
        available_leave.save()
        leave_request.approved_available_days = 0
        leave_request.approved_carryforward_days = 0
        leave_request.status = "rejected"
        leave_request.save()

    @manager_permission_required("leave.change_leaverequest")
    def put(self, request, pk):
        leave_request = self.get_leave_request(pk)
        employee_id = request.user.employee_get
        if leave_request.status != "rejected":
            self.leave_calculation(leave_request, employee_id)
            with contextlib.suppress(Exception):
                notify.send(
                    request.user.employee_get,
                    recipient=leave_request.employee_id.employee_user_id,
                    verb="Your Leave request has been rejected",
                    verb_ar="تم رفض طلب الإجازة الخاص بك",
                    verb_de="Ihr Urlaubsantrag wurde abgelehnt",
                    verb_es="Tu solicitud de permiso ha sido rechazada",
                    verb_fr="Votre demande de congé a été rejetée",
                    icon="people-circle",
                    redirect=f"/leave/user-request-view?id={leave_request.id}",
                    api_redirect=f"/api/leave/user-request/{leave_request.id}/",
                )
            return Response(status=200)
        raise serializers.ValidationError("Nothing to reject.")


class LeaveRequestCancelAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_request(self, pk):
        try:
            return LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def put(self, request, pk):
        leave_request = self.get_leave_request(pk)
        if (
            leave_request.employee_id == request.user.employee_get
            and leave_request.status == "approved"
        ):
            start_date = leave_request.start_date
            curr_date = datetime.now().date()
            if start_date >= curr_date:
                leave_request.status = "cancelled"
                leave_request.save()
                return Response(status=200)
            raise serializers.ValidationError("Nothing to cancel.")
        raise serializers.ValidationError("Access Denied.")


class LeaveAllocationApproveAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_allocation_request(self, pk):
        try:
            return LeaveAllocationRequest.objects.get(pk=pk)
        except LeaveAllocationRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def approve_calculations(self, leave_allocation_request):
        available_leave = AvailableLeave.objects.get_or_create(
            employee_id=leave_allocation_request.employee_id,
            leave_type_id=leave_allocation_request.leave_type_id,
        )[0]
        available_leave.available_days += leave_allocation_request.requested_days
        available_leave.save()

    @manager_permission_required("leave.change_leaveallocationrequest")
    def put(self, request, pk):
        leave_allocation_request = self.get_leave_allocation_request(pk)
        if leave_allocation_request.status == "requested":
            self.approve_calculations(leave_allocation_request)
            leave_allocation_request.status = "approved"
            leave_allocation_request.save()
            return Response(status=200)
        raise serializers.ValidationError("Access Denied.")


class LeaveAllocationRequestRejectAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_allocation_request(self, pk):
        try:
            return LeaveAllocationRequest.objects.get(pk=pk)
        except LeaveAllocationRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def reject_calculation(self, leave_allocation_request):
        if leave_allocation_request.status == "approved":
            leave_type = leave_allocation_request.leave_type_id
            requested_days = leave_allocation_request.requested_days
            available_leave = AvailableLeave.objects.filter(
                leave_type_id=leave_type,
                employee_id=leave_allocation_request.employee_id,
            ).first()
            available_leave.available_days = max(
                0, available_leave.available_days - requested_days
            )
            available_leave.save()

    @manager_permission_required("leave.change_leaveallocationrequest")
    def put(self, request, pk):
        leave_allocation_request = self.get_leave_allocation_request(pk)
        if leave_allocation_request.status != "rejected":
            self.reject_calculation(leave_allocation_request)
            leave_allocation_request.status = "rejected"
            leave_allocation_request.save()
            return Response(status=200)
        raise serializers.ValidationError("Access Denied.")


class LeaveRequestBulkApproveDeleteAPIview(APIView):
    permission_classes = [IsAuthenticated]

    def get_leave_requests(self, request):
        try:
            leave_request_ids = request.data.getlist("leave_request_id")
        except Exception as e:
            raise serializers.ValidationError(
                {"leave_request_id": ["This field is required"]}
            )
        leave_requests = LeaveRequest.objects.filter(id__in=leave_request_ids).exclude(
            status__in=["reject", "cancelled", "approved"]
        )
        if leave_requests:
            return leave_requests
        raise serializers.ValidationError("Nothing to approve")

    def leave_approve_calculation(self, leave_request, available_leave):
        if leave_request.requested_days > available_leave.available_days:
            leave = leave_request.requested_days - available_leave.available_days
            leave_request.approved_available_days = available_leave.available_days
            available_leave.available_days = 0
            available_leave.carryforward_days = (
                available_leave.carryforward_days - leave
            )
            leave_request.approved_carryforward_days = leave
        else:
            temp = available_leave.available_days
            available_leave.available_days = temp - leave_request.requested_days
            leave_request.approved_available_days = leave_request.requested_days
        available_leave.save()

    @manager_permission_required("leave.change_leaverequest")
    def put(self, request):
        leave_requests = self.get_leave_requests(request)
        for leave_request in leave_requests:
            employee_id = leave_request.employee_id
            leave_type_id = leave_request.leave_type_id
            available_leave = AvailableLeave.objects.get(
                leave_type_id=leave_type_id, employee_id=employee_id
            )
            total_available_leave = (
                available_leave.available_days + available_leave.carryforward_days
            )
            if total_available_leave >= leave_request.requested_days:
                self.leave_approve_calculation(leave_request, available_leave)
                leave_request.status = "approved"
                leave_request.save()
        return Response(status=200)

    @manager_permission_required("leave.delete_leaverequest")
    def delete(self, request):
        leave_requests = self.get_leave_requests(request)
        leave_requests.delete()
        return Response(status=200)


class EmployeeLeaveAllocationGetCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = LeaveAllocationRequestFilter

    def get_user(self, request):
        user = request.user
        if isinstance(user, AnonymousUser):
            raise Http404("AnonymousUser")
        return user

    def get(self, request):
        employee = self.get_user(request).employee_get
        allocation_requests = employee.leaveallocationrequest_set.all().order_by("-id")
        filterset = self.filterset_class(request.GET, queryset=allocation_requests)
        paginator = PageNumberPagination()
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, filterset.qs)
        page = paginator.paginate_queryset(filterset.qs, request)
        serializer = LeaveAllocationRequestGetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        data = request.data
        employee_id = self.get_user(request).employee_get.id
        if isinstance(data, QueryDict):
            data = data.dict()
        data["employee_id"] = employee_id
        data["created_by"] = employee_id
        serializer = LeaveAllocationRequestCreateSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(status=200)
        return Response(serializer.errors, status=400)


class EmployeeLeaveAllocationUpdateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_allocation_request(self, request, pk):
        user = request.user
        if isinstance(user, AnonymousUser):
            raise Http404("AnonymousUser")
        try:
            allocation_request = LeaveAllocationRequest.objects.get(id=pk)
            if allocation_request.employee_id == user.employee_get:
                return allocation_request
        except LeaveAllocationRequest.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def put(self, request, pk):
        allocation_request = self.get_allocation_request(request, pk)
        if allocation_request.status == "requested":
            data = request.data
            employee_id = request.user.employee_get.id
            if isinstance(data, QueryDict):
                data = data.dict()
            data["employee_id"] = employee_id
            data["created_by"] = employee_id
            serializer = LeaveAllocationRequestSerilaizer(allocation_request, data=data)
            if serializer.is_valid():
                allocation_request = serializer.save()
                return Response(
                    LeaveAllocationRequestGetSerializer(allocation_request).data,
                    status=201,
                )
            return Response(serializer.errors, status=400)
        raise serializers.ValidationError({"error": "Access Denied.."})
        return Response(status=200)

    def delete(self, request, pk):
        allocation_request = self.get_allocation_request(request, pk)
        if allocation_request.status == "requested":
            allocation_request.delete()
            return Response(status=200)
        raise serializers.ValidationError({"error": "Access Denied.."})


class LeaveRequestedApprovedCountAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @manager_permission_required("leave.view_leaverequest")
    def get(self, request):
        leave_requests = LeaveRequest.objects.all()
        multiple_approvals = filter_conditional_leave_request(request)
        queryset = (
            filtersubordinates(request, leave_requests, "leave.view_leaverequest")
            | multiple_approvals
        )
        requested = queryset.filter(status="requested").count()
        approved = queryset.filter(status="approved").count()
        data = {"requested": requested, "approved": approved}
        return Response(data, status=200)


class EmployeeAvailableLeaveTypeGetAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_employee(self, pk):
        try:
            return Employee.objects.get(pk=pk)
        except Employee.DoesNotExist as e:
            raise serializers.ValidationError(e)

    def get(self, request, pk):
        employee = self.get_employee(pk)
        available_leave = employee.available_leave.all()
        leave_type_ids = available_leave.values_list("leave_type_id", flat=True)
        leave_types = LeaveType.objects.filter(id__in=leave_type_ids)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(leave_types, request)
        serializer = LeaveTypeAllGetSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class LeaveTypeGetPermissionCheckAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(
        permission_required("leave.add_leavetype", raise_exception=True),
        name="dispatch",
    )
    def get(self, request):
        return Response(status=200)


class LeaveAllocationGetPermissionCheckAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @manager_permission_required("leave.view_leaveallocationrequest")
    def get(self, request):
        return Response(status=200)


class LeaveRequestGetPermissionCheckAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @manager_permission_required("leave.view_leaverequest")
    def get(self, request):
        return Response(status=200)


class LeaveAssignGetPermissionCheckAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(
        permission_required("leave.view_availableleave", raise_exception=True),
        name="dispatch",
    )
    def get(self, request):
        return Response(status=200)


class LeavePermissionCheckAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        leave_type = LeaveTypeGetPermissionCheckAPIView()
        leave_allocation = LeaveAllocationGetPermissionCheckAPIView()
        leave_request = LeaveRequestGetPermissionCheckAPIView()
        leave_assign = LeaveAssignGetPermissionCheckAPIView()
        perm_list = []
        try:
            if leave_type.get(request).status_code == 200:
                perm_list.append("leave_type")
        except:
            pass
        try:
            if leave_allocation.get(request).status_code == 200:
                perm_list.append("leave_allocation")
        except:
            pass
        try:
            if leave_request.get(request).status_code == 200:
                perm_list.append("leave_request")
                perm_list.append("leave_overview")
        except:
            pass
        try:
            if leave_assign.get(request).status_code == 200:
                perm_list.append("leave_assign")
        except:
            pass
        return Response({"perm_list": perm_list}, status=200)


# ──────────────────────────────────────────────────────────────────────────────
# PWA Proposals & Approvals API (HNH custom)
# ──────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from employee.models import Employee, EmployeeWorkInformation
from leave.models import AvailableLeave, LeaveType, LeaveRequest, LeaveRequestConditionApproval


class MyProposalsView(APIView):
    """List current user's leave requests for proposals hub."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        status_filter = request.GET.get("status", "")
        leave_type_filter = request.GET.get("leave_type", "")

        qs = LeaveRequest.objects.filter(
            employee_id=employee
        ).select_related("leave_type_id").order_by("-id")

        if status_filter:
            qs = qs.filter(status=status_filter)
        if leave_type_filter:
            qs = qs.filter(leave_type_id__id=leave_type_filter)

        data = []
        for lr in qs[:50]:
            data.append({
                "id": lr.id,
                "leave_type": lr.leave_type_id.name if lr.leave_type_id else None,
                "leave_type_id": lr.leave_type_id.id if lr.leave_type_id else None,
                "start_date": lr.start_date.isoformat() if lr.start_date else None,
                "end_date": lr.end_date.isoformat() if lr.end_date else None,
                "start_date_breakdown": lr.start_date_breakdown,
                "end_date_breakdown": lr.end_date_breakdown,
                "requested_days": lr.requested_days,
                "description": lr.description or "",
                "status": lr.status,
                "created_at": lr.created_at.isoformat() if lr.created_at else None,
                "reject_reason": lr.reject_reason or "",
            })

        return Response(data)


class WatcherCandidatesView(APIView):
    """List C&B employees as watcher candidates."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import JobPosition

        cb_positions = JobPosition.objects.filter(
            job_position__icontains="tiền lương"
        ) | JobPosition.objects.filter(
            job_position__icontains="C&B"
        )

        cb_employees = Employee.objects.filter(
            employee_work_info__job_position_id__in=cb_positions,
            is_active=True,
        ).select_related("employee_work_info__job_position_id", "employee_work_info__department_id")

        candidates = []
        for emp in cb_employees:
            wi = getattr(emp, "employee_work_info", None)
            pos = wi.job_position_id.job_position if wi and wi.job_position_id else None
            candidates.append({
                "id": emp.id,
                "name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                "position": pos,
                "department": wi.department_id.department if wi and wi.department_id else None,
            })

        return Response(candidates)


class MyLeaveSummaryView(APIView):
    """Leave balance summary for current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        balances = AvailableLeave.objects.filter(
            employee_id=employee
        ).select_related("leave_type_id")

        data = []
        for al in balances:
            lt = al.leave_type_id
            if lt is None:
                continue
            data.append({
                "id": al.id,
                "leave_type_id": lt.id,
                "leave_type_name": lt.name,
                "available_days": al.available_days,
                "carryforward_days": al.carryforward_days,
                "total_days": al.total_leave_days,
            })

        pending = LeaveRequest.objects.filter(
            employee_id=employee, status="requested"
        ).count()
        approved = LeaveRequest.objects.filter(
            employee_id=employee, status="approved"
        ).count()

        return Response({
            "balances": data,
            "pending_count": pending,
            "approved_count": approved,
        })


class AvailableManagersView(APIView):
    """List managers the employee can select for approval."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        wi = getattr(employee, "employee_work_info", None)

        managers = []
        seen = set()

        if wi and wi.reporting_manager_id:
            rm = wi.reporting_manager_id
            managers.append({
                "id": rm.id,
                "name": f"{rm.employee_first_name} {rm.employee_last_name or ''}".strip(),
                "position": getattr(getattr(rm, "employee_work_info", None), "job_position_id", None) and rm.employee_work_info.job_position_id.job_position or None,
                "is_direct": True,
            })
            seen.add(rm.id)

        all_managers = Employee.objects.filter(
            reporting_manager__isnull=False,
            is_active=True,
        ).distinct()
        for m in all_managers[:20]:
            if m.id not in seen:
                managers.append({
                    "id": m.id,
                    "name": f"{m.employee_first_name} {m.employee_last_name or ''}".strip(),
                    "position": getattr(getattr(m, "employee_work_info", None), "job_position_id", None) and m.employee_work_info.job_position_id.job_position or None,
                    "is_direct": False,
                })
                seen.add(m.id)

        return Response(managers)


class PendingApprovalsView(APIView):
    """Pending leave/request approvals for the current manager."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get

        subordinate_ids = EmployeeWorkInformation.objects.filter(
            reporting_manager_id=employee
        ).values_list("employee_id", flat=True)

        pending = LeaveRequest.objects.filter(
            employee_id__in=subordinate_ids,
            status="requested",
        ).select_related("employee_id", "leave_type_id").order_by("id")

        cond_approvals = LeaveRequestConditionApproval.objects.filter(
            manager_id=employee,
            is_approved=False,
            is_rejected=False,
        ).select_related("leave_request_id", "leave_request_id__employee_id", "leave_request_id__leave_type_id")

        cond_request_ids = set()
        for ca in cond_approvals:
            if ca.leave_request_id.status == "requested":
                cond_request_ids.add(ca.leave_request_id.id)

        all_requests = list(pending) + list(
            LeaveRequest.objects.filter(id__in=cond_request_ids).exclude(
                id__in=pending.values_list("id", flat=True)
            ).select_related("employee_id", "leave_type_id")
        )

        all_requests.sort(key=lambda r: r.id)

        data = []
        for lr in all_requests:
            emp = lr.employee_id
            lt = lr.leave_type_id
            data.append({
                "id": lr.id,
                "employee_id": emp.id,
                "employee_name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                "badge_id": emp.badge_id,
                "leave_type": lt.name if lt else None,
                "leave_payment": lt.payment if lt else None,
                "start_date": lr.start_date.isoformat() if lr.start_date else None,
                "end_date": lr.end_date.isoformat() if lr.end_date else None,
                "requested_days": lr.requested_days,
                "description": lr.description,
                "status": lr.status,
                "requested_date": lr.requested_date.isoformat() if lr.requested_date else None,
                "start_date_breakdown": lr.start_date_breakdown,
                "end_date_breakdown": lr.end_date_breakdown,
                "is_hourly": getattr(lr, "is_hourly", False) or False,
                "requested_hours": getattr(lr, "requested_hours", None),
                "start_time": lr.start_time.isoformat() if getattr(lr, "start_time", None) else None,
                "end_time": lr.end_time.isoformat() if getattr(lr, "end_time", None) else None,
            })

        return Response(data)


class ApproveLeaveView(APIView):
    """Approve a leave request (for managers via PWA)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            lr = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if lr.status != "requested":
            return Response({"error": "Already processed"}, status=400)

        if not _can_approve_leave(request.user, lr):
            return Response({"error": "Bạn không có quyền duyệt đơn này"}, status=403)

        if _is_pool_type(lr.leave_type_id) and lr.requested_days:
            # HNH: trừ bậc thang qua pool — Phép Bù → Phép Thâm Niên → Nghỉ phép năm.
            # Mỗi loại trừ available trước, rồi tới carryforward (phép tồn).
            remaining = round(lr.requested_days, 2)
            taken_avail = 0.0
            taken_cf = 0.0
            for al in _hnh_pool_rows(lr.employee_id):
                if remaining <= 1e-9:
                    break
                av = al.available_days or 0
                t = min(av, remaining)
                if t > 0:
                    al.available_days = round(av - t, 2)
                    remaining = round(remaining - t, 2)
                    taken_avail += t
                if remaining > 1e-9 and (al.carryforward_days or 0) > 0:
                    cf = al.carryforward_days or 0
                    tc = min(cf, remaining)
                    al.carryforward_days = round(cf - tc, 2)
                    remaining = round(remaining - tc, 2)
                    taken_cf += tc
                al.save()
            lr.approved_available_days = round(taken_avail, 2)
            lr.approved_carryforward_days = round(taken_cf, 2)
        else:
            available_leave = AvailableLeave.objects.filter(
                employee_id=lr.employee_id,
                leave_type_id=lr.leave_type_id,
            ).first()

            if available_leave and lr.requested_days:
                if lr.requested_days > available_leave.available_days:
                    overflow = lr.requested_days - available_leave.available_days
                    lr.approved_available_days = available_leave.available_days
                    available_leave.available_days = 0
                    available_leave.carryforward_days -= overflow
                    lr.approved_carryforward_days = overflow
                else:
                    available_leave.available_days -= lr.requested_days
                    lr.approved_available_days = lr.requested_days
                available_leave.save()

        from django.utils import timezone as _tz
        lr.status = "approved"
        lr.approved_at = _tz.now()  # mốc duyệt để sắp xếp "Đơn đã duyệt"
        lr.approved_by = getattr(request.user, "employee_get", None)  # người duyệt
        lr.save()

        import contextlib
        from notifications.signals import notify
        with contextlib.suppress(Exception):
            notify.send(
                request.user.employee_get,
                recipient=lr.employee_id.employee_user_id,
                verb="Đề xuất nghỉ phép của bạn đã được duyệt",
                icon="people-circle",
                redirect=f"/leave/user-request-view?id={lr.id}",
            )

        _notify_watchers(
            lr, request.user.employee_get,
            f"Đơn nghỉ phép của {lr.employee_id.employee_first_name} đã được duyệt",
        )
        return Response({"status": "approved"})


class RejectLeaveView(APIView):
    """Reject a leave request with reason (for managers via PWA)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            lr = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if lr.status != "requested":
            return Response({"error": "Already processed"}, status=400)

        reason = request.data.get("reason", "")
        lr.status = "rejected"
        lr.reject_reason = reason
        lr.save()

        import contextlib
        from notifications.signals import notify
        with contextlib.suppress(Exception):
            notify.send(
                request.user.employee_get,
                recipient=lr.employee_id.employee_user_id,
                verb="Đề xuất nghỉ phép của bạn đã bị từ chối",
                icon="people-circle",
                redirect=f"/leave/user-request-view?id={lr.id}",
            )

        _notify_watchers(
            lr, request.user.employee_get,
            f"Đơn nghỉ phép của {lr.employee_id.employee_first_name} đã bị từ chối",
        )
        return Response({"status": "rejected"})


class CBLeaveManagersView(APIView):
    """C&B cố định (Người duyệt + theo dõi) cho user hiện tại — luôn pin, khóa,
    client không cho bỏ chọn. Resolve theo công ty/phòng ban của user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from leave.models import resolve_cb_manager

        cb = resolve_cb_manager(request.user.employee_get)
        if not cb:
            return Response([])
        return Response([_person_dict(cb, locked=True)])


class LeaveSelectCandidatesView(APIView):
    """Nhân viên active để chọn Người duyệt/theo dõi — lọc theo công ty/phòng/từ
    khóa. Kèm danh sách công ty + phòng ban để dựng dropdown của modal."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        from base.models import Company, Department
        from employee.models import Employee

        company_id = request.query_params.get("company")
        department_id = request.query_params.get("department")
        search = (request.query_params.get("search") or "").strip()

        qs = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info__job_position_id",
            "employee_work_info__department_id",
            "employee_work_info__company_id",
        )
        if company_id:
            qs = qs.filter(employee_work_info__company_id=company_id)
        if department_id:
            qs = qs.filter(employee_work_info__department_id=department_id)
        if search:
            # Tìm theo tên, email, mã nhân sự (badge_id) và MÃ KẾ TOÁN (accounting_code).
            qs = qs.filter(
                Q(employee_first_name__icontains=search)
                | Q(employee_last_name__icontains=search)
                | Q(email__icontains=search)
                | Q(badge_id__icontains=search)
                | Q(accounting_code__icontains=search)
            )
        people = [_person_dict(e) for e in qs.order_by("employee_first_name")[:100]]
        companies = [{"id": c.id, "name": c.company} for c in Company.objects.all()]
        # Department.company_id là M2M (1 phòng có thể thuộc nhiều công ty) → trả
        # company_ids (list), KHÔNG dùng company_id_id (không tồn tại cho M2M).
        departments = [
            {"id": d.id, "name": d.department, "company_ids": [c.id for c in d.company_id.all()]}
            for d in Department.objects.prefetch_related("company_id").all()
        ]
        return Response({"results": people, "companies": companies, "departments": departments})


class WatchingLeaveRequestsView(APIView):
    """Danh sách đơn nghỉ phép mà user hiện tại đang theo dõi."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from leave.models import LeaveRequestWatcher

        links = LeaveRequestWatcher.objects.filter(
            employee_id=request.user.employee_get
        ).select_related(
            "leave_request_id__employee_id", "leave_request_id__leave_type_id"
        ).order_by("-leave_request_id__id")

        data = []
        for link in links:
            lr = link.leave_request_id
            if not lr:
                continue
            emp = lr.employee_id
            lt = lr.leave_type_id
            data.append({
                "id": lr.id,
                "employee_name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                "leave_type": lt.name if lt else None,
                "start_date": lr.start_date.isoformat() if lr.start_date else None,
                "end_date": lr.end_date.isoformat() if lr.end_date else None,
                "requested_days": lr.requested_days,
                "status": lr.status,
                "description": lr.description,
            })
        return Response(data)

import logging

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from notifications.signals import notify
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from employee.models import Employee
from expenses.models import ExpenseRequest, ExpenseWeeklyBatch

logger = logging.getLogger(__name__)

HC_GROUP_NAME = "Hành chính - Lễ tân"


class ExpensePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def _get_employee(user):
    try:
        return Employee.objects.get(employee_user_id=user)
    except Employee.DoesNotExist:
        return None


def _get_manager_user(employee):
    wi = getattr(employee, "employee_work_info", None)
    if not wi or not wi.reporting_manager_id:
        return None
    return wi.reporting_manager_id.employee_user_id


def _is_hc_user(user):
    return user.groups.filter(name=HC_GROUP_NAME).exists()


def _serialize_expense(exp, include_employee=True):
    data = {
        "id": exp.id,
        "date_incurred": exp.date_incurred.isoformat(),
        "category": exp.category,
        "category_display": exp.get_category_display(),
        "description": exp.description,
        "amount": exp.amount,
        "receipt": exp.receipt.url if exp.receipt else None,
        "status": exp.status,
        "status_display": exp.get_status_display(),
        "manager_note": exp.manager_note,
        "hc_note": exp.hc_note,
        "batch_id": exp.batch_id,
        "created_at": exp.created_at.isoformat() if exp.created_at else None,
    }
    if include_employee:
        data["employee"] = {
            "id": exp.employee_id,
            "name": exp.employee.get_full_name() if hasattr(exp.employee, "get_full_name") else str(exp.employee),
            "badge_id": getattr(exp.employee, "badge_id", ""),
            "department": "",
        }
        wi = getattr(exp.employee, "employee_work_info", None)
        if wi and wi.department_id:
            data["employee"]["department"] = str(wi.department_id)
    return data


# --- Employee endpoints ---

class ExpenseSubmitView(APIView):
    """POST: Submit new expense request (multipart/form-data)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Không tìm thấy hồ sơ nhân viên"}, status=400)

        manager_user = _get_manager_user(emp)
        if not manager_user:
            return Response(
                {"error": "Bạn chưa có quản lý phòng — liên hệ HR để cập nhật"},
                status=400,
            )

        date_incurred = request.data.get("date_incurred")
        category = request.data.get("category")
        description = request.data.get("description", "").strip()
        amount = request.data.get("amount")
        receipt = request.FILES.get("receipt")

        errors = {}
        if not date_incurred:
            errors["date_incurred"] = "Bắt buộc"
        else:
            from datetime import date as _date
            try:
                _date.fromisoformat(date_incurred)
            except (ValueError, TypeError):
                errors["date_incurred"] = "Định dạng ngày không hợp lệ (YYYY-MM-DD)"
        if category not in dict(ExpenseRequest.CATEGORY_CHOICES):
            errors["category"] = "Danh mục không hợp lệ"
        if not description:
            errors["description"] = "Bắt buộc"
        try:
            amount = int(amount)
            if amount <= 0:
                raise ValueError
        except (TypeError, ValueError):
            errors["amount"] = "Số tiền phải là số nguyên dương"
        if not receipt:
            errors["receipt"] = "Chứng từ bắt buộc"
        elif receipt.size > 2 * 1024 * 1024:
            errors["receipt"] = "File tối đa 2MB"
        elif not receipt.content_type.startswith(("image/", "application/pdf")):
            errors["receipt"] = "Chỉ chấp nhận ảnh hoặc PDF"
        if errors:
            return Response({"errors": errors}, status=400)

        exp = ExpenseRequest.objects.create(
            employee=emp,
            date_incurred=date_incurred,
            category=category,
            description=description,
            amount=amount,
            receipt=receipt,
        )

        cat_display = exp.get_category_display()
        notify.send(
            sender=request.user,
            recipient=manager_user,
            verb=f"[Chi phí] {emp} yêu cầu hoàn {amount:,} VND — {cat_display}",
        )

        return Response(_serialize_expense(exp, include_employee=False), status=201)


class ExpenseMyListView(APIView):
    """GET: List my expense requests."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"results": []})

        qs = ExpenseRequest.objects.filter(employee=emp, is_active=True)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        category_filter = request.query_params.get("category")
        if category_filter:
            qs = qs.filter(category=category_filter)
        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(date_incurred__gte=date_from)
        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(date_incurred__lte=date_to)

        total_amount = qs.aggregate(total=Sum("amount"))["total"] or 0

        paginator = ExpensePagination()
        page = paginator.paginate_queryset(qs, request)
        results = [_serialize_expense(e, include_employee=False) for e in page]
        resp = paginator.get_paginated_response(results)
        resp.data["total_amount"] = total_amount
        return resp


class ExpenseEditView(APIView):
    """PATCH: Edit expense (pending only). DELETE: Cancel expense (pending only)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def patch(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Không tìm thấy hồ sơ nhân viên"}, status=400)

        exp = get_object_or_404(ExpenseRequest, pk=pk, employee=emp, is_active=True)
        if exp.status != "pending":
            return Response(
                {"error": "Chỉ có thể sửa yêu cầu đang chờ duyệt"}, status=400
            )

        if "description" in request.data:
            exp.description = request.data["description"].strip()
        if "amount" in request.data:
            try:
                exp.amount = int(request.data["amount"])
                if exp.amount <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return Response({"error": "Số tiền không hợp lệ"}, status=400)
        if "date_incurred" in request.data:
            exp.date_incurred = request.data["date_incurred"]
        if "category" in request.data:
            if request.data["category"] in dict(ExpenseRequest.CATEGORY_CHOICES):
                exp.category = request.data["category"]
        if "receipt" in request.FILES:
            exp.receipt = request.FILES["receipt"]

        exp.save()
        return Response(_serialize_expense(exp, include_employee=False))

    def delete(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Không tìm thấy hồ sơ nhân viên"}, status=400)

        exp = get_object_or_404(ExpenseRequest, pk=pk, employee=emp, is_active=True)
        if exp.status != "pending":
            return Response(
                {"error": "Chỉ có thể hủy yêu cầu đang chờ duyệt"}, status=400
            )

        exp.status = "cancelled"
        exp.save(update_fields=["status"])
        return Response({"status": "cancelled"})


# --- Manager endpoints ---

class ExpenseToApproveView(APIView):
    """GET: Pending requests from my direct reports."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"results": []})

        subordinates = Employee.objects.filter(
            employee_work_info__reporting_manager_id=emp
        ).values_list("id", flat=True)

        qs = ExpenseRequest.objects.filter(
            employee_id__in=subordinates,
            status="pending",
            is_active=True,
        ).select_related("employee__employee_work_info__department_id")

        paginator = ExpensePagination()
        page = paginator.paginate_queryset(qs, request)
        results = [_serialize_expense(e) for e in page]
        return paginator.get_paginated_response(results)


class ExpenseApproveView(APIView):
    """PATCH: Manager approve or reject."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        emp = _get_employee(request.user)
        if not emp:
            return Response({"error": "Không tìm thấy hồ sơ nhân viên"}, status=400)

        exp = get_object_or_404(ExpenseRequest, pk=pk, is_active=True)

        # IDOR guard: must be the reporting manager
        wi = getattr(exp.employee, "employee_work_info", None)
        if not wi or wi.reporting_manager_id != emp:
            return Response({"error": "Bạn không phải quản lý của nhân viên này"}, status=403)

        action = request.data.get("action")
        note = request.data.get("note", "").strip()

        if action == "approve":
            if exp.status == "manager_approved":
                return Response({"error": "Yêu cầu đã được phê duyệt"}, status=400)
            if exp.status not in ("pending",):
                return Response({"error": "Không thể thay đổi trạng thái"}, status=400)
            exp.status = "manager_approved"
            exp.manager_note = note
            exp.save(update_fields=["status", "manager_note"])

            # Notify employee
            emp_user = exp.employee.employee_user_id
            if emp_user:
                notify.send(
                    sender=request.user,
                    recipient=emp_user,
                    verb=f"[Chi phí] Yêu cầu {exp.amount:,} VND của bạn đã được phê duyệt",
                )
            # Notify HC group (single query, bulk recipients)
            hc_users = list(User.objects.filter(groups__name=HC_GROUP_NAME))
            if hc_users:
                notify.send(
                    sender=request.user,
                    recipient=hc_users,
                    verb="[Chi phí] Có yêu cầu chi phí mới chờ xác nhận",
                )

        elif action == "reject":
            if exp.status not in ("pending", "manager_approved"):
                return Response({"error": "Không thể thay đổi trạng thái"}, status=400)
            exp.status = "rejected"
            exp.manager_note = note
            exp.save(update_fields=["status", "manager_note"])

            emp_user = exp.employee.employee_user_id
            if emp_user:
                msg = f"[Chi phí] Yêu cầu {exp.amount:,} VND bị từ chối"
                if note:
                    msg += f": {note}"
                notify.send(sender=request.user, recipient=emp_user, verb=msg)
        else:
            return Response({"error": "action phải là 'approve' hoặc 'reject'"}, status=400)

        return Response(_serialize_expense(exp))


# --- Hành chính endpoints ---

class ExpenseAdminListView(APIView):
    """GET: All requests (HC only), with filters."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_hc_user(request.user):
            return Response({"error": "Chỉ Hành chính mới được truy cập"}, status=403)

        qs = ExpenseRequest.objects.filter(is_active=True).select_related(
            "employee__employee_work_info__department_id"
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(date_incurred__gte=date_from)

        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(date_incurred__lte=date_to)

        dept_id = request.query_params.get("department_id")
        if dept_id:
            qs = qs.filter(employee__employee_work_info__department_id=dept_id)

        paginator = ExpensePagination()
        page = paginator.paginate_queryset(qs, request)
        results = [_serialize_expense(e) for e in page]
        return paginator.get_paginated_response(results)


class ExpenseHCConfirmView(APIView):
    """PATCH: HC confirm and assign to batch."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not _is_hc_user(request.user):
            return Response({"error": "Chỉ Hành chính mới được thực hiện"}, status=403)

        exp = get_object_or_404(ExpenseRequest, pk=pk, is_active=True)
        if exp.status not in ("manager_approved", "hc_approved"):
            return Response(
                {"error": "Chỉ xác nhận được yêu cầu đã qua quản lý duyệt"},
                status=400,
            )

        batch_id = request.data.get("batch_id")
        if not batch_id:
            return Response({"error": "batch_id bắt buộc"}, status=400)

        batch = get_object_or_404(ExpenseWeeklyBatch, pk=batch_id, is_active=True)
        exp.status = "hc_approved"
        exp.batch = batch
        exp.hc_note = request.data.get("note", "").strip()
        exp.save(update_fields=["status", "batch", "hc_note"])

        emp_user = exp.employee.employee_user_id
        if emp_user:
            notify.send(
                sender=request.user,
                recipient=emp_user,
                verb=f"[Chi phí] Yêu cầu {exp.amount:,} VND đã được Hành chính xác nhận",
            )

        return Response(_serialize_expense(exp))


class ExpenseBatchCreateView(APIView):
    """POST: Create batch. GET: List batches."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_hc_user(request.user):
            return Response({"error": "Chỉ Hành chính mới được truy cập"}, status=403)

        qs = ExpenseWeeklyBatch.objects.filter(is_active=True).annotate(
            item_count=Count("items", filter=Q(items__is_active=True)),
            total_amount=Sum("items__amount", filter=Q(items__is_active=True)),
        )
        paginator = ExpensePagination()
        page = paginator.paginate_queryset(qs, request)
        results = [{
            "id": b.id,
            "week_start": b.week_start.isoformat(),
            "week_end": b.week_end.isoformat(),
            "note": b.note,
            "item_count": b.item_count,
            "total_amount": b.total_amount or 0,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        } for b in page]
        return paginator.get_paginated_response(results)

    def post(self, request):
        if not _is_hc_user(request.user):
            return Response({"error": "Chỉ Hành chính mới được tạo"}, status=403)

        week_start = request.data.get("week_start")
        week_end = request.data.get("week_end")
        note = request.data.get("note", "").strip()

        if not week_start or not week_end:
            return Response({"error": "week_start và week_end bắt buộc"}, status=400)

        batch = ExpenseWeeklyBatch.objects.create(
            week_start=week_start,
            week_end=week_end,
            note=note,
        )
        return Response({
            "id": batch.id,
            "week_start": batch.week_start.isoformat(),
            "week_end": batch.week_end.isoformat(),
            "note": batch.note,
            "item_count": 0,
            "total_amount": 0,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
        }, status=201)


class ExpenseBatchDetailView(APIView):
    """GET: Batch detail with all items."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not _is_hc_user(request.user):
            return Response({"error": "Chỉ Hành chính mới được truy cập"}, status=403)

        batch = get_object_or_404(ExpenseWeeklyBatch, pk=pk, is_active=True)
        items = batch.items.filter(is_active=True).select_related(
            "employee__employee_work_info__department_id"
        )
        return Response({
            "id": batch.id,
            "week_start": batch.week_start.isoformat(),
            "week_end": batch.week_end.isoformat(),
            "note": batch.note,
            "item_count": items.count(),
            "total_amount": items.aggregate(total=Sum("amount"))["total"] or 0,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
            "items": [_serialize_expense(e) for e in items],
        })

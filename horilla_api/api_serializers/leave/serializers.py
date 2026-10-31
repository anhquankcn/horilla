from rest_framework import serializers

from employee.models import Employee
from leave.methods import calculate_requested_days
from leave.models import *


def _leave_halves(start, end, sbd, ebd):
    """Tập (ngày, 'am'|'pm') mà 1 đơn nghỉ theo ngày chiếm. Biên: ngày đầu
    'second_half' = chỉ chiều; ngày cuối 'first_half' = chỉ sáng."""
    from datetime import timedelta
    out = set()
    d = start
    while d <= end:
        if not (d == start and sbd == "second_half"):
            out.add((d, "am"))
        if not (d == end and ebd == "first_half"):
            out.add((d, "pm"))
        d += timedelta(days=1)
    return out


def _request_halves(lr):
    """Như _leave_halves cho LeaveRequest đã có; đơn theo giờ quy ra buổi theo mốc 12:00."""
    from datetime import time as _t
    if getattr(lr, "is_hourly", False) and lr.start_time and lr.end_time:
        noon = _t(12, 0)
        out = set()
        if lr.start_time < noon:
            out.add((lr.start_date, "am"))
        if lr.end_time > noon:
            out.add((lr.start_date, "pm"))
        return out
    return _leave_halves(
        lr.start_date, lr.end_date,
        lr.start_date_breakdown or "full_day", lr.end_date_breakdown or "full_day",
    )


def hourly_conflict(employee, d, t1, t2, exclude_id=None):
    """Đơn theo giờ [t1, t2) ngày d trùng đơn nào đang hiệu lực? Giờ-với-giờ so khung
    giờ giao nhau; giờ-với-đơn ngày/nửa ngày so theo buổi (mốc 12:00). Trả đơn trùng hoặc None."""
    from datetime import time as _t
    noon = _t(12, 0)
    mine = set()
    if t1 < noon:
        mine.add((d, "am"))
    if t2 > noon:
        mine.add((d, "pm"))
    qs = employee.leaverequest_set.filter(start_date__lte=d, end_date__gte=d).exclude(
        status__in=["cancelled", "rejected"]
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    for lr in qs:
        if getattr(lr, "is_hourly", False) and lr.start_time and lr.end_time:
            if t1 < lr.end_time and t2 > lr.start_time:
                return lr
        elif mine & _request_halves(lr):
            return lr
    return None


def describe_leave(lr):
    if getattr(lr, "is_hourly", False) and lr.start_time and lr.end_time:
        return f"{lr.start_date:%d/%m/%Y} {lr.start_time:%H:%M}–{lr.end_time:%H:%M}"
    labels = {"first_half": "sáng", "second_half": "chiều"}
    if lr.start_date == lr.end_date:
        part = labels.get(lr.start_date_breakdown, "cả ngày")
        return f"{lr.start_date:%d/%m/%Y} ({part})"
    return f"{lr.start_date:%d/%m/%Y}–{lr.end_date:%d/%m/%Y}"


def leave_Validations(self, data):
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    start_date_breakdown = (
        data.get("start_date_breakdown")
        if data.get("start_date_breakdown") is not None
        else "full_day"
    )
    end_date_breakdown = (
        data.get("end_date_breakdown")
        if data.get("end_date_breakdown") is not None
        else "full_day"
    )
    employee = data.get("employee_id")
    leave_type_id = data.get("leave_type_id")
    attachment = data.get("attachment")
    available_leave = (
        AvailableLeave.objects.filter(
            leave_type_id=leave_type_id, employee_id=employee
        )[0]
        if AvailableLeave.objects.filter(
            leave_type_id=leave_type_id, employee_id=employee
        ).exists()
        else None
    )

    # Nhóm 2 — loại nghỉ không trừ phép: không có AvailableLeave cho bất kỳ NV nào.
    # Chỉ kiểm tra ngày chồng lấp và attachment, bỏ qua balance.
    is_no_balance_type = (
        available_leave is None
        and not AvailableLeave.objects.filter(leave_type_id=leave_type_id).exists()
    )

    # HNH pool (Bù → Thâm niên → Năm): đơn mang 1 loại đại diện nhưng khi duyệt trừ
    # bậc thang cả pool — nên số dư phải kiểm theo TỔNG pool. Kiểm riêng loại đại
    # diện (thường là Phép năm) chặn nhầm NV hết phép năm nhưng còn phép bù.
    from horilla_api.api_views.leave.views import _hnh_pool_balance, _is_pool_type
    is_pool = _is_pool_type(leave_type_id)
    pool_balance = _hnh_pool_balance(employee) if is_pool else None

    if not available_leave and not is_no_balance_type and not (is_pool and pool_balance > 0):
        raise serializers.ValidationError(
            f"Employee is not assigned with leave type {leave_type_id}."
        )

    errors = {}
    # checking if there is any requested days is overlapping with the existing leave request
    # Exclude cancelled/rejected requests so employees can re-apply for rejected dates
    leave_requests = employee.leaverequest_set.filter(
        start_date__lte=end_date, end_date__gte=start_date
    ).exclude(status__in=["cancelled", "rejected"])
    if self.instance:
        leave_requests = leave_requests.exclude(id=self.instance.id)
    # Xét theo BUỔI: đã nghỉ chiều vẫn được xin nghỉ sáng cùng ngày; chỉ chặn khi trùng buổi.
    new_halves = _leave_halves(start_date, end_date, start_date_breakdown, end_date_breakdown)
    if any(new_halves & _request_halves(lr) for lr in leave_requests):
        raise serializers.ValidationError(
            "There is already a leave request for this date range."
        )

    # checking if the end date is less than the start date
    if not start_date <= end_date:
        errors["end_date"] = ["End date should not be less than start date."]

    if start_date == end_date and start_date_breakdown != end_date_breakdown:
        raise serializers.ValidationError(
            "There is a mismatch in the breakdown of the start date and end date."
        )

    if not is_no_balance_type:
        requested_days = calculate_requested_days(
            start_date, end_date, start_date_breakdown, end_date_breakdown
        )
        effective_requested_days = cal_effective_requested_days(
            start_date=start_date,
            end_date=end_date,
            leave_type_id=leave_type_id,
            requested_days=requested_days,
        )
        if is_pool:
            total_leave_days = pool_balance
        else:
            total_leave_days = (
                available_leave.available_days + available_leave.carryforward_days
            )
        if not effective_requested_days <= total_leave_days:
            raise serializers.ValidationError("Employee doesn't have enough leave days..")

    if leave_type_id.require_attachment == "yes" and attachment == None:
        errors["attachment"] = ["This field is required."]

    if errors:
        raise serializers.ValidationError(errors)


class GetAvailableLeaveTypeSerializer(serializers.ModelSerializer):
    leave_type_id = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()

    class Meta:
        model = AvailableLeave
        fields = [
            "id",
            "leave_type_id",
            "icon",
            "available_days",
            "carryforward_days",
            "total_leave_days",
        ]

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None

    def get_icon(self, obj):
        try:
            return obj.leave_type_id.icon.url
        except:
            return None


class GetAvailableLeaveTypeSerializer(serializers.ModelSerializer):
    leave_type_id = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    total_leave_days = serializers.SerializerMethodField()

    class Meta:
        model = AvailableLeave
        fields = [
            "id",
            "leave_type_id",
            "icon",
            "available_days",
            "carryforward_days",
            "total_leave_days",
        ]

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None

    def get_icon(self, obj):
        try:
            return obj.leave_type_id.icon.url
        except:
            return None

    def get_total_leave_days(self, obj):
        return obj.available_days + obj.carryforward_days


class userLeaveRequestGetAllSerilaizer(serializers.ModelSerializer):
    leave_type_id = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        exclude = [
            "requested_date",
            "attachment",
            "approved_available_days",
            "approved_carryforward_days",
            "created_at",
            "employee_id",
            "created_by",
        ]
        # Giữ description + reject_reason để màn chi tiết đơn hiển thị lý do / lý do từ chối.

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None


class UserLeaveRequestGetSerilaizer(serializers.ModelSerializer):
    leave_type_id = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        exclude = [
            "requested_date",
            "approved_available_days",
            "approved_carryforward_days",
            "created_at",
            "reject_reason",
            "employee_id",
            "created_by",
        ]

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None


class LeaveRequestCreateUpdateSerializer(serializers.ModelSerializer):

    class Meta:
        model = LeaveRequest
        fields = [
            "employee_id",
            "leave_type_id",
            "start_date",
            "start_date_breakdown",
            "end_date",
            "end_date_breakdown",
            "description",
            "attachment",
        ]

    def validate(self, data):
        leave_Validations(self, data)
        return data


class UpdateLeaveRequestSerializer(serializers.ModelSerializer):

    class Meta:
        model = LeaveRequest
        fields = [
            "start_date",
            "start_date_breakdown",
            "end_date",
            "end_date_breakdown",
            "description",
            "attachment",
        ]

    def validate(self, data):
        leave_Validations(self, data)
        return data


class LeaveTypeGetCreateSerilaizer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = "__all__"

    def validate(self, data):
        reset = data.get("reset")
        reset_based = data.get("reset_based")
        reset_month = data.get("reset_month")
        reset_day = data.get("reset_day")
        reset_weekday = data.get("reset_weekday")
        carryforward_type = data.get("carryforward_type")
        carryforward_max = data.get("carryforward_max")
        if reset == True:
            if reset_based == None:
                raise serializers.ValidationError(
                    {"reset_based": ["This field is required."]}
                )
            elif reset_based == "yearly" and reset_month == None:
                raise serializers.ValidationError(
                    {"reset_month": ["This field is required."]}
                )
            elif reset_based in ["yearly", "monthly"] and reset_day == "":
                raise serializers.ValidationError(
                    {"reset_day": ["This field is required."]}
                )
            elif reset_based == "weekly" and reset_weekday == None:
                raise serializers.ValidationError(
                    {"reset_weekday": ["This field is required."]}
                )
            # elif carryforward_type in ['carryforward', 'carryforward expire'] and carryforward_max
        return data


class LeaveTypeAllGetSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ["id", "name", "icon", "total_days"]


class LeaveAllocationRequestCreateSerializer(serializers.ModelSerializer):
    requested_days = serializers.FloatField(required=True)

    class Meta:
        model = LeaveAllocationRequest
        fields = [
            "leave_type_id",
            "employee_id",
            "requested_days",
            "created_by",
            "description",
            "attachment",
        ]


class AssignLeaveCreateSerializer(serializers.Serializer):
    leave_type_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=LeaveType.objects.all()
    )
    employee_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Employee.objects.all()
    )

    def validate_leave_type_ids(self, value):
        if not value:
            raise serializers.ValidationError(
                {"leave_type_ids": ["This field is required."]}
            )
        return value

    def validate_employee_ids(self, value):
        if not value:
            raise serializers.ValidationError(
                {"employee_ids": ["This field is required."]}
            )
        return value


class AssignLeaveGetSerializer(serializers.ModelSerializer):

    employee_id = serializers.SerializerMethodField()
    leave_type_id = serializers.SerializerMethodField()

    class Meta:
        model = AvailableLeave
        exclude = ["reset_date", "expired_date"]

    def get_employee_id(self, obj):
        employee = obj.employee_id
        if employee:
            return EmployeeGetSerializer(employee).data
        return None

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None


class EmployeeGetSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = ["id", "full_name", "employee_profile", "badge_id"]

    def get_full_name(self, obj):
        return obj.get_full_name()


class AvailableLeaveUpdateSerializer(serializers.ModelSerializer):
    available_days = serializers.FloatField(required=True)

    class Meta:
        model = AvailableLeave
        fields = ["available_days", "carryforward_days"]


class LeaveRequestGetAllSerilaizer(serializers.ModelSerializer):
    employee_id = serializers.SerializerMethodField()
    leave_type_id = serializers.SerializerMethodField()
    multiple_approve = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        exclude = [
            "requested_date",
            "description",
            "attachment",
            "approved_available_days",
            "approved_carryforward_days",
            "created_at",
            "reject_reason",
            "created_by",
        ]

    def get_employee_id(self, obj):
        employee = obj.employee_id
        if employee:
            return EmployeeGetSerializer(employee).data
        return None

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None

    def get_multiple_approve(self, obj):
        approvals = LeaveRequestConditionApproval.objects.filter(leave_request_id=obj)
        employee = self.context["request"].user.employee_get
        if approvals and obj.status == "requested":
            is_approved = approvals.filter(is_approved=True)
            count = f"{is_approved.count()} / {approvals.count()}"
            is_approved = (
                True if is_approved.filter(manager_id=employee).exists() else False
            )
            return {"count": count, "is_approved": is_approved}
        return None


class LeaveRequestGetSerilaizer(serializers.ModelSerializer):
    employee_id = serializers.SerializerMethodField()
    leave_type_id = serializers.SerializerMethodField()
    multiple_approve = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        exclude = [
            "requested_date",
            "approved_available_days",
            "approved_carryforward_days",
            "created_at",
            "reject_reason",
            "created_by",
        ]

    def get_employee_id(self, obj):
        employee = obj.employee_id
        if employee:
            return EmployeeGetSerializer(employee).data
        return None

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None

    def get_multiple_approve(self, obj):
        approvals = LeaveRequestConditionApproval.objects.filter(leave_request_id=obj)
        employee = self.context["request"].user.employee_get
        if approvals and obj.status == "requested":
            is_approved = approvals.filter(is_approved=True)
            count = f"{is_approved.count()} / {approvals.count()}"
            is_approved = (
                True if is_approved.filter(manager_id=employee).exists() else False
            )
            return {"count": count, "is_approved": is_approved}
        return None


class LeaveAllocationRequestSerilaizer(serializers.ModelSerializer):
    class Meta:
        model = LeaveAllocationRequest
        exclude = [
            "requested_date",
            "status",
            "created_by",
            "created_at",
            "reject_reason",
        ]


class LeaveAllocationRequestGetSerializer(serializers.ModelSerializer):
    employee_id = serializers.SerializerMethodField()
    leave_type_id = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = LeaveAllocationRequest
        exclude = ["requested_date", "created_at", "reject_reason"]

    def get_employee_id(self, obj):
        employee = obj.employee_id
        if employee:
            return EmployeeGetSerializer(employee).data
        return None

    def get_leave_type_id(self, obj):
        if obj.leave_type_id:
            return LeaveTypeAllGetSerializer(obj.leave_type_id).data
        return None

    def get_created_by(self, obj):
        created_by = obj.created_by
        if created_by:
            return EmployeeGetSerializer(created_by).data
        return None


class CompanyLeaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyLeaves
        exclude = ["company_id"]


class HoildaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holidays
        exclude = ["company_id"]

    def validate(self, data):
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        if end_date and not start_date <= end_date:
            raise serializers.ValidationError(
                {"end_date": ["End date should not be less than start date."]}
            )
        return data


class LeaveRequestApproveSerializer(serializers.ModelSerializer):

    class Meta:
        model = LeaveRequest
        fields = []

    def validate(self, data):
        leave_request = self.instance
        if leave_request.status != "requested":
            raise serializers.ValidationError("Nothing to approve.")
        employee_id = leave_request.employee_id
        leave_type_id = leave_request.leave_type_id
        available_leave = AvailableLeave.objects.get(
            leave_type_id=leave_type_id, employee_id=employee_id
        )
        total_available_leave = (
            available_leave.available_days + available_leave.carryforward_days
        )
        if not total_available_leave >= leave_request.requested_days:
            raise serializers.ValidationError(
                f"{employee_id} dont have enough leave days to approve the request.."
            )
        data["available_leave"] = available_leave
        return data

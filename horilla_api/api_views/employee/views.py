from django.db.models import ProtectedError, Q
from django.http import Http404
from django.utils.decorators import method_decorator
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from employee.filters import (
    DisciplinaryActionFilter,
    DocumentRequestFilter,
    EmployeeFilter,
)
from employee.models import (
    Actiontype,
    DisciplinaryAction,
    Employee,
    EmployeeBankDetails,
    EmployeeType,
    EmployeeWorkInformation,
    Policy,
)
from employee.views import work_info_export, work_info_import
from horilla.decorators import owner_can_enter
from horilla_api.api_decorators.base.decorators import permission_required
from horilla_api.api_methods.employee.methods import get_next_badge_id
from horilla_documents.models import Document, DocumentRequest
from notifications.signals import notify

from ...api_decorators.base.decorators import (
    manager_or_owner_permission_required,
    manager_permission_required,
)
from ...api_decorators.employee.decorators import or_condition
from ...api_methods.base.methods import groupby_queryset, permission_based_queryset
from ...api_serializers.employee.serializers import (
    ActiontypeSerializer,
    DisciplinaryActionSerializer,
    DocumentRequestSerializer,
    DocumentSerializer,
    EmployeeBankDetailsSerializer,
    EmployeeListSerializer,
    EmployeeMeSerializer,
    EmployeeSelectorSerializer,
    EmployeeSerializer,
    EmployeeTypeSerializer,
    EmployeeWorkInformationSerializer,
    PolicySerializer,
)


def permission_check(request, perm):
    return request.user.has_perm(perm)


def object_check(cls, pk):
    try:
        obj = cls.objects.get(id=pk)
        return obj
    except cls.DoesNotExist:
        return None


def object_delete(cls, pk):
    try:
        cls.objects.get(id=pk).delete()
        return "", 200
    except Exception as e:
        return {"error": str(e)}, 400


class EmployeeMeAPIView(APIView):
    """Returns / updates the authenticated user's own employee profile."""

    permission_classes = [IsAuthenticated]

    SELF_EDITABLE_FIELDS = {
        "phone",
        "address",
        "city",
        "state",
        "country",
        "zip",
        "emergency_contact",
        "emergency_contact_name",
        "emergency_contact_relation",
        "marital_status",
        "children",
    }

    def get(self, request):
        try:
            employee = request.user.employee_get
        except Employee.DoesNotExist:
            return Response(
                {"error": "No employee record for this user"}, status=404
            )
        serializer = EmployeeMeSerializer(employee)
        return Response(serializer.data, status=200)

    def patch(self, request):
        try:
            employee = request.user.employee_get
        except Employee.DoesNotExist:
            return Response(
                {"error": "No employee record for this user"}, status=404
            )

        data = {
            k: v for k, v in request.data.items() if k in self.SELF_EDITABLE_FIELDS
        }
        if not data:
            return Response({"error": "No editable fields provided"}, status=400)

        serializer = EmployeeMeSerializer(employee, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(EmployeeMeSerializer(employee).data, status=200)
        return Response(serializer.errors, status=400)


class EmployeeBankView(APIView):
    """GET / POST (upsert) bank details for the authenticated user's own record."""

    permission_classes = [IsAuthenticated]

    def _emp(self, request):
        return getattr(request.user, "employee_get", None)

    def get(self, request):
        emp = self._emp(request)
        if not emp:
            return Response({"error": "No employee record"}, status=404)
        bank = getattr(emp, "employee_bank_details", None)
        if not bank:
            return Response(None, status=200)
        return Response({
            "id": bank.id,
            "bank_name": bank.bank_name or "",
            "account_number": bank.account_number or "",
            "branch": bank.branch or "",
            "any_other_code1": bank.any_other_code1 or "",
        })

    def post(self, request):
        emp = self._emp(request)
        if not emp:
            return Response({"error": "No employee record"}, status=404)
        bank, _ = EmployeeBankDetails.objects.get_or_create(employee_id=emp)
        for field in ("bank_name", "account_number", "branch", "any_other_code1"):
            if field in request.data:
                setattr(bank, field, request.data[field] or None)
        bank.save()
        return Response({
            "id": bank.id,
            "bank_name": bank.bank_name or "",
            "account_number": bank.account_number or "",
            "branch": bank.branch or "",
            "any_other_code1": bank.any_other_code1 or "",
        })


class EmployeeScheduleView(APIView):
    """
    Return the employee's shift schedule for a specific week, with approved leave overlaid.
    Query params:
      week_offset=0  (0=current week, -1=last week, 1=next week, etc.)
    Response days keyed by ISO date (YYYY-MM-DD).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date, timedelta
        from base.models import EmployeeShiftSchedule
        from leave.models import LeaveRequest

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee record"}, status=404)
        wi = getattr(emp, "employee_work_info", None)
        if not wi or not wi.shift_id:
            return Response({"shift_name": None, "weekly_full_time": None, "days": {}}, status=200)

        shift = wi.shift_id

        # Build day-name → schedule map
        schedules = EmployeeShiftSchedule.objects.filter(shift_id=shift).select_related("day")
        sched_map = {}
        for s in schedules:
            sched_map[s.day.day] = {
                "start_time": s.start_time.strftime("%H:%M") if s.start_time else None,
                "end_time": s.end_time.strftime("%H:%M") if s.end_time else None,
                "start_time_2": s.start_time_2.strftime("%H:%M") if s.start_time_2 else None,
                "end_time_2": s.end_time_2.strftime("%H:%M") if s.end_time_2 else None,
                "minimum_working_hour": s.minimum_working_hour,
                "is_night_shift": s.is_night_shift,
            }

        # Compute week start (Monday) for the requested offset
        week_offset = int(request.query_params.get("week_offset", 0))
        today = date.today()
        dow = today.weekday()  # 0=Mon, 6=Sun
        monday = today - timedelta(days=dow) + timedelta(weeks=week_offset)
        DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

        # Collect approved leaves that overlap with this week
        week_end = monday + timedelta(days=6)
        approved_leaves = LeaveRequest.objects.filter(
            employee_id=emp,
            status="approved",
            start_date__lte=week_end,
            end_date__gte=monday,
        ).select_related("leave_type_id")

        # Build a date → leave_type map
        leave_dates: dict[date, str] = {}
        for lr in approved_leaves:
            d = lr.start_date
            while d <= lr.end_date:
                leave_dates[d] = lr.leave_type_id.name if lr.leave_type_id else "Nghỉ phép"
                d += timedelta(days=1)

        # Build final days dict keyed by ISO date
        days = {}
        for i, day_name in enumerate(DAY_NAMES):
            current_date = monday + timedelta(days=i)
            iso = current_date.isoformat()
            leave_type = leave_dates.get(current_date)
            if leave_type:
                days[iso] = {
                    "day_name": day_name,
                    "start_time": None,
                    "end_time": None,
                    "start_time_2": None,
                    "end_time_2": None,
                    "minimum_working_hour": "00:00",
                    "is_night_shift": False,
                    "is_leave": True,
                    "leave_type": leave_type,
                    "is_off": False,
                }
            elif day_name in sched_map:
                s = sched_map[day_name]
                days[iso] = {
                    "day_name": day_name,
                    **s,
                    "is_leave": False,
                    "leave_type": None,
                    "is_off": False,
                }
            else:
                days[iso] = {
                    "day_name": day_name,
                    "start_time": None,
                    "end_time": None,
                    "start_time_2": None,
                    "end_time_2": None,
                    "minimum_working_hour": "00:00",
                    "is_night_shift": False,
                    "is_leave": False,
                    "leave_type": None,
                    "is_off": True,
                }

        return Response({
            "shift_name": shift.employee_shift,
            "weekly_full_time": shift.weekly_full_time,
            "days": days,
        })


class EmployeeTypeAPIView(APIView):
    """
    Retrieves employee types.

    Methods:
        get(request, pk=None): Returns a single employee type if pk is provided, otherwise returns all employee types.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            employee_type = EmployeeType.objects.get(id=pk)
            serializer = EmployeeTypeSerializer(employee_type)
            return Response(serializer.data, status=200)
        employee_type = EmployeeType.objects.all()
        serializer = EmployeeTypeSerializer(employee_type, many=True)
        return Response(serializer.data, status=200)


class EmployeeAPIView(APIView):
    """
    Handles CRUD operations for employees.
    """

    filter_backends = [DjangoFilterBackend]
    filterset_class = EmployeeFilter
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        try:
            employee = Employee.objects.only(
                "id",
                "employee_first_name",
                "employee_last_name",  # include only needed fields
            ).get(pk=pk)
        except Employee.DoesNotExist:
            return Response(
                {"error": "Employee does not exist"}, status=status.HTTP_404_NOT_FOUND
            )

        # If user has global view permission
        if user.has_perm("employee.view_employee"):
            serializer = EmployeeSerializer(employee)
            return Response(serializer.data)

        # If employee is in user's subordinates
        subordinates = user.employee_get.get_subordinate_employees()
        if subordinates.filter(pk=pk).exists():
            serializer = EmployeeSerializer(employee)
            return Response(serializer.data)

        # If requesting own data
        if employee.pk == user.employee_get.id:
            serializer = EmployeeSerializer(employee)
            return Response(serializer.data)

        return Response(
            {"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN
        )

        # paginator = PageNumberPagination()
        # if request.user.has_perm('employee.view_employee'):
        #     employees_queryset = Employee.objects.all()
        # elif request.user.employee_get.get_subordinate_employees():
        #     employees_queryset = request.user.employee_get.get_subordinate_employees()
        # else:
        #     employees_queryset = [request.user.employee_get]
        # employees_filter_queryset = self.filterset_class(
        #     request.GET, queryset=employees_queryset).qs
        # field_name = request.GET.get("groupby_field", None)
        # if field_name:
        #     url = request.build_absolute_uri()
        #     return groupby_queryset(request, url, field_name, employees_filter_queryset)
        # page = paginator.paginate_queryset(employees_filter_queryset, request)
        # serializer = EmployeeSerializer(page, many=True)
        # return paginator.get_paginated_response(serializer.data)

    @method_decorator(permission_required("employee.add_employee"))
    def post(self, request):
        serializer = EmployeeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        user = request.user
        employee = Employee.objects.get(pk=pk)
        if (
            employee
            in [user.employee_get, request.user.employee_get.get_reporting_manager()]
        ) or user.has_perm("employee.change_employee"):
            serializer = EmployeeSerializer(employee, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"error": "You don't have permission"}, status=400)

    @method_decorator(permission_required("employee.delete_employee"))
    def delete(self, request, pk):
        try:
            employee = Employee.objects.get(pk=pk)
            employee.delete()
        except Employee.DoesNotExist:
            return Response(
                {"error": "Employee does not exist"}, status=status.HTTP_404_NOT_FOUND
            )
        except ProtectedError as e:
            return Response({"error": str(e)}, status=status.HTTP_204_NO_CONTENT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeListAPIView(APIView):
    """
    Retrieves a paginated list of employees with optional search functionality.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        search = request.query_params.get("search")

        # Start with a base queryset with only required fields (active employees only)
        employees_queryset = Employee.objects.filter(is_active=True).only(
            "id", "employee_first_name", "employee_last_name"
        )

        # Permission-based filtering
        if user.has_perm("employee.view_employee"):
            pass  # employees_queryset is already all active employees
        else:
            subordinate_qs = user.employee_get.get_subordinate_employees().filter(is_active=True)
            if subordinate_qs.exists():
                employees_queryset = subordinate_qs.only(
                    "id", "employee_first_name", "employee_last_name"
                )
            else:
                employees_queryset = employees_queryset.filter(id=user.employee_get.id)

        # Apply search filter if provided
        if search:
            employees_queryset = employees_queryset.filter(
                Q(employee_first_name__icontains=search)
                | Q(employee_last_name__icontains=search)
            )

        # Paginate
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees_queryset, request)

        serializer = EmployeeListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class EmployeeBankDetailsAPIView(APIView):
    """
    Manage employee bank details with CRUD operations.

    Methods:
        get(request, pk=None):
            - Retrieves bank details for a specific employee if `pk` is provided.
            - Returns a paginated list of all employee bank details if `pk` is not provided.

        post(request):
            - Creates a new bank detail entry for an employee.

        put(request, pk):
            - Updates existing bank details for an employee identified by `pk`.

        delete(request, pk):
            - Deletes bank details for an employee identified by `pk`.
    """

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = EmployeeBankDetails.objects.all()
        user = self.request.user
        # checking user level permissions
        perm = "base.view_employeebankdetails"
        queryset = permission_based_queryset(user, perm, queryset)
        return queryset

    def get(self, request, pk=None):
        bank_detail = EmployeeBankDetails.objects.get(pk=pk)
        if (
            request.user.employee_get
            in [
                bank_detail.employee_id,
                bank_detail.employee_id.get_reporting_manager(),
            ]
        ) or request.user.has_perm("employee.view_employeebankdetails"):
            serializer = EmployeeBankDetailsSerializer(bank_detail)
            return Response(serializer.data)

        return Response({"message": "No permission"}, status=400)

    @manager_or_owner_permission_required(
        EmployeeBankDetails, "employee.add_employeebankdetails"
    )
    def post(self, request):
        serializer = EmployeeBankDetailsSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @manager_or_owner_permission_required(
        EmployeeBankDetails, "employee.add_employeebankdetails"
    )
    def put(self, request, pk):
        try:
            bank_detail = EmployeeBankDetails.objects.get(pk=pk)
        except EmployeeBankDetails.DoesNotExist:
            return Response(
                {"error": "Bank details do not exist"}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = EmployeeBankDetailsSerializer(bank_detail, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @manager_permission_required("employee.change_employeebankdetails")
    def delete(self, request, pk):
        try:
            bank_detail = EmployeeBankDetails.objects.get(pk=pk)
            bank_detail.delete()
        except EmployeeBankDetails.DoesNotExist:
            return Response(
                {"error": "Bank details do not exist"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as E:
            return Response({"error": str(E)}, status=400)

        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeWorkInformationAPIView(APIView):
    """
    Manage employee work information with CRUD operations.

    Methods:
        get(request, pk):
            - Retrieves work information for a specific employee identified by `pk`.

        post(request):
            - Creates a new work information entry for an employee.

        put(request, pk):
            - Updates existing work information for an employee identified by `pk`.

        delete(request, pk):
            - Deletes work information for an employee identified by `pk`.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        work_info = EmployeeWorkInformation.objects.get(pk=pk)
        if (
            request.user.employee_get
            in [work_info.employee_id, work_info.reporting_manager_id]
        ) or request.user.has_perm("employee.view_employeeworkinformation"):
            serializer = EmployeeWorkInformationSerializer(work_info)
            return Response(serializer.data, status=200)
        return Response({"message": "No permission"}, status=400)

    @manager_permission_required("employee.add_employeeworkinformation")
    def post(self, request):
        serializer = EmployeeWorkInformationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @manager_permission_required("employee.change_employeeworkinformation")
    def put(self, request, pk):
        work_info = EmployeeWorkInformation.objects.get(pk=pk)
        if (
            request.user.employee_get == work_info.reporting_manager_id
            or request.user.has_perm("employee.change_employeeworkinformation")
        ):
            serializer = EmployeeWorkInformationSerializer(
                work_info, data=request.data, partial=True
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "No permission"}, status=400)

    @method_decorator(
        permission_required("employee.delete_employeeworkinformation"), name="dispatch"
    )
    def delete(self, request, pk):
        try:
            work_info = EmployeeWorkInformation.objects.get(pk=pk)
        except EmployeeWorkInformation.DoesNotExist:
            raise Http404
        work_info.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeWorkInfoExportView(APIView):
    """
    Endpoint for exporting employee work information.

    Methods:
        get(request):
            - Exports work information data based on user permissions.
    """

    permission_classes = [IsAuthenticated]

    @manager_permission_required("employee.add_employeeworkinformation")
    def get(self, request):
        return work_info_export(request)


class EmployeeWorkInfoImportView(APIView):
    """
    Endpoint for importing employee work information.

    Methods:
        get(request):
            - Handles the importing of work information data based on user permissions.
    """

    permission_classes = [IsAuthenticated]

    @manager_permission_required("employee.add_employeeworkinformation")
    def get(self, request):
        return work_info_import(request)


class EmployeeBulkUpdateView(APIView):
    """
    Endpoint for bulk updating employee and work information.

    Permissions:
        - Requires authentication and "change_employee" permission.

    Methods:
        put(request):
            - Updates multiple employees and their work information.
    """

    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("employee.change_employee"), name="dispatch")
    def put(self, request):
        employee_ids = request.data.get("ids", [])
        employees = Employee.objects.filter(id__in=employee_ids)
        employee_work_info = EmployeeWorkInformation.objects.filter(
            employee_id__in=employees
        )
        employee_data = request.data.get("employee_data", {})
        work_info_data = request.data.get("employee_work_info", {})
        fields_to_remove = [
            "badge_id",
            "employee_first_name",
            "employee_last_name",
            "is_active",
            "email",
            "phone",
            "employee_bank_details__account_number",
        ]
        for field in fields_to_remove:
            employee_data.pop(field, None)
            work_info_data.pop(field, None)

        try:
            employees.update(**employee_data)
            employee_work_info.update(**work_info_data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)
        return Response({"status": "success"}, status=200)


class ActiontypeView(APIView):
    serializer_class = ActiontypeSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            action_type = object_check(Actiontype, pk)
            if action_type is None:
                return Response({"error": "Actiontype not found"}, status=404)
            serializer = self.serializer_class(action_type)
            return Response(serializer.data, status=200)
        action_types = Actiontype.objects.all()
        paginater = PageNumberPagination()
        page = paginater.paginate_queryset(action_types, request)
        serializer = self.serializer_class(page, many=True)
        return paginater.get_paginated_response(serializer.data)

    def post(self, request):
        if permission_check(request, "employee.add_actiontype") is False:
            return Response({"error": "No permission"}, status=401)
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def put(self, request, pk):
        if permission_check(request, "employee.change_actiontype") is False:
            return Response({"error": "No permission"}, status=401)
        action_type = object_check(Actiontype, pk)
        if action_type is None:
            return Response({"error": "Actiontype not found"}, status=404)
        serializer = self.serializer_class(action_type, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        if permission_check(request, "employee.delete_actiontype") is False:
            return Response({"error": "No permission"}, status=401)
        action_type = object_check(Actiontype, pk)
        if action_type is None:
            return Response({"error": "Actiontype not found"}, status=404)
        response, status_code = object_delete(Actiontype, pk)
        return Response(response, status=status_code)


class DisciplinaryActionAPIView(APIView):
    """
    Endpoint for managing disciplinary actions.

    Permissions:
        - Requires authentication.

    Methods:
        get(request, pk=None):
            - Retrieves a specific disciplinary action by `pk` or lists all disciplinary actions with optional filtering.

        post(request):
            - Creates a new disciplinary action.

        put(request, pk):
            - Updates an existing disciplinary action by `pk`.

        delete(request, pk):
            - Deletes a specific disciplinary action by `pk`.
    """

    filterset_class = DisciplinaryActionFilter
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return DisciplinaryAction.objects.get(pk=pk)
        except DisciplinaryAction.DoesNotExist:
            raise Http404

    def get(self, request, pk=None):
        if pk:
            employee = request.user.employee_get
            disciplinary_action = self.get_object(pk)
            is_manager = (
                True
                if employee.get_subordinate_employees()
                & disciplinary_action.employee_id.all()
                else False
            )
            if (
                (employee == disciplinary_action.employee_id)
                or is_manager
                or request.user.has_perm("employee.view_disciplinaryaction")
            ):
                serializer = DisciplinaryActionSerializer(disciplinary_action)
                return Response(serializer.data, status=200)
            return Response({"error": "No permission"}, status=400)
        else:
            employee = request.user.employee_get
            is_manager = EmployeeWorkInformation.objects.filter(
                reporting_manager_id=employee
            ).exists()
            subordinates = employee.get_subordinate_employees()

            if request.user.has_perm("employee.view_disciplinaryaction"):
                queryset = DisciplinaryAction.objects.all()
            elif is_manager:
                queryset_subordinates = DisciplinaryAction.objects.filter(
                    employee_id__in=subordinates
                )
                queryset_employee = DisciplinaryAction.objects.filter(
                    employee_id=employee
                )
                queryset = queryset_subordinates | queryset_employee
            else:
                queryset = DisciplinaryAction.objects.filter(employee_id=employee)

            paginator = PageNumberPagination()
            disciplinary_actions = queryset
            disciplinary_action_filter_queryset = self.filterset_class(
                request.GET, queryset=disciplinary_actions
            ).qs
            page = paginator.paginate_queryset(
                disciplinary_action_filter_queryset, request
            )
            serializer = DisciplinaryActionSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        if permission_check(request, "employee.add_disciplinaryaction") is False:
            return Response({"error": "No permission"}, status=401)
        serializer = DisciplinaryActionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        if permission_check(request, "employee.add_disciplinaryaction") is False:
            return Response({"error": "No permission"}, status=401)
        disciplinary_action = self.get_object(pk)
        serializer = DisciplinaryActionSerializer(
            disciplinary_action, data=request.data
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if permission_check(request, "employee.add_disciplinaryaction") is False:
            return Response({"error": "No permission"}, status=401)
        disciplinary_action = self.get_object(pk)
        disciplinary_action.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PolicyAPIView(APIView):
    """
    Endpoint for managing policies.

    Permissions:
        - Requires authentication.

    Methods:
        get(request, pk=None):
            - Retrieves a specific policy by `pk` or lists all policies with optional search functionality.

        post(request):
            - Creates a new policy.

        put(request, pk):
            - Updates an existing policy by `pk`.

        delete(request, pk):
            - Deletes a specific policy by `pk`.
    """

    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return Policy.objects.get(pk=pk)
        except Policy.DoesNotExist:
            raise Http404

    def get(self, request, pk=None):
        if pk:
            policy = self.get_object(pk)
            serializer = PolicySerializer(policy)
            return Response(serializer.data)
        else:
            search = request.GET.get("search", None)
            if search:
                policies = Policy.objects.filter(title__icontains=search)
            else:
                policies = Policy.objects.all()
            serializer = PolicySerializer(policies, many=True)
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(policies, request)
            serializer = PolicySerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        if permission_check(request, "employee.add_policy") is False:
            return Response({"error": "No permission"}, status=401)

        serializer = PolicySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def put(self, request, pk):
        if permission_check(request, "employee.change_policy") is False:
            return Response({"error": "No permission"}, status=401)
        policy = self.get_object(pk)
        serializer = PolicySerializer(policy, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        if permission_check(request, "employee.delete_policy") is False:
            return Response({"error": "No permission"}, status=401)
        policy = self.get_object(pk)
        policy.delete()
        return Response(status=204)


class DocumentRequestAPIView(APIView):
    """
    Endpoint for managing document requests.

    Permissions:
        - Requires authentication.
        - Specific actions require manager-level permissions.

    Methods:
        get(request, pk=None):
            - Retrieves a specific document request by `pk` or lists all document requests with pagination.

        post(request):
            - Creates a new document request and notifies relevant employees.

        put(request, pk):
            - Updates an existing document request by `pk`.

        delete(request, pk):
            - Deletes a specific document request by `pk`.
    """

    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return DocumentRequest.objects.get(pk=pk)
        except DocumentRequest.DoesNotExist:
            raise Http404

    def get(self, request, pk=None):
        if pk:
            document_request = self.get_object(pk)
            serializer = DocumentRequestSerializer(document_request)
            return Response(serializer.data)
        else:
            document_requests = DocumentRequest.objects.all()
            pagination = PageNumberPagination()
            page = pagination.paginate_queryset(document_requests, request)
            serializer = DocumentRequestSerializer(page, many=True)
            return pagination.get_paginated_response(serializer.data)

    @manager_permission_required("horilla_documents.add_documentrequests")
    def post(self, request):
        serializer = DocumentRequestSerializer(data=request.data)
        if serializer.is_valid():
            obj = serializer.save()
            try:
                employees = [user.employee_user_id for user in obj.employee_id.all()]

                notify.send(
                    request.user.employee_get,
                    recipient=employees,
                    verb=f"{request.user.employee_get} requested a document.",
                    verb_ar=f"طلب {request.user.employee_get} مستنداً.",
                    verb_de=f"{request.user.employee_get} hat ein Dokument angefordert.",
                    verb_es=f"{request.user.employee_get} solicitó un documento.",
                    verb_fr=f"{request.user.employee_get} a demandé un document.",
                    redirect="/employee/employee-profile",
                    icon="chatbox-ellipses",
                    api_redirect=f"/api/employee/document-request/{obj.id}",
                )
            except:
                pass
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @manager_permission_required("horilla_documents.change_documentrequests")
    def put(self, request, pk):
        document_request = self.get_object(pk)
        serializer = DocumentRequestSerializer(document_request, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @method_decorator(permission_required("employee.delete_employee"))
    def delete(self, request, pk):
        document_request = self.get_object(pk)
        document_request.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentAPIView(APIView):
    filterset_class = DocumentRequestFilter
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return Document.objects.get(pk=pk)
        except Document.DoesNotExist:
            raise Http404

    def get(self, request, pk=None):
        if pk:
            document = self.get_object(pk)
            serializer = DocumentSerializer(document)
            return Response(serializer.data)
        else:
            documents = Document.objects.all()
            document_requests_filtered = self.filterset_class(
                request.GET, queryset=documents
            ).qs
            paginator = PageNumberPagination()
            page = paginator.paginate_queryset(document_requests_filtered, request)
            serializer = DocumentSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

    @manager_or_owner_permission_required(
        DocumentRequest, "horilla_documents.add_document"
    )
    def post(self, request):
        serializer = DocumentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            try:
                notify.send(
                    request.user.employee_get,
                    recipient=request.user.employee_get.get_reporting_manager().employee_user_id,
                    verb=f"{request.user.employee_get} uploaded a document",
                    verb_ar=f"قام {request.user.employee_get} بتحميل مستند",
                    verb_de=f"{request.user.employee_get} hat ein Dokument hochgeladen",
                    verb_es=f"{request.user.employee_get} subió un documento",
                    verb_fr=f"{request.user.employee_get} a téléchargé un document",
                    redirect=f"/employee/employee-view/{request.user.employee_get.id}/",
                    icon="chatbox-ellipses",
                    api_redirect=f"/api/employee/documents/",
                )
            except:
                pass
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @method_decorator(owner_can_enter("horilla_documents.change_document", Employee))
    def put(self, request, pk):
        document = self.get_object(pk)
        serializer = DocumentSerializer(document, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @method_decorator(owner_can_enter("horilla_documents.delete_document", Employee))
    def delete(self, request, pk):
        document = self.get_object(pk)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentRequestApproveRejectView(APIView):
    permission_classes = [IsAuthenticated]

    @manager_permission_required("horilla_documents.add_document")
    def post(self, request, id, status):
        document = Document.objects.filter(id=id).first()
        document.status = status
        document.save()
        return Response({"status": "success"}, status=200)


class DocumentBulkApproveRejectAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @manager_permission_required("horilla_documents.add_document")
    def put(self, request):
        ids = request.data.get("ids", None)
        status = request.data.get("status", None)
        status_code = 200

        if ids:
            documents = Document.objects.filter(id__in=ids)
            response = []
            for document in documents:
                if not document.document:
                    status_code = 400
                    response.append({"id": document.id, "error": "No documents"})
                    continue
                response.append({"id": document.id, "status": "success"})
                document.status = status
                document.save()
        return Response(response, status=status_code)


class EmployeeBulkArchiveView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("employee.delete_employee"))
    def post(self, request, is_active):
        ids = request.data.get("ids")
        error = []
        for employee_id in ids:
            employee = Employee.objects.get(id=employee_id)
            employee.is_active = is_active
            employee.employee_user_id.is_active = is_active
            if employee.get_archive_condition() is False:
                employee.save()
            error.append(
                {
                    "employee": str(employee),
                    "error": "Related model found for this employee. ",
                }
            )
        return Response(error, status=200)


class EmployeeArchiveView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("employee.delete_employee"))
    def post(self, request, id, is_active):
        employee = Employee.objects.get(id=id)
        employee.is_active = is_active
        employee.employee_user_id.is_active = is_active
        response = None
        if employee.get_archive_condition() is False:
            employee.save()
        else:
            response = {
                "employee": str(employee),
                "error": employee.get_archive_condition(),
            }
        return Response(response, status=200)


class EmployeeSelectorView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        employees = Employee.objects.filter(employee_user_id=request.user, is_active=True)

        is_manager = EmployeeWorkInformation.objects.filter(
            reporting_manager_id=employee
        ).exists()

        if is_manager:
            employees = Employee.objects.filter(
                Q(pk=employee.pk) | Q(employee_work_info__reporting_manager_id=employee),
                is_active=True,
            )
        if request.user.has_perm("employee.view_employee"):
            employees = Employee.objects.filter(is_active=True)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(employees, request)
        serializer = EmployeeSelectorSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class ReportingManagerCheck(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if Employee.objects.filter(
            employee_work_info__reporting_manager_id=request.user.employee_get
        ):
            return Response(status=200)
        return Response(status=404)


class EmployeeDirectoryView(APIView):
    """Rich employee list for PWA with work info included."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings

        user = request.user
        qs = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info",
            "employee_work_info__department_id",
            "employee_work_info__job_position_id",
            "employee_work_info__job_role_id",
            "employee_work_info__company_id",
            "employee_work_info__shift_id",
            "employee_work_info__work_type_id",
            "employee_work_info__employee_type_id",
            "employee_work_info__reporting_manager_id",
        )

        if not user.has_perm("employee.view_employee"):
            sub = user.employee_get.get_subordinate_employees()
            if sub.exists():
                qs = qs.filter(Q(pk=user.employee_get.pk) | Q(pk__in=sub))
            else:
                qs = qs.filter(pk=user.employee_get.pk)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(employee_first_name__icontains=search)
                | Q(employee_last_name__icontains=search)
                | Q(badge_id__icontains=search)
                | Q(phone__icontains=search)
            )

        dept = request.query_params.get("department")
        if dept:
            qs = qs.filter(employee_work_info__department_id=dept)

        company = request.query_params.get("company")
        if company:
            qs = qs.filter(employee_work_info__company_id=company)

        status = request.query_params.get("status")
        if status == "pending":
            qs = qs.filter(
                Q(employee_work_info__isnull=True)
                | Q(employee_work_info__job_position_id__isnull=True)
            )
        elif status == "assigned":
            qs = qs.filter(employee_work_info__job_position_id__isnull=False)

        qs = qs.order_by("employee_first_name", "employee_last_name")

        paginator = PageNumberPagination()
        paginator.page_size = 50
        page = paginator.paginate_queryset(qs, request)

        def _safe(val):
            return str(val) if val else None

        def _profile_url(emp):
            if emp.employee_profile:
                return settings.MEDIA_URL + str(emp.employee_profile)
            return None

        results = []
        for emp in page:
            wi = getattr(emp, "employee_work_info", None)
            results.append(
                {
                    "id": emp.pk,
                    "badge_id": emp.badge_id,
                    "stt": emp.stt,
                    "attendance_code": emp.attendance_code,
                    "employee_code": emp.employee_code,
                    "accounting_code": emp.accounting_code,
                    "master_data_code": emp.master_data_code,
                    "is_active": emp.is_active,
                    "first_name": emp.employee_first_name,
                    "last_name": emp.employee_last_name or "",
                    "email": emp.email,
                    "phone": emp.phone,
                    "profile": _profile_url(emp),
                    "gender": emp.gender,
                    "department": _safe(
                        wi.department_id.department if wi and wi.department_id else None
                    ),
                    "department_id": wi.department_id_id if wi and wi.department_id else None,
                    "job_position": _safe(
                        wi.job_position_id.job_position
                        if wi and wi.job_position_id
                        else None
                    ),
                    "job_role": _safe(
                        wi.job_role_id.job_role if wi and wi.job_role_id else None
                    ),
                    "company": _safe(
                        wi.company_id.company if wi and wi.company_id else None
                    ),
                    "shift": _safe(
                        wi.shift_id.employee_shift if wi and wi.shift_id else None
                    ),
                    "work_type": _safe(
                        wi.work_type_id.work_type if wi and wi.work_type_id else None
                    ),
                    "employee_type": _safe(
                        wi.employee_type_id.employee_type
                        if wi and wi.employee_type_id
                        else None
                    ),
                    "date_joining": (
                        wi.date_joining.isoformat() if wi and wi.date_joining else None
                    ),
                    "reporting_manager": (
                        wi.reporting_manager_id.get_full_name()
                        if wi and wi.reporting_manager_id
                        else None
                    ),
                    "reporting_manager_id": (
                        wi.reporting_manager_id_id
                        if wi and wi.reporting_manager_id_id
                        else None
                    ),
                }
            )

        return paginator.get_paginated_response(results)


class DepartmentListView(APIView):
    """List departments — includes manager_id (first reporting manager found in dept)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import Department
        from django.db.models import OuterRef, Subquery

        manager_subq = EmployeeWorkInformation.objects.filter(
            department_id=OuterRef("pk"),
            reporting_manager_id__isnull=False,
        ).values("reporting_manager_id_id")[:1]

        depts = (
            Department.objects.filter(is_active=True)
            .annotate(manager_id=Subquery(manager_subq))
            .order_by("department")
        )
        return Response(
            [{"id": d.pk, "name": d.department, "manager_id": d.manager_id} for d in depts]
        )


class EmployeeByEmailView(APIView):
    """Lookup an active employee by email — Arkon M2M integration."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings as conf

        email = request.query_params.get("email", "").strip()
        if not email:
            return Response({"detail": "email query param required."}, status=400)

        try:
            emp = Employee.objects.select_related(
                "employee_work_info",
                "employee_work_info__department_id",
                "employee_work_info__job_position_id",
                "employee_work_info__job_role_id",
            ).get(email=email, is_active=True)
        except Employee.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        wi = getattr(emp, "employee_work_info", None)
        return Response({
            "id": emp.pk,
            "badge_id": emp.badge_id,
            "first_name": emp.employee_first_name,
            "last_name": emp.employee_last_name or "",
            "email": emp.email,
            "phone": emp.phone,
            "profile": (conf.MEDIA_URL + str(emp.employee_profile)) if emp.employee_profile else None,
            "gender": emp.gender,
            "department": wi.department_id.department if wi and wi.department_id else None,
            "department_id": wi.department_id_id if wi and wi.department_id else None,
            "job_position": wi.job_position_id.job_position if wi and wi.job_position_id else None,
            "job_role": wi.job_role_id.job_role if wi and wi.job_role_id else None,
            "reporting_manager_id": wi.reporting_manager_id_id if wi and wi.reporting_manager_id_id else None,
        })


class EmployeePublicInfoView(APIView):
    """Public profile info for a specific employee — Arkon M2M integration."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from django.conf import settings as conf

        try:
            emp = Employee.objects.select_related(
                "employee_work_info",
                "employee_work_info__department_id",
                "employee_work_info__job_position_id",
                "employee_work_info__job_role_id",
            ).get(pk=pk, is_active=True)
        except Employee.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        wi = getattr(emp, "employee_work_info", None)
        return Response({
            "id": emp.pk,
            "badge_id": emp.badge_id,
            "first_name": emp.employee_first_name,
            "last_name": emp.employee_last_name or "",
            "email": emp.email,
            "phone": emp.phone,
            "profile": (conf.MEDIA_URL + str(emp.employee_profile)) if emp.employee_profile else None,
            "gender": emp.gender,
            "department": wi.department_id.department if wi and wi.department_id else None,
            "department_id": wi.department_id_id if wi and wi.department_id else None,
            "job_position": wi.job_position_id.job_position if wi and wi.job_position_id else None,
            "job_role": wi.job_role_id.job_role if wi and wi.job_role_id else None,
            "date_joining": wi.date_joining.isoformat() if wi and wi.date_joining else None,
            "reporting_manager_id": wi.reporting_manager_id_id if wi and wi.reporting_manager_id_id else None,
        })


class CompanyListView(APIView):
    """List companies for filter chips."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import Company

        companies = Company.objects.filter(is_active=True).order_by("company")
        return Response(
            [{"id": c.pk, "name": c.company} for c in companies]
        )


class PositionListView(APIView):
    """List job positions filtered by department."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import JobPosition

        dept = request.query_params.get("department")
        qs = JobPosition.objects.filter(is_active=True)
        if dept:
            qs = qs.filter(department_id=dept)
        qs = qs.order_by("job_position")
        return Response(
            [{"id": p.pk, "name": p.job_position, "department_id": p.department_id_id} for p in qs]
        )


class RolesForPositionView(APIView):
    """List job roles for a given position."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import JobRole

        position = request.query_params.get("position")
        if not position:
            return Response([], status=200)
        qs = JobRole.objects.filter(
            job_position_id=position, is_active=True
        ).order_by("job_role")
        return Response(
            [{"id": r.pk, "name": r.job_role} for r in qs]
        )


class AssignPositionView(APIView):
    """Assign position to employee, auto-assigns first role."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from base.models import Company, Department, JobPosition, JobRole

        employee_id = request.data.get("employee_id")
        company_id = request.data.get("company_id")
        department_id = request.data.get("department_id")
        position_id = request.data.get("position_id")
        role_id = request.data.get("role_id")

        if not employee_id or not position_id:
            return Response(
                {"error": "employee_id and position_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            emp = Employee.objects.get(pk=employee_id, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Employee not found"}, status=404)

        try:
            position = JobPosition.objects.get(pk=position_id)
        except JobPosition.DoesNotExist:
            return Response({"error": "Position not found"}, status=404)

        if not department_id:
            department_id = position.department_id_id
        if not company_id:
            companies = position.company_id.all()
            company_id = companies.first().pk if companies.exists() else None

        if not role_id:
            first_role = JobRole.objects.filter(
                job_position_id=position, is_active=True
            ).order_by("pk").first()
            role_id = first_role.pk if first_role else None

        wi, created = EmployeeWorkInformation.objects.get_or_create(
            employee_id=emp,
            defaults={
                "company_id_id": company_id,
                "department_id_id": department_id,
                "job_position_id_id": position_id,
                "job_role_id_id": role_id,
            },
        )
        if not created:
            wi.company_id_id = company_id
            wi.department_id_id = department_id
            wi.job_position_id_id = position_id
            wi.job_role_id_id = role_id
            wi.save()

        return Response({
            "ok": True,
            "position": position.job_position,
            "role": wi.job_role_id.job_role if wi.job_role_id else None,
        })


class RevokePositionView(APIView):
    """Revoke position from employee (clear position & role)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        employee_id = request.data.get("employee_id")
        if not employee_id:
            return Response(
                {"error": "employee_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            emp = Employee.objects.get(pk=employee_id, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Employee not found"}, status=404)

        wi = getattr(emp, "employee_work_info", None)
        if not wi:
            return Response({"error": "No work info"}, status=400)

        wi.job_position_id = None
        wi.job_role_id = None
        wi.save()
        return Response({"ok": True})


class ChangeRoleView(APIView):
    """Change role within the same position."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from base.models import JobRole

        employee_id = request.data.get("employee_id")
        role_id = request.data.get("role_id")

        if not employee_id or not role_id:
            return Response(
                {"error": "employee_id and role_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            emp = Employee.objects.get(pk=employee_id, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Employee not found"}, status=404)

        wi = getattr(emp, "employee_work_info", None)
        if not wi or not wi.job_position_id:
            return Response({"error": "Employee has no position"}, status=400)

        try:
            role = JobRole.objects.get(pk=role_id, is_active=True)
        except JobRole.DoesNotExist:
            return Response({"error": "Role not found"}, status=404)

        if role.job_position_id_id != wi.job_position_id_id:
            return Response(
                {"error": "Role does not belong to the current position"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wi.job_role_id = role
        wi.save()
        return Response({"ok": True, "role": role.job_role})


class GroupListView(APIView):
    """List all Django auth groups with permissions & member count."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.contrib.auth.models import Group

        groups = Group.objects.prefetch_related("permissions", "user_set").order_by("name")
        results = []
        for g in groups:
            members = Employee.objects.filter(
                employee_user_id__groups=g, is_active=True
            ).count()
            perms = [
                {"id": p.pk, "codename": p.codename, "name": p.name}
                for p in g.permissions.all()
            ]
            results.append({
                "id": g.pk,
                "name": g.name,
                "member_count": members,
                "permissions": perms,
            })
        return Response(results)


class GroupDetailView(APIView):
    """Group detail: permissions + member list + app visibility."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from django.contrib.auth.models import Group
        from base.models import GroupAppVisibility

        try:
            group = Group.objects.prefetch_related("permissions").get(pk=pk)
        except Group.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        members = Employee.objects.filter(
            employee_user_id__groups=group, is_active=True
        ).select_related(
            "employee_work_info",
            "employee_work_info__department_id",
            "employee_work_info__job_position_id",
        ).order_by("employee_first_name")

        member_list = []
        for emp in members:
            wi = getattr(emp, "employee_work_info", None)
            member_list.append({
                "id": emp.pk,
                "first_name": emp.employee_first_name,
                "last_name": emp.employee_last_name or "",
                "badge_id": emp.badge_id,
                "department": (
                    wi.department_id.department if wi and wi.department_id else None
                ),
                "department_id": wi.department_id_id if wi and wi.department_id else None,
                "job_position": (
                    wi.job_position_id.job_position if wi and wi.job_position_id else None
                ),
            })

        perms = [
            {"id": p.pk, "codename": p.codename, "name": p.name}
            for p in group.permissions.all()
        ]

        vis = GroupAppVisibility.objects.filter(group=group).first()
        allowed_apps = vis.allowed_apps if vis else []
        nav_tabs = vis.nav_tabs if vis else []

        return Response({
            "id": group.pk,
            "name": group.name,
            "permissions": perms,
            "members": member_list,
            "allowed_apps": allowed_apps,
            "nav_tabs": nav_tabs,
        })


class GroupAddMembersView(APIView):
    """Add employees to a group."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from django.contrib.auth.models import Group

        try:
            group = Group.objects.get(pk=pk)
        except Group.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        employee_ids = request.data.get("employee_ids", [])
        if not employee_ids:
            return Response({"error": "employee_ids required"}, status=400)

        employees = Employee.objects.filter(pk__in=employee_ids, is_active=True)
        added = 0
        for emp in employees:
            user = emp.employee_user_id
            if user and not user.groups.filter(pk=group.pk).exists():
                user.groups.add(group)
                added += 1

        return Response({"ok": True, "added": added})


class GroupRemoveMembersView(APIView):
    """Remove employees from a group."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from django.contrib.auth.models import Group

        try:
            group = Group.objects.get(pk=pk)
        except Group.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        employee_ids = request.data.get("employee_ids", [])
        if not employee_ids:
            return Response({"error": "employee_ids required"}, status=400)

        employees = Employee.objects.filter(pk__in=employee_ids, is_active=True)
        removed = 0
        for emp in employees:
            user = emp.employee_user_id
            if user and user.groups.filter(pk=group.pk).exists():
                user.groups.remove(group)
                removed += 1

        return Response({"ok": True, "removed": removed})


class GroupAvailableEmployeesView(APIView):
    """List employees NOT in this group, optionally filtered by department."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from django.contrib.auth.models import Group

        try:
            group = Group.objects.get(pk=pk)
        except Group.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        qs = Employee.objects.filter(is_active=True).exclude(
            employee_user_id__groups=group
        ).select_related(
            "employee_work_info",
            "employee_work_info__department_id",
        ).order_by("employee_first_name")

        dept = request.query_params.get("department")
        if dept:
            qs = qs.filter(employee_work_info__department_id=dept)

        results = []
        for emp in qs[:100]:
            wi = getattr(emp, "employee_work_info", None)
            results.append({
                "id": emp.pk,
                "first_name": emp.employee_first_name,
                "last_name": emp.employee_last_name or "",
                "badge_id": emp.badge_id,
                "department": (
                    wi.department_id.department if wi and wi.department_id else None
                ),
                "department_id": wi.department_id_id if wi and wi.department_id else None,
            })

        return Response(results)


# ── All available permissions (for permission picker) ──


class AllAppFeaturesView(APIView):
    """Return all active AppFeature records from DB (for Groups modal selector)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import AppFeature

        features = AppFeature.objects.filter(is_active=True).order_by("order", "slug").values(
            "slug", "label", "group", "is_base", "order"
        )
        return Response(list(features))


class AllPermissionsView(APIView):
    """List all Django permissions grouped by app label."""

    permission_classes = [IsAuthenticated]

    APP_LABELS = [
        "employee", "attendance", "leave", "payroll", "base",
        "eoffice", "recruitment", "asset", "onboarding", "offboarding",
        "pms", "helpdesk", "project", "tourism",
    ]

    APP_NAMES_VI = {
        "employee": "Nhân sự",
        "attendance": "Chấm công",
        "leave": "Nghỉ phép",
        "payroll": "Bảng lương",
        "base": "Hệ thống",
        "eoffice": "eOffice",
        "recruitment": "Tuyển dụng",
        "asset": "Tài sản",
        "onboarding": "Onboarding",
        "offboarding": "Offboarding",
        "pms": "KPI",
        "helpdesk": "Helpdesk",
        "project": "Dự án",
        "tourism": "Du lịch",
    }

    def get(self, request):
        from django.contrib.auth.models import Permission

        perms = (
            Permission.objects.filter(content_type__app_label__in=self.APP_LABELS)
            .select_related("content_type")
            .order_by("content_type__app_label", "codename")
        )
        grouped = {}
        for p in perms:
            app = p.content_type.app_label
            if app not in grouped:
                grouped[app] = {
                    "label": self.APP_NAMES_VI.get(app, app),
                    "permissions": [],
                }
            grouped[app]["permissions"].append({
                "id": p.pk,
                "codename": p.codename,
                "name": p.name,
            })
        return Response(grouped)


class GroupUpdateView(APIView):
    """Update group name, permissions, and app visibility."""

    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        from django.contrib.auth.models import Group, Permission
        from base.models import GroupAppVisibility

        try:
            group = Group.objects.get(pk=pk)
        except Group.DoesNotExist:
            return Response({"error": "Group not found"}, status=404)

        name = request.data.get("name")
        if name and name.strip():
            if (
                Group.objects.filter(name=name.strip())
                .exclude(pk=pk)
                .exists()
            ):
                return Response({"error": "Tên nhóm đã tồn tại"}, status=400)
            group.name = name.strip()
            group.save()

        perm_ids = request.data.get("permission_ids")
        if perm_ids is not None:
            group.permissions.set(
                Permission.objects.filter(pk__in=perm_ids)
            )

        allowed_apps = request.data.get("allowed_apps")
        nav_tabs = request.data.get("nav_tabs")
        if allowed_apps is not None or nav_tabs is not None:
            vis, _ = GroupAppVisibility.objects.get_or_create(group=group)
            if allowed_apps is not None:
                vis.allowed_apps = allowed_apps
            if nav_tabs is not None:
                vis.nav_tabs = nav_tabs
            vis.save()

        return Response({
            "ok": True,
            "name": group.name,
            "permissions_count": group.permissions.count(),
        })


class UnifiedCalendarView(APIView):
    """Calendar events for a given month: team leaves, project deadlines, tour schedules."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date, timedelta

        from leave.models import LeaveRequest
        from project.models import Project, Task
        from tourism.models import TourSchedule

        month_str = request.query_params.get("month")
        if month_str:
            try:
                y, m = month_str.split("-")
                year, month = int(y), int(m)
            except (ValueError, AttributeError):
                return Response({"error": "Invalid month format"}, status=400)
        else:
            today = date.today()
            year, month = today.year, today.month

        first_day = date(year, month, 1)
        if month == 12:
            last_day = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            last_day = date(year, month + 1, 1) - timedelta(days=1)

        events = []

        leave_qs = LeaveRequest.objects.filter(
            status="approved",
            start_date__lte=last_day,
            end_date__gte=first_day,
        ).select_related("employee_id", "leave_type_id").order_by("start_date")[:100]
        for lr in leave_qs:
            events.append({
                "type": "leave",
                "title": lr.employee_id.get_full_name() if lr.employee_id else "—",
                "subtitle": lr.leave_type_id.name if lr.leave_type_id else "Nghỉ phép",
                "start": lr.start_date.isoformat(),
                "end": lr.end_date.isoformat(),
                "color": "warn",
            })

        task_qs = Task.objects.filter(
            is_active=True,
            end_date__gte=first_day,
            end_date__lte=last_day,
        ).select_related("project").order_by("end_date")[:100]
        for t in task_qs:
            events.append({
                "type": "deadline",
                "title": t.title,
                "subtitle": t.project.title if t.project else "",
                "start": t.end_date.isoformat(),
                "end": t.end_date.isoformat(),
                "color": "red" if t.status in ("to_do", "in_progress") else "success",
            })

        project_qs = Project.objects.filter(
            is_active=True,
            end_date__gte=first_day,
            end_date__lte=last_day,
        ).order_by("end_date")[:50]
        for p in project_qs:
            events.append({
                "type": "project",
                "title": p.title,
                "subtitle": "Hạn dự án",
                "start": p.end_date.isoformat(),
                "end": p.end_date.isoformat(),
                "color": "navy",
            })

        tour_qs = TourSchedule.objects.filter(
            start_date__lte=last_day,
            end_date__gte=first_day,
        ).exclude(status="cancelled").select_related(
            "tour", "lead_guide__employee"
        ).order_by("start_date")[:100]
        for ts in tour_qs:
            guide_name = ""
            if ts.lead_guide and ts.lead_guide.employee:
                guide_name = ts.lead_guide.employee.get_full_name()
            events.append({
                "type": "tour",
                "title": ts.tour.name if ts.tour else ts.schedule_code,
                "subtitle": f"{ts.schedule_code} · {guide_name}".strip(" ·"),
                "start": ts.start_date.isoformat(),
                "end": ts.end_date.isoformat(),
                "color": "gold",
                "extra": {
                    "pax": ts.pax,
                    "status": ts.status,
                },
            })

        events.sort(key=lambda e: e["start"])

        return Response({
            "year": year,
            "month": month,
            "events": events,
        })


class EmployeeProfileView(APIView):
    """Comprehensive employee profile: personal, work, contracts, attendance, leave."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from datetime import date

        from attendance.models import Attendance
        from leave.models import AvailableLeave, LeaveRequest
        from payroll.models import (
            OfficialContract,
            PerformanceContract,
            TrialContract,
        )

        user = request.user
        try:
            emp = Employee.objects.select_related(
                "employee_work_info",
                "employee_work_info__department_id",
                "employee_work_info__job_position_id",
                "employee_work_info__job_role_id",
                "employee_work_info__company_id",
                "employee_work_info__shift_id",
                "employee_work_info__work_type_id",
                "employee_work_info__employee_type_id",
                "employee_work_info__reporting_manager_id",
                "work_level",
            ).get(pk=pk, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        is_self = hasattr(user, "employee_get") and user.employee_get.id == emp.id
        has_perm = user.has_perm("employee.view_employee")
        is_manager_of = False
        if hasattr(user, "employee_get"):
            is_manager_of = Employee.objects.filter(
                pk=pk,
                employee_work_info__reporting_manager_id=user.employee_get,
            ).exists()
        if not (is_self or has_perm or is_manager_of):
            return Response({"error": "Forbidden"}, status=403)

        wi = getattr(emp, "employee_work_info", None)
        wl = emp.work_level

        personal = {
            "id": emp.id,
            "badge_id": emp.badge_id,
            "stt": emp.stt,
            "attendance_code": emp.attendance_code,
            "employee_code": emp.employee_code,
            "accounting_code": emp.accounting_code,
            "master_data_code": emp.master_data_code,
            "is_active": emp.is_active,
            "first_name": emp.employee_first_name,
            "last_name": emp.employee_last_name,
            "email": emp.email,
            "phone": emp.phone,
            "gender": emp.gender,
            "dob": emp.dob.isoformat() if emp.dob else None,
            "marital_status": emp.marital_status,
            "children": emp.children,
            "address": emp.address,
            "city": emp.city,
            "state": emp.state,
            "country": emp.country,
            "zip": emp.zip,
            "qualification": emp.qualification,
            "experience": emp.experience,
            "profile": emp.employee_profile.url if emp.employee_profile else None,
            "emergency_contact_name": getattr(emp, "emergency_contact_name", None),
            "emergency_contact_relation": getattr(emp, "emergency_contact_relation", None),
            "emergency_contact": getattr(emp, "emergency_contact", None),
        }

        work = {
            "company": wi.company_id.company if wi and wi.company_id else None,
            "department": wi.department_id.department if wi and wi.department_id else None,
            "job_position": wi.job_position_id.job_position if wi and wi.job_position_id else None,
            "job_role": wi.job_role_id.job_role if wi and wi.job_role_id else None,
            "shift": wi.shift_id.employee_shift if wi and wi.shift_id else None,
            "work_type": wi.work_type_id.work_type if wi and wi.work_type_id else None,
            "employee_type": wi.employee_type_id.employee_type if wi and wi.employee_type_id else None,
            "date_joining": wi.date_joining.isoformat() if wi and wi.date_joining else None,
            "reporting_manager": wi.reporting_manager_id.get_full_name() if wi and wi.reporting_manager_id else None,
            "reporting_manager_id": wi.reporting_manager_id_id if wi and wi.reporting_manager_id_id else None,
        }

        work_level_data = None
        if wl:
            work_level_data = {
                "level_number": wl.level_number,
                "name": wl.name,
                "color": wl.color,
                "description": wl.description,
                "bhxh_salary": float(wl.bhxh_salary),
                "income_min": float(wl.income_min),
                "income_max": float(wl.income_max),
                "wfh_days_per_week": wl.wfh_days_per_week,
                "life_insurance_annual": float(wl.life_insurance_annual),
                "family_health_insurance": wl.family_health_insurance,
                "extra_leave_days": wl.extra_leave_days,
                "allowance_position": wl.allowance_position,
                "allowance_housing": wl.allowance_housing,
                "allowance_transport": wl.allowance_transport,
            }

        def _serialize_contract(c, ctype):
            data = {
                "id": c.id,
                "type": ctype,
                "name": c.contract_name,
                "start_date": c.contract_start_date.isoformat(),
                "end_date": c.contract_end_date.isoformat() if c.contract_end_date else None,
                "status": c.contract_status,
                "wage": c.wage,
            }
            if ctype == "trial":
                data["probation_days"] = c.probation_days
                data["trial_wage_pct"] = float(c.trial_wage_pct)
                data["base_salary"] = c.base_salary
            elif ctype == "performance":
                data["base_salary"] = c.base_salary
            return data

        contracts = []
        for c in TrialContract.objects.filter(employee_id=emp).order_by("-contract_start_date"):
            contracts.append(_serialize_contract(c, "trial"))
        for c in OfficialContract.objects.filter(employee_id=emp).order_by("-contract_start_date"):
            contracts.append(_serialize_contract(c, "official"))
        for c in PerformanceContract.objects.filter(employee_id=emp).order_by("-contract_start_date"):
            contracts.append(_serialize_contract(c, "performance"))
        contracts.sort(key=lambda x: x["start_date"], reverse=True)

        today = date.today()
        month_start = today.replace(day=1)
        att_this_month = Attendance.objects.filter(
            employee_id=emp,
            attendance_date__gte=month_start,
            attendance_date__lte=today,
        ).count()
        att_total = Attendance.objects.filter(employee_id=emp).count()

        leave_balances = []
        for al in AvailableLeave.objects.filter(employee_id=emp).select_related("leave_type_id"):
            leave_balances.append({
                "type": al.leave_type_id.name if al.leave_type_id else "—",
                "available": al.available_days,
                "total": al.total_leave_days,
                "carryforward": al.carryforward_days,
            })

        pending_leaves = LeaveRequest.objects.filter(
            employee_id=emp, status="requested"
        ).count()
        approved_leaves_year = LeaveRequest.objects.filter(
            employee_id=emp, status="approved",
            start_date__year=today.year,
        ).count()

        return Response({
            "personal": personal,
            "work": work,
            "work_level": work_level_data,
            "contracts": contracts,
            "attendance": {
                "this_month": att_this_month,
                "total": att_total,
            },
            "leave": {
                "balances": leave_balances,
                "pending": pending_leaves,
                "approved_this_year": approved_leaves_year,
            },
            "is_self": is_self,
            "is_manager_of": is_manager_of,
            "can_edit_work_info": (
                is_manager_of
                or user.has_perm("employee.change_employeeworkinformation")
            ),
            "work_info_id": wi.id if wi else None,
        })


class WorkInfoEditView(APIView):
    """
    GET  /api/employee/<pk>/work-info-edit/  — current work info (IDs) + dropdown options
    PUT  /api/employee/<pk>/work-info-edit/  — partial update work info
    """

    permission_classes = [IsAuthenticated]

    def _check_perm(self, request, emp):
        user = request.user
        is_manager = Employee.objects.filter(
            pk=emp.pk,
            employee_work_info__reporting_manager_id=user.employee_get
            if hasattr(user, "employee_get") else None,
        ).exists()
        return is_manager or user.has_perm("employee.change_employeeworkinformation")

    def get(self, request, pk):
        from base.models import (
            Department, EmployeeShift, EmployeeType, JobPosition,
            JobRole, WorkType,
        )

        try:
            emp = Employee.objects.select_related("employee_work_info").get(pk=pk, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        user = request.user
        is_self = hasattr(user, "employee_get") and user.employee_get.id == emp.id
        is_manager = Employee.objects.filter(
            pk=emp.pk,
            employee_work_info__reporting_manager_id=getattr(user, "employee_get", None),
        ).exists()
        has_perm = user.has_perm("employee.change_employeeworkinformation")
        if not (is_self or is_manager or has_perm):
            return Response({"error": "Forbidden"}, status=403)

        wi = getattr(emp, "employee_work_info", None)

        current = {
            "department_id": wi.department_id_id if wi else None,
            "job_position_id": wi.job_position_id_id if wi else None,
            "job_role_id": wi.job_role_id_id if wi else None,
            "shift_id": wi.shift_id_id if wi else None,
            "work_type_id": wi.work_type_id_id if wi else None,
            "employee_type_id": wi.employee_type_id_id if wi else None,
            "company_id": wi.company_id_id if wi else None,
            "reporting_manager_id": wi.reporting_manager_id_id if wi else None,
            "date_joining": wi.date_joining.isoformat() if wi and wi.date_joining else None,
            "contract_end_date": wi.contract_end_date.isoformat() if wi and wi.contract_end_date else None,
            "location": wi.location if wi else "",
            "email": wi.email if wi else "",
            "mobile": wi.mobile if wi else "",
            "basic_salary": wi.basic_salary if wi else 0,
            "salary_hour": wi.salary_hour if wi else 0,
        }

        departments = [
            {"id": d.pk, "name": d.department}
            for d in Department.objects.filter(is_active=True).order_by("department")
        ]
        positions = [
            {"id": p.pk, "name": p.job_position, "department_id": p.department_id_id}
            for p in JobPosition.objects.filter(is_active=True).order_by("job_position")
        ]
        roles = [
            {"id": r.pk, "name": r.job_role, "position_id": r.job_position_id_id}
            for r in JobRole.objects.filter(is_active=True).order_by("job_role")
        ]
        shifts = [
            {"id": s.pk, "name": s.employee_shift}
            for s in EmployeeShift.objects.filter(is_active=True).order_by("employee_shift")
        ]
        work_types = [
            {"id": t.pk, "name": t.work_type}
            for t in WorkType.objects.filter(is_active=True).order_by("work_type")
        ]
        employee_types = [
            {"id": t.pk, "name": t.employee_type}
            for t in EmployeeType.objects.filter(is_active=True).order_by("employee_type")
        ]
        from base.models import Company
        companies = [
            {"id": c.pk, "name": c.company}
            for c in Company.objects.filter(is_active=True).order_by("company")
        ]
        managers = [
            {
                "id": e.pk,
                "name": f"{e.employee_first_name} {e.employee_last_name}".strip(),
            }
            for e in Employee.objects.filter(is_active=True).order_by(
                "employee_first_name", "employee_last_name"
            )
        ]

        return Response({
            "work_info_id": wi.id if wi else None,
            "employee_name": f"{emp.employee_first_name} {emp.employee_last_name}".strip(),
            "badge_id": emp.badge_id,
            "current": current,
            "options": {
                "departments": departments,
                "positions": positions,
                "roles": roles,
                "shifts": shifts,
                "work_types": work_types,
                "employee_types": employee_types,
                "companies": companies,
                "managers": managers,
            },
        })

    def put(self, request, pk):
        try:
            emp = Employee.objects.select_related("employee_work_info").get(pk=pk, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if not self._check_perm(request, emp):
            return Response({"error": "Forbidden"}, status=403)

        wi = getattr(emp, "employee_work_info", None)
        if not wi:
            return Response({"error": "No work info record"}, status=404)

        serializer = EmployeeWorkInformationSerializer(wi, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({"ok": True})
        return Response(serializer.errors, status=400)


class DashboardView(APIView):
    """Aggregated dashboard data for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date, timedelta

        from attendance.models import Attendance
        from base.models import Department, ShiftRequest, WorkTypeRequest
        from leave.models import LeaveRequest
        from project.models import Project, Task

        today = date.today()
        user = request.user
        emp = None
        try:
            emp = user.employee_get
        except Exception:
            pass

        is_manager = False
        if emp:
            is_manager = (
                user.is_superuser
                or Employee.objects.filter(
                    employee_work_info__reporting_manager_id=emp
                ).exists()
            )

        total_employees = Employee.objects.filter(is_active=True).count()

        checked_in_today = Attendance.objects.filter(
            attendance_date=today,
            employee_id__is_active=True,
        ).values("employee_id").distinct().count()

        not_checked_in = total_employees - checked_in_today

        pending_leave = LeaveRequest.objects.filter(status="requested").count()
        pending_shift = ShiftRequest.objects.filter(
            approved=False, canceled=False
        ).count()
        pending_worktype = WorkTypeRequest.objects.filter(
            approved=False, canceled=False
        ).count()

        dept_counts = []
        depts = Department.objects.filter(is_active=True).order_by("department")
        for d in depts:
            count = Employee.objects.filter(
                is_active=True,
                employee_work_info__department_id=d,
            ).count()
            if count > 0:
                dept_counts.append({"name": d.department, "count": count})

        active_projects = Project.objects.filter(
            is_active=True,
            status__in=["new", "in_progress"],
        ).count()
        active_tasks = Task.objects.filter(
            is_active=True,
            status__in=["to_do", "in_progress"],
        ).count()
        overdue_tasks = Task.objects.filter(
            is_active=True,
            status__in=["to_do", "in_progress"],
            end_date__lt=today,
        ).count()

        week_start = today
        week_end = today + timedelta(days=7)
        upcoming_leaves = []
        leave_qs = LeaveRequest.objects.filter(
            status="approved",
            start_date__lte=week_end,
            end_date__gte=week_start,
        ).select_related("employee_id").order_by("start_date")[:10]
        for lr in leave_qs:
            upcoming_leaves.append({
                "employee": lr.employee_id.get_full_name() if lr.employee_id else "—",
                "start": lr.start_date.isoformat(),
                "end": lr.end_date.isoformat(),
                "type": lr.leave_type_id.name if lr.leave_type_id else "",
            })

        week_attendance = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            if d.weekday() < 5:
                cnt = Attendance.objects.filter(
                    attendance_date=d,
                    employee_id__is_active=True,
                ).values("employee_id").distinct().count()
                week_attendance.append({
                    "date": d.isoformat(),
                    "day": ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][d.weekday()],
                    "count": cnt,
                })

        my_tasks_active = 0
        my_projects_active = 0
        if emp:
            from django.db.models import Q as Qp
            my_tasks_active = Task.objects.filter(
                Qp(task_managers=emp) | Qp(task_members=emp),
                is_active=True,
                status__in=["to_do", "in_progress"],
            ).distinct().count()
            my_projects_active = Project.objects.filter(
                Qp(managers=emp) | Qp(members=emp),
                is_active=True,
                status__in=["new", "in_progress"],
            ).distinct().count()

        return Response({
            "today": today.isoformat(),
            "is_manager": is_manager,
            "employees": {
                "total": total_employees,
                "checked_in": checked_in_today,
                "not_checked_in": not_checked_in,
            },
            "pending": {
                "leave": pending_leave,
                "shift": pending_shift,
                "worktype": pending_worktype,
                "total": pending_leave + pending_shift + pending_worktype,
            },
            "departments": dept_counts,
            "projects": {
                "active": active_projects,
                "active_tasks": active_tasks,
                "overdue_tasks": overdue_tasks,
            },
            "my_summary": {
                "tasks_active": my_tasks_active,
                "projects_active": my_projects_active,
            },
            "upcoming_leaves": upcoming_leaves,
            "week_attendance": week_attendance,
        })


class MyAppsView(APIView):
    """Return list of allowed app slugs for the current user.

    Source of truth is base.AppFeature table — no hardcoded slug lists.
    Add/remove features via Django Admin > Base > App Features.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _all_slugs():
        from base.models import AppFeature
        return list(AppFeature.objects.filter(is_active=True).order_by("order", "slug").values_list("slug", flat=True))

    @staticmethod
    def _base_slugs():
        from base.models import AppFeature
        return set(AppFeature.objects.filter(is_active=True, is_base=True).values_list("slug", flat=True))

    def get(self, request):
        from base.models import GroupAppVisibility

        all_slugs = self._all_slugs()
        user = request.user
        if user.is_superuser:
            return Response({"allowed": all_slugs, "is_admin": True, "is_staff": True})

        groups = user.groups.all()
        if not groups.exists():
            return Response({"allowed": all_slugs, "is_admin": False, "is_staff": user.is_staff})

        vis_map = {
            vis.group_id: vis.allowed_apps
            for vis in GroupAppVisibility.objects.filter(group__in=groups)
            if vis.allowed_apps
        }

        group_ids = set(groups.values_list("id", flat=True))
        groups_without_config = group_ids - set(vis_map.keys())
        if groups_without_config:
            return Response({"allowed": all_slugs, "is_admin": False, "is_staff": user.is_staff})

        base_slugs = self._base_slugs()
        allowed = set(base_slugs)
        for apps in vis_map.values():
            allowed.update(apps)

        if not allowed:
            return Response({"allowed": all_slugs, "is_admin": False, "is_staff": user.is_staff})

        return Response({"allowed": sorted(allowed), "is_admin": False, "is_staff": user.is_staff})


class MyNavTabsView(APIView):
    """Return allowed bottom nav tab IDs for the current user's groups.

    Empty list means all tabs are visible (no restriction).
    """

    permission_classes = [IsAuthenticated]

    ALL_TABS = ["home", "attend", "apps", "ruby", "tasks", "me"]

    def get(self, request):
        from base.models import GroupAppVisibility

        user = request.user
        if user.is_superuser:
            return Response({"allowed_tabs": self.ALL_TABS})

        groups = user.groups.all()
        if not groups.exists():
            return Response({"allowed_tabs": self.ALL_TABS})

        vis_map = {
            vis.group_id: vis.nav_tabs
            for vis in GroupAppVisibility.objects.filter(group__in=groups)
        }

        group_ids = set(groups.values_list("id", flat=True))
        groups_without_config = group_ids - set(vis_map.keys())

        # Any group with no restriction → all tabs visible
        if groups_without_config:
            return Response({"allowed_tabs": self.ALL_TABS})

        # All groups have config — check if any group has empty nav_tabs (= unrestricted)
        for tabs in vis_map.values():
            if not tabs:
                return Response({"allowed_tabs": self.ALL_TABS})

        # Union of all allowed tabs across groups
        allowed: set[str] = set()
        for tabs in vis_map.values():
            allowed.update(tabs)

        if not allowed:
            return Response({"allowed_tabs": self.ALL_TABS})

        ordered = [t for t in self.ALL_TABS if t in allowed]
        return Response({"allowed_tabs": ordered})


class ReportsView(APIView):
    """Aggregated reports for PWA: attendance, leave, proposals."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date, timedelta

        from attendance.models import (
            Attendance,
            AttendanceLateComeEarlyOut,
        )
        from base.models import Department, ShiftRequest, WorkTypeRequest
        from leave.models import AvailableLeave, LeaveRequest, LeaveType

        report = request.GET.get("report", "attendance")
        month_str = request.GET.get("month", "")
        dept_id = request.GET.get("department", "")

        if month_str:
            try:
                y, m = month_str.split("-")
                year, month = int(y), int(m)
            except (ValueError, AttributeError):
                today = date.today()
                year, month = today.year, today.month
        else:
            today = date.today()
            year, month = today.year, today.month

        first_day = date(year, month, 1)
        if month == 12:
            last_day = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            last_day = date(year, month + 1, 1) - timedelta(days=1)

        departments = []
        for d in Department.objects.all().order_by("department"):
            departments.append({"id": d.id, "name": d.department})

        base_employees = Employee.objects.filter(is_active=True)
        if dept_id:
            base_employees = base_employees.filter(
                employee_work_info__department_id=int(dept_id)
            )

        result = {
            "year": year,
            "month": month,
            "departments": departments,
        }

        if report == "attendance":
            result["data"] = self._attendance_report(
                base_employees, first_day, last_day
            )
        elif report == "leave":
            result["data"] = self._leave_report(
                base_employees, first_day, last_day, year, month
            )
        elif report == "proposals":
            result["data"] = self._proposals_report(
                base_employees, first_day, last_day
            )

        return Response(result)

    def _attendance_report(self, employees, first_day, last_day):
        from datetime import timedelta

        from attendance.models import Attendance, AttendanceLateComeEarlyOut

        att_qs = Attendance.objects.filter(
            attendance_date__gte=first_day,
            attendance_date__lte=last_day,
            employee_id__in=employees,
        ).select_related("employee_id")

        late_early_qs = AttendanceLateComeEarlyOut.objects.filter(
            attendance_id__attendance_date__gte=first_day,
            attendance_id__attendance_date__lte=last_day,
            employee_id__in=employees,
        )

        emp_data = {}
        for att in att_qs:
            eid = att.employee_id_id
            if eid not in emp_data:
                emp = att.employee_id
                dept = ""
                if hasattr(emp, "employee_work_info") and emp.employee_work_info:
                    dept = str(emp.employee_work_info.department_id or "")
                emp_data[eid] = {
                    "id": eid,
                    "name": emp.get_full_name(),
                    "department": dept,
                    "present": 0,
                    "worked_seconds": 0,
                    "overtime_seconds": 0,
                    "late": 0,
                    "early_out": 0,
                }
            emp_data[eid]["present"] += 1
            emp_data[eid]["worked_seconds"] += att.at_work_second or 0
            emp_data[eid]["overtime_seconds"] += att.overtime_second or 0

        for le in late_early_qs:
            eid = le.employee_id_id
            if eid in emp_data:
                if le.type == "late_come":
                    emp_data[eid]["late"] += 1
                elif le.type == "early_out":
                    emp_data[eid]["early_out"] += 1

        workdays = 0
        d = first_day
        while d <= last_day:
            if d.weekday() < 6:
                workdays += 1
            d += timedelta(days=1)

        rows = []
        for ed in emp_data.values():
            hrs = ed["worked_seconds"] // 3600
            mins = (ed["worked_seconds"] % 3600) // 60
            ot_hrs = ed["overtime_seconds"] // 3600
            ot_mins = (ed["overtime_seconds"] % 3600) // 60
            absent = max(0, workdays - ed["present"])
            rows.append({
                "id": ed["id"],
                "name": ed["name"],
                "department": ed["department"],
                "present": ed["present"],
                "absent": absent,
                "late": ed["late"],
                "early_out": ed["early_out"],
                "worked_hours": f"{hrs:02d}:{mins:02d}",
                "overtime": f"{ot_hrs:02d}:{ot_mins:02d}",
                "rate": round(ed["present"] / workdays * 100) if workdays else 0,
            })

        rows.sort(key=lambda r: r["name"])

        total_present = sum(r["present"] for r in rows)
        total_absent = sum(r["absent"] for r in rows)
        total_late = sum(r["late"] for r in rows)
        total_early = sum(r["early_out"] for r in rows)
        emp_count = employees.count()

        return {
            "summary": {
                "workdays": workdays,
                "employees": emp_count,
                "avg_rate": round(total_present / (emp_count * workdays) * 100) if emp_count and workdays else 0,
                "total_late": total_late,
                "total_early": total_early,
                "total_absent": total_absent,
            },
            "rows": rows,
        }

    def _leave_report(self, employees, first_day, last_day, year, month):
        from leave.models import AvailableLeave, LeaveRequest, LeaveType

        lr_qs = LeaveRequest.objects.filter(
            employee_id__in=employees,
            start_date__lte=last_day,
            end_date__gte=first_day,
        ).select_related("employee_id", "leave_type_id")

        total_req = lr_qs.count()
        approved = lr_qs.filter(status="approved").count()
        pending = lr_qs.filter(status="requested").count()
        rejected = lr_qs.filter(status="rejected").count()

        by_type = {}
        for lr in lr_qs:
            lt_name = lr.leave_type_id.name if lr.leave_type_id else "Khác"
            lt_id = lr.leave_type_id.id if lr.leave_type_id else 0
            if lt_id not in by_type:
                by_type[lt_id] = {
                    "type_name": lt_name,
                    "total": 0,
                    "approved": 0,
                    "pending": 0,
                    "rejected": 0,
                    "days_used": 0.0,
                }
            by_type[lt_id]["total"] += 1
            if lr.status == "approved":
                by_type[lt_id]["approved"] += 1
                by_type[lt_id]["days_used"] += lr.requested_days or 0
            elif lr.status == "requested":
                by_type[lt_id]["pending"] += 1
            elif lr.status == "rejected":
                by_type[lt_id]["rejected"] += 1

        by_employee = {}
        for lr in lr_qs.filter(status="approved"):
            eid = lr.employee_id_id
            if eid not in by_employee:
                emp = lr.employee_id
                dept = ""
                if hasattr(emp, "employee_work_info") and emp.employee_work_info:
                    dept = str(emp.employee_work_info.department_id or "")
                by_employee[eid] = {
                    "id": eid,
                    "name": emp.get_full_name(),
                    "department": dept,
                    "days_taken": 0.0,
                    "requests": 0,
                }
            by_employee[eid]["days_taken"] += lr.requested_days or 0
            by_employee[eid]["requests"] += 1

        emp_rows = sorted(by_employee.values(), key=lambda r: -r["days_taken"])

        return {
            "summary": {
                "total_requests": total_req,
                "approved": approved,
                "pending": pending,
                "rejected": rejected,
            },
            "by_type": sorted(by_type.values(), key=lambda r: -r["total"]),
            "by_employee": emp_rows[:50],
        }

    def _proposals_report(self, employees, first_day, last_day):
        from asset.models import AssetRequest
        from base.models import ShiftRequest, WorkTypeRequest

        shift_qs = ShiftRequest.objects.filter(
            employee_id__in=employees,
            requested_date__gte=first_day,
            requested_date__lte=last_day,
        )
        shift_total = shift_qs.count()
        shift_approved = shift_qs.filter(approved=True).count()
        shift_canceled = shift_qs.filter(canceled=True).count()
        shift_pending = shift_total - shift_approved - shift_canceled

        wt_qs = WorkTypeRequest.objects.filter(
            employee_id__in=employees,
            requested_date__gte=first_day,
            requested_date__lte=last_day,
        )
        wt_total = wt_qs.count()
        wt_approved = wt_qs.filter(approved=True).count()
        wt_canceled = wt_qs.filter(canceled=True).count()
        wt_pending = wt_total - wt_approved - wt_canceled

        asset_qs = AssetRequest.objects.filter(
            requested_employee_id__in=employees,
            asset_request_date__gte=first_day,
            asset_request_date__lte=last_day,
        )
        asset_total = asset_qs.count()
        asset_approved = asset_qs.filter(asset_request_status="Approved").count()
        asset_rejected = asset_qs.filter(asset_request_status="Rejected").count()
        asset_pending = asset_qs.filter(asset_request_status="Requested").count()

        from leave.models import LeaveRequest

        leave_qs = LeaveRequest.objects.filter(
            employee_id__in=employees,
            start_date__lte=last_day,
            end_date__gte=first_day,
        )
        leave_total = leave_qs.count()
        leave_approved = leave_qs.filter(status="approved").count()
        leave_rejected = leave_qs.filter(status="rejected").count()
        leave_pending = leave_qs.filter(status="requested").count()

        categories = [
            {
                "name": "Nghỉ phép",
                "icon": "cal",
                "total": leave_total,
                "approved": leave_approved,
                "pending": leave_pending,
                "rejected": leave_rejected,
            },
            {
                "name": "Đổi ca",
                "icon": "clock",
                "total": shift_total,
                "approved": shift_approved,
                "pending": shift_pending,
                "rejected": shift_canceled,
            },
            {
                "name": "Đổi loại công",
                "icon": "gear",
                "total": wt_total,
                "approved": wt_approved,
                "pending": wt_pending,
                "rejected": wt_canceled,
            },
            {
                "name": "Tài sản",
                "icon": "doc",
                "total": asset_total,
                "approved": asset_approved,
                "pending": asset_pending,
                "rejected": asset_rejected,
            },
        ]

        grand_total = sum(c["total"] for c in categories)
        grand_approved = sum(c["approved"] for c in categories)
        grand_pending = sum(c["pending"] for c in categories)
        grand_rejected = sum(c["rejected"] for c in categories)

        return {
            "summary": {
                "total": grand_total,
                "approved": grand_approved,
                "pending": grand_pending,
                "rejected": grand_rejected,
            },
            "categories": categories,
        }


class DocumentsPWAView(APIView):
    """PWA dashboard for employee document requests & submissions."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        emp = getattr(user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee profile"}, status=400)

        view = request.GET.get("view", "my")
        search = request.GET.get("search", "").strip().lower()

        is_manager = Employee.objects.filter(
            employee_work_info__reporting_manager_id=emp,
            is_active=True,
        ).exists() or user.has_perm("horilla_documents.view_documentrequest")

        if view == "manage" and is_manager:
            return self._manage_view(request, emp, user, search)
        return self._my_view(emp, search)

    def _my_view(self, emp, search):
        docs = Document.objects.filter(
            employee_id=emp,
        ).select_related("document_request_id").order_by("-created_at")

        if search:
            docs = docs.filter(
                Q(title__icontains=search)
                | Q(document_request_id__title__icontains=search)
            )

        total = docs.count()
        uploaded = docs.exclude(document="").count()
        approved = docs.filter(status="approved").count()
        rejected = docs.filter(status="rejected").count()
        pending = total - approved - rejected

        rows = []
        for d in docs:
            dr = d.document_request_id
            rows.append({
                "id": d.id,
                "title": d.title,
                "request_title": dr.title if dr else None,
                "format": dr.format if dr else "any",
                "max_size_mb": dr.max_size if dr else None,
                "description": dr.description if dr else None,
                "status": d.status,
                "has_file": bool(d.document),
                "file_url": d.document.url if d.document else None,
                "file_name": d.document.name.split("/")[-1] if d.document else None,
                "issue_date": d.issue_date.isoformat() if d.issue_date else None,
                "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
                "reject_reason": d.reject_reason,
                "created_at": d.created_at.isoformat() if hasattr(d, "created_at") and d.created_at else None,
            })

        return Response({
            "view": "my",
            "is_manager": False,
            "summary": {
                "total": total,
                "uploaded": uploaded,
                "approved": approved,
                "pending": pending,
                "rejected": rejected,
            },
            "rows": rows,
        })

    def _manage_view(self, request, emp, user, search):
        from base.models import Department

        dept_id = request.GET.get("department", "")
        status_filter = request.GET.get("status", "")

        doc_requests = DocumentRequest.objects.all().prefetch_related("employee_id")

        if search:
            doc_requests = doc_requests.filter(title__icontains=search)

        departments = list(
            Department.objects.values_list("id", "department").order_by("department")
        )

        results = []
        total_docs = 0
        total_uploaded = 0
        total_approved = 0
        total_pending = 0
        total_rejected = 0

        for dr in doc_requests:
            docs = Document.objects.filter(
                document_request_id=dr,
            ).select_related("employee_id", "employee_id__employee_work_info", "employee_id__employee_work_info__department_id")

            if dept_id:
                docs = docs.filter(
                    employee_id__employee_work_info__department_id=int(dept_id)
                )

            if status_filter:
                if status_filter == "uploaded":
                    docs = docs.exclude(document="")
                elif status_filter == "missing":
                    docs = docs.filter(document="")
                elif status_filter in ("approved", "rejected", "requested"):
                    docs = docs.filter(status=status_filter)

            doc_count = docs.count()
            if doc_count == 0:
                continue

            uploaded = docs.exclude(document="").count()
            approved = docs.filter(status="approved").count()
            rejected = docs.filter(status="rejected").count()
            pending_ct = doc_count - approved - rejected

            total_docs += doc_count
            total_uploaded += uploaded
            total_approved += approved
            total_pending += pending_ct
            total_rejected += rejected

            employees = []
            for d in docs:
                e = d.employee_id
                dept = None
                if hasattr(e, "employee_work_info") and e.employee_work_info and e.employee_work_info.department_id:
                    dept = e.employee_work_info.department_id.department
                employees.append({
                    "doc_id": d.id,
                    "emp_id": e.id,
                    "name": e.get_full_name(),
                    "badge_id": e.badge_id,
                    "department": dept,
                    "status": d.status,
                    "has_file": bool(d.document),
                    "file_name": d.document.name.split("/")[-1] if d.document else None,
                })

            results.append({
                "id": dr.id,
                "title": dr.title,
                "format": dr.format,
                "max_size_mb": dr.max_size,
                "description": dr.description,
                "total": doc_count,
                "uploaded": uploaded,
                "approved": approved,
                "pending": pending_ct,
                "rejected": rejected,
                "employees": employees,
            })

        return Response({
            "view": "manage",
            "is_manager": True,
            "summary": {
                "total": total_docs,
                "uploaded": total_uploaded,
                "approved": total_approved,
                "pending": total_pending,
                "rejected": total_rejected,
                "requests": len(results),
            },
            "departments": [{"id": d[0], "name": d[1]} for d in departments],
            "rows": results,
        })

    def post(self, request):
        """Upload document file for a Document entry."""
        doc_id = request.data.get("doc_id")
        file = request.FILES.get("file")
        if not doc_id or not file:
            return Response({"error": "doc_id and file required"}, status=400)

        try:
            doc = Document.objects.get(pk=doc_id)
        except Document.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        emp = getattr(request.user, "employee_get", None)
        if not emp or doc.employee_id_id != emp.id:
            return Response({"error": "Forbidden"}, status=403)

        dr = doc.document_request_id
        if dr:
            if dr.max_size and file.size > dr.max_size * 1024 * 1024:
                return Response({"error": f"File quá lớn (tối đa {dr.max_size}MB)"}, status=400)
            if dr.format and dr.format != "any":
                ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
                if ext != dr.format:
                    return Response({"error": f"Chỉ chấp nhận file {dr.format.upper()}"}, status=400)

        doc.document = file
        doc.status = "requested"
        doc.save()

        return Response({
            "ok": True,
            "id": doc.id,
            "status": doc.status,
            "file_name": doc.document.name.split("/")[-1],
        })


class OnboardingOffboardingPWAView(APIView):
    """Combined onboarding / offboarding / resignation dashboard for PWA."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        tab = request.GET.get("tab", "onboarding")
        user = request.user
        emp = getattr(user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee profile"}, status=400)

        is_manager = (
            user.is_superuser
            or user.has_perm("onboarding.view_candidatestage")
            or user.has_perm("offboarding.view_offboardingemployee")
            or Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp, is_active=True,
            ).exists()
        )

        if tab == "offboarding":
            return self._offboarding(request, emp, is_manager)
        elif tab == "resignation":
            return self._resignation(request, emp, is_manager)
        return self._onboarding(request, emp, is_manager)

    def _onboarding(self, request, emp, is_manager):
        from onboarding.models import CandidateStage, CandidateTask, OnboardingStage
        from recruitment.models import Candidate, Recruitment

        search = request.GET.get("search", "").strip().lower()
        recruitment_id = request.GET.get("recruitment", "")

        recruitments = list(
            Recruitment.objects.values_list("id", "title").order_by("-created_at")[:20]
        )

        stages_qs = OnboardingStage.objects.all().order_by("sequence")
        if recruitment_id:
            stages_qs = stages_qs.filter(recruitment_id=int(recruitment_id))

        cs_qs = CandidateStage.objects.select_related(
            "candidate_id", "onboarding_stage_id",
            "onboarding_stage_id__recruitment_id",
        )
        if recruitment_id:
            cs_qs = cs_qs.filter(
                onboarding_stage_id__recruitment_id=int(recruitment_id)
            )
        if search:
            cs_qs = cs_qs.filter(candidate_id__name__icontains=search)

        total = cs_qs.count()
        completed = cs_qs.filter(onboarding_stage_id__is_final_stage=True).count()
        in_progress = total - completed

        stages = []
        seen_stage_ids = set()
        for cs in cs_qs.order_by("onboarding_stage_id__sequence"):
            s = cs.onboarding_stage_id
            if s.id not in seen_stage_ids:
                seen_stage_ids.add(s.id)

            c = cs.candidate_id
            tasks = CandidateTask.objects.filter(
                candidate_id=c,
                stage_id=s,
            )
            tasks_total = tasks.count()
            tasks_done = tasks.filter(status="done").count()

            found = False
            for stage_data in stages:
                if stage_data["id"] == s.id:
                    stage_data["candidates"].append({
                        "id": c.id,
                        "name": c.name or "—",
                        "recruitment": s.recruitment_id.title if s.recruitment_id else None,
                        "tasks_done": tasks_done,
                        "tasks_total": tasks_total,
                        "end_date": cs.onboarding_end_date.isoformat() if cs.onboarding_end_date else None,
                    })
                    found = True
                    break
            if not found:
                stages.append({
                    "id": s.id,
                    "title": s.stage_title,
                    "is_final": s.is_final_stage,
                    "sequence": s.sequence or 0,
                    "candidates": [{
                        "id": c.id,
                        "name": c.name or "—",
                        "recruitment": s.recruitment_id.title if s.recruitment_id else None,
                        "tasks_done": tasks_done,
                        "tasks_total": tasks_total,
                        "end_date": cs.onboarding_end_date.isoformat() if cs.onboarding_end_date else None,
                    }],
                })

        stages.sort(key=lambda x: x["sequence"])

        return Response({
            "tab": "onboarding",
            "is_manager": is_manager,
            "summary": {
                "total": total,
                "in_progress": in_progress,
                "completed": completed,
            },
            "recruitments": [{"id": r[0], "name": r[1]} for r in recruitments],
            "stages": stages,
        })

    def _offboarding(self, request, emp, is_manager):
        from offboarding.models import (
            EmployeeTask,
            Offboarding,
            OffboardingEmployee,
            OffboardingStage,
        )

        search = request.GET.get("search", "").strip().lower()
        offboarding_id = request.GET.get("offboarding", "")

        offboardings = list(
            Offboarding.objects.values_list("id", "title", "status").order_by("-created_at")[:20]
        )

        oe_qs = OffboardingEmployee.objects.select_related(
            "employee_id",
            "employee_id__employee_work_info",
            "employee_id__employee_work_info__department_id",
            "stage_id",
            "stage_id__offboarding_id",
        )
        if offboarding_id:
            oe_qs = oe_qs.filter(stage_id__offboarding_id=int(offboarding_id))
        if search:
            oe_qs = oe_qs.filter(
                Q(employee_id__employee_first_name__icontains=search)
                | Q(employee_id__employee_last_name__icontains=search)
            )

        total = oe_qs.count()
        from datetime import date
        today = date.today()
        notice_active = oe_qs.filter(
            notice_period_ends__gte=today,
        ).count()
        notice_expired = oe_qs.filter(
            notice_period_ends__lt=today,
        ).count()

        stages = []
        for oe in oe_qs.order_by("stage_id__sequence"):
            s = oe.stage_id
            e = oe.employee_id
            wi = getattr(e, "employee_work_info", None)
            dept = wi.department_id.department if wi and wi.department_id else None

            tasks = EmployeeTask.objects.filter(employee_id=oe)
            tasks_total = tasks.count()
            tasks_done = tasks.filter(status="completed").count()

            notice_days_left = None
            if oe.notice_period_ends:
                delta = (oe.notice_period_ends - today).days
                notice_days_left = max(0, delta)

            entry = {
                "id": oe.id,
                "emp_id": e.id,
                "name": e.get_full_name(),
                "badge_id": e.badge_id,
                "department": dept,
                "offboarding": s.offboarding_id.title if s and s.offboarding_id else None,
                "notice_start": oe.notice_period_starts.isoformat() if oe.notice_period_starts else None,
                "notice_end": oe.notice_period_ends.isoformat() if oe.notice_period_ends else None,
                "notice_days_left": notice_days_left,
                "tasks_done": tasks_done,
                "tasks_total": tasks_total,
            }

            found = False
            for stage_data in stages:
                if stage_data["id"] == s.id:
                    stage_data["employees"].append(entry)
                    found = True
                    break
            if not found:
                stages.append({
                    "id": s.id,
                    "title": s.title,
                    "type": s.type,
                    "sequence": s.sequence,
                    "employees": [entry],
                })

        stages.sort(key=lambda x: x["sequence"])

        return Response({
            "tab": "offboarding",
            "is_manager": is_manager,
            "summary": {
                "total": total,
                "notice_active": notice_active,
                "notice_expired": notice_expired,
            },
            "offboardings": [{"id": o[0], "name": o[1], "status": o[2]} for o in offboardings],
            "stages": stages,
        })

    def _resignation(self, request, emp, is_manager):
        from offboarding.models import ResignationLetter

        view = request.GET.get("view", "my")
        search = request.GET.get("search", "").strip().lower()

        my_letters = ResignationLetter.objects.filter(
            employee_id=emp,
        ).order_by("-created_at")

        my_rows = []
        for rl in my_letters:
            my_rows.append({
                "id": rl.id,
                "title": rl.title or "Đơn nghỉ việc",
                "description": rl.description,
                "planned_leave": rl.planned_to_leave_on.isoformat() if rl.planned_to_leave_on else None,
                "status": rl.status,
                "created_at": rl.created_at.isoformat() if hasattr(rl, "created_at") and rl.created_at else None,
            })

        manage_rows = []
        manage_summary = {}
        if is_manager and view == "manage":
            all_rl = ResignationLetter.objects.select_related(
                "employee_id",
                "employee_id__employee_work_info",
                "employee_id__employee_work_info__department_id",
            ).order_by("-created_at")

            if search:
                all_rl = all_rl.filter(
                    Q(employee_id__employee_first_name__icontains=search)
                    | Q(employee_id__employee_last_name__icontains=search)
                    | Q(title__icontains=search)
                )

            total = all_rl.count()
            requested = all_rl.filter(status="requested").count()
            approved = all_rl.filter(status="approved").count()
            rejected = all_rl.filter(status="rejected").count()
            manage_summary = {
                "total": total,
                "requested": requested,
                "approved": approved,
                "rejected": rejected,
            }

            for rl in all_rl[:50]:
                e = rl.employee_id
                wi = getattr(e, "employee_work_info", None)
                dept = wi.department_id.department if wi and wi.department_id else None
                manage_rows.append({
                    "id": rl.id,
                    "emp_id": e.id,
                    "name": e.get_full_name(),
                    "badge_id": e.badge_id,
                    "department": dept,
                    "title": rl.title or "Đơn nghỉ việc",
                    "description": rl.description,
                    "planned_leave": rl.planned_to_leave_on.isoformat() if rl.planned_to_leave_on else None,
                    "status": rl.status,
                    "created_at": rl.created_at.isoformat() if hasattr(rl, "created_at") and rl.created_at else None,
                })

        return Response({
            "tab": "resignation",
            "is_manager": is_manager,
            "my_letters": my_rows,
            "manage_letters": manage_rows,
            "manage_summary": manage_summary,
            "view": view,
        })

    def post(self, request):
        """Submit a resignation letter."""
        from offboarding.models import ResignationLetter

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee profile"}, status=400)

        title = request.data.get("title", "").strip()
        description = request.data.get("description", "").strip()
        planned_leave = request.data.get("planned_leave", "")

        if not title or not planned_leave:
            return Response({"error": "title and planned_leave required"}, status=400)

        from datetime import date as dt_date
        try:
            leave_date = dt_date.fromisoformat(planned_leave)
        except (ValueError, TypeError):
            return Response({"error": "Invalid date format"}, status=400)

        rl = ResignationLetter.objects.create(
            employee_id=emp,
            title=title,
            description=description or None,
            planned_to_leave_on=leave_date,
        )

        try:
            from notifications.signals import notify as _notify
            manager = emp.get_reporting_manager()
            if manager:
                _notify.send(
                    emp,
                    recipient=manager.employee_user_id,
                    verb=f"{emp.get_full_name()} đã gửi đơn nghỉ việc",
                    redirect="/offboarding/resignation-request-view",
                    icon="information",
                )
        except Exception:
            pass

        return Response({
            "ok": True,
            "id": rl.id,
            "status": rl.status,
        }, status=201)


class EmployeeJourneyPWAView(APIView):
    """Employee Journey Map — lifecycle phases derived from existing data."""

    permission_classes = [IsAuthenticated]

    PHASES = [
        {"id": "rec", "title": "Tuyển dụng", "icon": "search", "color": "#0284c7"},
        {"id": "onb", "title": "Onboarding", "icon": "star", "color": "#7c3aed"},
        {"id": "prob", "title": "Thử việc", "icon": "clock", "color": "#d97706"},
        {"id": "active", "title": "Đang làm việc", "icon": "briefcase", "color": "#059669"},
        {"id": "perf", "title": "Performance", "icon": "trending-up", "color": "#db2777"},
        {"id": "growth", "title": "Thăng tiến", "icon": "award", "color": "#7c3aed"},
        {"id": "off", "title": "Offboarding", "icon": "log-out", "color": "#dc2626"},
        {"id": "alumni", "title": "Alumni", "icon": "users", "color": "#6b7280"},
    ]

    def get(self, request):
        from datetime import date, timedelta
        from django.db.models import Q, Count

        today = date.today()
        emp = getattr(request.user, "employee_get", None)
        is_manager = False
        if emp:
            is_manager = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp
            ).exists()

        has_perm = request.user.has_perm
        can_view = (
            has_perm("employee.view_employee")
            or has_perm("onboarding.view_candidatestage")
            or is_manager
        )

        phase_data = {}
        for p in self.PHASES:
            phase_data[p["id"]] = {"employees": [], "count": 0}

        if can_view:
            self._populate_recruitment(phase_data)
            self._populate_onboarding(phase_data)

            active_employees = Employee.objects.filter(
                is_active=True
            ).select_related(
                "employee_work_info",
                "employee_work_info__department_id",
                "employee_work_info__job_position_id",
                "employee_work_info__company_id",
            )

            offboarding_emp_ids = set()
            probation_emp_ids = set()
            perf_emp_ids = set()
            onb_emp_ids = set(
                e["id"] for e in phase_data["onb"]["employees"]
            )

            self._populate_offboarding(phase_data, active_employees, offboarding_emp_ids)
            self._populate_probation(phase_data, active_employees, probation_emp_ids, today)
            self._populate_performance(phase_data, active_employees, perf_emp_ids)

            assigned = offboarding_emp_ids | probation_emp_ids | perf_emp_ids | onb_emp_ids
            for e in active_employees:
                if e.id in assigned:
                    continue
                phase_data["active"]["employees"].append(self._emp_row(e))

            self._populate_alumni(phase_data)

            for pid in phase_data:
                phase_data[pid]["count"] = len(phase_data[pid]["employees"])

        my_phase = None
        if emp:
            for p in self.PHASES:
                for e_row in phase_data.get(p["id"], {}).get("employees", []):
                    if e_row.get("id") == emp.id:
                        my_phase = p["id"]
                        break
                if my_phase:
                    break
            if not my_phase:
                my_phase = "active"

        phases_out = []
        for p in self.PHASES:
            pd = phase_data.get(p["id"], {})
            phases_out.append({
                **p,
                "count": pd.get("count", 0),
                "employees": pd.get("employees", []),
            })

        total = sum(p["count"] for p in phases_out)

        return Response({
            "phases": phases_out,
            "my_phase": my_phase,
            "total_employees": total,
            "can_view": can_view,
        })

    def _emp_row(self, e):
        wi = getattr(e, "employee_work_info", None)
        dept = getattr(getattr(wi, "department_id", None), "department", None) if wi else None
        pos = getattr(getattr(wi, "job_position_id", None), "job_position", None) if wi else None
        company = getattr(getattr(wi, "company_id", None), "company", None) if wi else None
        joining = wi.date_joining.isoformat() if wi and wi.date_joining else None
        return {
            "id": e.id,
            "name": e.get_full_name() if hasattr(e, "get_full_name") else f"{e.employee_first_name} {e.employee_last_name or ''}".strip(),
            "badge_id": e.badge_id,
            "department": dept,
            "position": pos,
            "company": company,
            "avatar": e.employee_profile.url if e.employee_profile else None,
            "joining_date": joining,
        }

    def _populate_recruitment(self, phase_data):
        try:
            from recruitment.models import Candidate
            candidates = Candidate.objects.filter(
                is_active=True, canceled=False, hired=False
            ).select_related("recruitment_id", "stage_id")[:50]
            for c in candidates:
                phase_data["rec"]["employees"].append({
                    "id": f"cand-{c.id}",
                    "name": c.name,
                    "badge_id": None,
                    "department": None,
                    "position": getattr(c.recruitment_id, "job_position_id", None) and str(c.recruitment_id.job_position_id) if c.recruitment_id else None,
                    "company": None,
                    "avatar": c.profile.url if c.profile else None,
                    "joining_date": None,
                    "stage": str(c.stage_id) if c.stage_id else None,
                    "is_candidate": True,
                })
        except Exception:
            pass

    def _populate_onboarding(self, phase_data):
        try:
            from onboarding.models import CandidateStage, CandidateTask
            cs_qs = CandidateStage.objects.select_related(
                "candidate_id", "onboarding_stage_id"
            ).exclude(
                candidate_id__hired=True
            ).order_by("-id")[:50]
            for cs in cs_qs:
                c = cs.candidate_id
                if not c:
                    continue
                tasks = CandidateTask.objects.filter(candidate_stage_id=cs)
                total_t = tasks.count()
                done_t = tasks.filter(status="done").count()
                phase_data["onb"]["employees"].append({
                    "id": f"onb-{cs.id}",
                    "name": c.name if hasattr(c, "name") else str(c),
                    "badge_id": None,
                    "department": None,
                    "position": None,
                    "company": None,
                    "avatar": c.profile.url if hasattr(c, "profile") and c.profile else None,
                    "joining_date": None,
                    "stage": str(cs.onboarding_stage_id) if cs.onboarding_stage_id else None,
                    "progress": f"{done_t}/{total_t}" if total_t else None,
                    "is_candidate": True,
                })
        except Exception:
            pass

    def _populate_offboarding(self, phase_data, employees, id_set):
        try:
            from offboarding.models import OffboardingEmployee, ResignationLetter
            off_emps = OffboardingEmployee.objects.filter(
                employee_id__is_active=True
            ).exclude(
                stage_id__stage_type="archived"
            ).select_related("employee_id", "stage_id")
            for oe in off_emps:
                e = oe.employee_id
                if not e:
                    continue
                row = self._emp_row(e)
                row["stage"] = str(oe.stage_id) if oe.stage_id else None
                row["off_type"] = "offboarding"
                phase_data["off"]["employees"].append(row)
                id_set.add(e.id)

            resign_emps = ResignationLetter.objects.filter(
                employee_id__is_active=True,
                status="requested",
            ).select_related("employee_id")
            for rl in resign_emps:
                e = rl.employee_id
                if not e or e.id in id_set:
                    continue
                row = self._emp_row(e)
                row["stage"] = "Đơn nghỉ việc"
                row["off_type"] = "resignation"
                phase_data["off"]["employees"].append(row)
                id_set.add(e.id)
        except Exception:
            pass

    def _populate_probation(self, phase_data, employees, id_set, today):
        """Nhân viên thử việc = vào làm trong vòng 60 ngày gần đây."""
        from datetime import timedelta
        cutoff = today - timedelta(days=60)
        for e in employees:
            wi = getattr(e, "employee_work_info", None)
            if not wi or not wi.date_joining:
                continue
            if wi.date_joining >= cutoff:
                row = self._emp_row(e)
                days_elapsed = (today - wi.date_joining).days
                row["probation_days"] = 60
                row["days_elapsed"] = days_elapsed
                row["probation_pct"] = min(100, round(days_elapsed / 60 * 100))
                phase_data["prob"]["employees"].append(row)
                id_set.add(e.id)

    def _populate_performance(self, phase_data, employees, id_set):
        try:
            from pms.models import EmployeeObjective
            emp_ids_with_obj = set(
                EmployeeObjective.objects.filter(
                    status="on_track",
                    employee_id__is_active=True,
                ).values_list("employee_id_id", flat=True)
            )
            for e in employees:
                if e.id in emp_ids_with_obj:
                    row = self._emp_row(e)
                    row["has_objectives"] = True
                    phase_data["perf"]["employees"].append(row)
                    id_set.add(e.id)
        except Exception:
            pass

    def _populate_alumni(self, phase_data):
        """Nhân viên đã nghỉ việc (is_active=False) = Alumni."""
        alumni = Employee.objects.filter(
            is_active=False
        ).select_related(
            "employee_work_info",
            "employee_work_info__department_id",
            "employee_work_info__job_position_id",
            "employee_work_info__company_id",
        ).order_by("-id")[:200]
        for e in alumni:
            row = self._emp_row(e)
            wi = getattr(e, "employee_work_info", None)
            row["contract_end"] = wi.contract_end_date.isoformat() if wi and wi.contract_end_date else None
            row["is_alumni"] = True
            phase_data["alumni"]["employees"].append(row)


class PMSPWAView(APIView):
    """Performance Management System — objectives, key results, feedback for PWA."""

    permission_classes = [IsAuthenticated]

    STATUS_COLORS = {
        "Not Started": "#6b7280",
        "On Track": "#059669",
        "Behind": "#d97706",
        "At Risk": "#dc2626",
        "Closed": "#6366f1",
    }

    def get(self, request):
        from datetime import date
        from pms.models import (
            EmployeeObjective, EmployeeKeyResult, Feedback, Comment, Period,
        )

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee linked"}, status=400)

        tab = request.query_params.get("tab", "objectives")
        is_manager = Employee.objects.filter(
            employee_work_info__reporting_manager_id=emp
        ).exists()
        has_perm = request.user.has_perm

        today = date.today()

        if tab == "objectives":
            return self._tab_objectives(emp, is_manager, has_perm, today)
        elif tab == "key_results":
            return self._tab_key_results(emp, today)
        elif tab == "feedback":
            return self._tab_feedback(emp, is_manager, has_perm, today)
        elif tab == "overview":
            return self._tab_overview(emp, is_manager, has_perm, today)
        else:
            return Response({"error": "Invalid tab"}, status=400)

    def post(self, request):
        from pms.models import EmployeeKeyResult, EmployeeObjective, Comment

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee linked"}, status=400)

        action = request.data.get("action")

        if action == "update_kr_value":
            kr_id = request.data.get("kr_id")
            new_value = request.data.get("current_value")
            try:
                kr = EmployeeKeyResult.objects.get(id=kr_id)
                obj = kr.employee_objective_id
                can_edit = (
                    request.user.has_perm("pms.change_employeekeyresult")
                    or (obj and obj.employee_id == emp)
                    or (obj and obj.objective_id and emp in obj.objective_id.managers.all())
                )
                if not can_edit:
                    return Response({"error": "Permission denied"}, status=403)
                kr.current_value = int(new_value)
                kr.update_kr_progress()
                kr.save()
                if obj:
                    obj.update_objective_progress()
                return Response({
                    "ok": True,
                    "progress": kr.progress_percentage,
                    "obj_progress": obj.progress_percentage if obj else 0,
                })
            except EmployeeKeyResult.DoesNotExist:
                return Response({"error": "Key result not found"}, status=404)

        elif action == "update_obj_status":
            obj_id = request.data.get("obj_id")
            new_status = request.data.get("status")
            valid = ["Not Started", "On Track", "Behind", "At Risk", "Closed"]
            if new_status not in valid:
                return Response({"error": "Invalid status"}, status=400)
            try:
                obj = EmployeeObjective.objects.get(id=obj_id)
                can_edit = (
                    request.user.has_perm("pms.change_employeeobjective")
                    or obj.employee_id == emp
                    or (obj.objective_id and emp in obj.objective_id.managers.all())
                )
                if not can_edit:
                    return Response({"error": "Permission denied"}, status=403)
                obj.status = new_status
                obj.save()
                return Response({"ok": True})
            except EmployeeObjective.DoesNotExist:
                return Response({"error": "Objective not found"}, status=404)

        elif action == "add_comment":
            obj_id = request.data.get("obj_id")
            text = request.data.get("comment", "").strip()
            if not text:
                return Response({"error": "Empty comment"}, status=400)
            try:
                obj = EmployeeObjective.objects.get(id=obj_id)
                c = Comment.objects.create(
                    comment=text,
                    employee_id=emp,
                    employee_objective_id=obj,
                )
                return Response({
                    "ok": True,
                    "comment": {
                        "id": c.id,
                        "text": c.comment,
                        "author": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                        "created_at": c.created_at.isoformat() if c.created_at else None,
                    },
                })
            except EmployeeObjective.DoesNotExist:
                return Response({"error": "Objective not found"}, status=404)

        return Response({"error": "Invalid action"}, status=400)

    def _tab_objectives(self, emp, is_manager, has_perm, today):
        from pms.models import EmployeeObjective, EmployeeKeyResult, Comment
        from django.db.models import Q

        view_all = has_perm("pms.view_employeeobjective") or is_manager
        if view_all:
            qs = EmployeeObjective.objects.filter(archive=False)
        else:
            qs = EmployeeObjective.objects.filter(employee_id=emp, archive=False)

        scope = self.request.query_params.get("scope", "my")
        if scope == "my":
            qs = qs.filter(employee_id=emp)
        elif scope == "team" and is_manager:
            team_ids = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp
            ).values_list("id", flat=True)
            qs = qs.filter(employee_id__in=team_ids)

        qs = qs.select_related(
            "employee_id", "objective_id",
            "employee_id__employee_work_info__department_id",
        ).order_by("-start_date")

        objectives = []
        for obj in qs[:50]:
            krs = EmployeeKeyResult.objects.filter(
                employee_objective_id=obj
            ).order_by("id")
            kr_list = []
            for kr in krs:
                kr_list.append({
                    "id": kr.id,
                    "title": kr.key_result or "",
                    "description": kr.key_result_description or "",
                    "start_value": kr.start_value or 0,
                    "current_value": kr.current_value or 0,
                    "target_value": kr.target_value or 0,
                    "progress": kr.progress_percentage,
                    "status": kr.status or "Not Started",
                    "progress_type": kr.progress_type or "%",
                    "start_date": kr.start_date.isoformat() if kr.start_date else None,
                    "end_date": kr.end_date.isoformat() if kr.end_date else None,
                })

            comments = Comment.objects.filter(
                employee_objective_id=obj
            ).select_related("employee_id").order_by("-created_at")[:5]
            comment_list = [{
                "id": c.id,
                "text": c.comment,
                "author": f"{c.employee_id.employee_first_name} {c.employee_id.employee_last_name or ''}".strip() if c.employee_id else "",
                "created_at": c.created_at.isoformat() if c.created_at else None,
            } for c in comments]

            wi = getattr(obj.employee_id, "employee_work_info", None) if obj.employee_id else None
            dept = getattr(getattr(wi, "department_id", None), "department", None) if wi else None
            is_overdue = obj.end_date < today if obj.end_date else False
            days_left = (obj.end_date - today).days if obj.end_date else None

            objectives.append({
                "id": obj.id,
                "title": obj.objective or (str(obj.objective_id) if obj.objective_id else ""),
                "description": obj.objective_description or "",
                "employee": f"{obj.employee_id.employee_first_name} {obj.employee_id.employee_last_name or ''}".strip() if obj.employee_id else "",
                "employee_id": obj.employee_id.id if obj.employee_id else None,
                "department": dept,
                "avatar": obj.employee_id.employee_profile.url if obj.employee_id and obj.employee_id.employee_profile else None,
                "status": obj.status,
                "status_color": self.STATUS_COLORS.get(obj.status, "#6b7280"),
                "progress": obj.progress_percentage,
                "start_date": obj.start_date.isoformat() if obj.start_date else None,
                "end_date": obj.end_date.isoformat() if obj.end_date else None,
                "is_overdue": is_overdue,
                "days_left": days_left,
                "key_results": kr_list,
                "comments": comment_list,
                "is_mine": obj.employee_id == emp if obj.employee_id else False,
            })

        return Response({
            "tab": "objectives",
            "objectives": objectives,
            "scope": scope,
            "can_view_team": is_manager or has_perm("pms.view_employeeobjective"),
        })

    def _tab_key_results(self, emp, today):
        from pms.models import EmployeeKeyResult

        qs = EmployeeKeyResult.objects.filter(
            employee_objective_id__employee_id=emp,
            employee_objective_id__archive=False,
        ).select_related(
            "employee_objective_id", "employee_objective_id__objective_id",
        ).order_by("-start_date")

        results = []
        for kr in qs[:100]:
            obj = kr.employee_objective_id
            is_overdue = kr.end_date < today if kr.end_date else False
            results.append({
                "id": kr.id,
                "title": kr.key_result or "",
                "description": kr.key_result_description or "",
                "objective_title": obj.objective or (str(obj.objective_id) if obj and obj.objective_id else ""),
                "objective_id": obj.id if obj else None,
                "start_value": kr.start_value or 0,
                "current_value": kr.current_value or 0,
                "target_value": kr.target_value or 0,
                "progress": kr.progress_percentage,
                "progress_type": kr.progress_type or "%",
                "status": kr.status or "Not Started",
                "status_color": self.STATUS_COLORS.get(kr.status, "#6b7280"),
                "start_date": kr.start_date.isoformat() if kr.start_date else None,
                "end_date": kr.end_date.isoformat() if kr.end_date else None,
                "is_overdue": is_overdue,
            })

        return Response({"tab": "key_results", "key_results": results})

    def _tab_feedback(self, emp, is_manager, has_perm, today):
        from pms.models import Feedback
        from django.db.models import Q

        qs = Feedback.objects.filter(
            Q(employee_id=emp) |
            Q(manager_id=emp) |
            Q(colleague_id=emp) |
            Q(subordinate_id=emp)
        ).distinct().select_related(
            "employee_id", "manager_id", "question_template_id",
        ).order_by("-start_date")

        feedbacks = []
        for fb in qs[:50]:
            my_role = []
            if fb.employee_id == emp:
                my_role.append("employee")
            if fb.manager_id == emp:
                my_role.append("manager")
            if emp in fb.colleague_id.all():
                my_role.append("colleague")
            if emp in fb.subordinate_id.all():
                my_role.append("subordinate")

            days_left = (fb.end_date - today).days if fb.end_date else None

            feedbacks.append({
                "id": fb.id,
                "title": fb.review_cycle,
                "employee": f"{fb.employee_id.employee_first_name} {fb.employee_id.employee_last_name or ''}".strip() if fb.employee_id else "",
                "manager": f"{fb.manager_id.employee_first_name} {fb.manager_id.employee_last_name or ''}".strip() if fb.manager_id else "",
                "status": fb.status,
                "status_color": self.STATUS_COLORS.get(fb.status, "#6b7280"),
                "start_date": fb.start_date.isoformat() if fb.start_date else None,
                "end_date": fb.end_date.isoformat() if fb.end_date else None,
                "days_left": days_left,
                "is_cyclic": fb.cyclic_feedback,
                "my_role": my_role,
                "template": str(fb.question_template_id) if fb.question_template_id else None,
            })

        return Response({"tab": "feedback", "feedbacks": feedbacks})

    def _tab_overview(self, emp, is_manager, has_perm, today):
        from pms.models import EmployeeObjective, EmployeeKeyResult, Feedback
        from django.db.models import Avg, Count, Q

        my_objs = EmployeeObjective.objects.filter(employee_id=emp, archive=False)
        total = my_objs.count()
        by_status = {}
        for s in ["Not Started", "On Track", "Behind", "At Risk", "Closed"]:
            by_status[s] = my_objs.filter(status=s).count()

        avg_progress = my_objs.aggregate(avg=Avg("progress_percentage"))["avg"] or 0

        my_krs = EmployeeKeyResult.objects.filter(
            employee_objective_id__employee_id=emp,
            employee_objective_id__archive=False,
        )
        kr_total = my_krs.count()
        kr_completed = my_krs.filter(progress_percentage__gte=100).count()

        fb_count = Feedback.objects.filter(
            Q(employee_id=emp) | Q(manager_id=emp)
        ).distinct().count()
        fb_pending = Feedback.objects.filter(
            Q(employee_id=emp) | Q(manager_id=emp),
            status__in=["Not Started", "On Track"],
        ).distinct().count()

        team_count = 0
        team_avg = 0
        if is_manager:
            team_ids = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp
            ).values_list("id", flat=True)
            team_objs = EmployeeObjective.objects.filter(
                employee_id__in=team_ids, archive=False,
            )
            team_count = team_objs.count()
            team_avg = team_objs.aggregate(avg=Avg("progress_percentage"))["avg"] or 0

        return Response({
            "tab": "overview",
            "my_objectives": total,
            "by_status": by_status,
            "avg_progress": round(avg_progress),
            "my_key_results": kr_total,
            "kr_completed": kr_completed,
            "feedback_total": fb_count,
            "feedback_pending": fb_pending,
            "team_objectives": team_count,
            "team_avg_progress": round(team_avg),
            "is_manager": is_manager,
        })


class TrainingPWAView(APIView):
    """Training — courses, enrollments, overview for PWA."""

    permission_classes = [IsAuthenticated]

    STATUS_VI = {
        "enrolled": "Đã đăng ký",
        "in_progress": "Đang học",
        "completed": "Hoàn thành",
        "cancelled": "Đã hủy",
        "failed": "Không đạt",
    }

    def get(self, request):
        from datetime import date
        from training.models import TrainingCategory, TrainingCourse, TrainingEnrollment

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee linked"}, status=400)

        tab = request.query_params.get("tab", "overview")
        is_manager = Employee.objects.filter(
            employee_work_info__reporting_manager_id=emp
        ).exists()
        has_perm = request.user.has_perm
        today = date.today()

        can_manage = (
            request.user.is_superuser
            or has_perm("training.add_trainingcourse")
            or has_perm("training.change_trainingcourse")
            or is_manager
        )

        if tab == "overview":
            return self._tab_overview(emp, is_manager, today)
        elif tab == "my_courses":
            return self._tab_my_courses(emp, today)
        elif tab == "catalog":
            return self._tab_catalog(emp, today)
        elif tab == "team":
            return self._tab_team(emp, is_manager, today)
        elif tab == "manage":
            return self._tab_manage(emp, can_manage)
        else:
            return Response({"error": "Invalid tab"}, status=400)

    def post(self, request):
        from datetime import date
        from training.models import TrainingCourse, TrainingEnrollment

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee linked"}, status=400)

        action = request.data.get("action")

        if action == "enroll":
            course_id = request.data.get("course_id")
            try:
                course = TrainingCourse.objects.get(id=course_id, is_active=True)
                if TrainingEnrollment.objects.filter(employee=emp, course=course).exists():
                    return Response({"error": "Đã đăng ký khóa này rồi"}, status=400)
                if course.max_participants > 0 and course.enrolled_count >= course.max_participants:
                    return Response({"error": "Khóa học đã đầy"}, status=400)
                TrainingEnrollment.objects.create(employee=emp, course=course)
                return Response({"ok": True})
            except TrainingCourse.DoesNotExist:
                return Response({"error": "Course not found"}, status=404)

        elif action == "update_status":
            enrollment_id = request.data.get("enrollment_id")
            new_status = request.data.get("status")
            valid = ["enrolled", "in_progress", "completed", "cancelled"]
            if new_status not in valid:
                return Response({"error": "Invalid status"}, status=400)
            try:
                enroll = TrainingEnrollment.objects.get(id=enrollment_id)
                can_edit = (
                    request.user.has_perm("training.change_trainingenrollment")
                    or enroll.employee == emp
                    or Employee.objects.filter(
                        id=enroll.employee.id,
                        employee_work_info__reporting_manager_id=emp,
                    ).exists()
                )
                if not can_edit:
                    return Response({"error": "Permission denied"}, status=403)
                enroll.status = new_status
                if new_status == "in_progress" and not enroll.started_date:
                    enroll.started_date = date.today()
                elif new_status == "completed" and not enroll.completed_date:
                    enroll.completed_date = date.today()
                enroll.save()
                return Response({"ok": True})
            except TrainingEnrollment.DoesNotExist:
                return Response({"error": "Enrollment not found"}, status=404)

        elif action == "cancel":
            enrollment_id = request.data.get("enrollment_id")
            try:
                enroll = TrainingEnrollment.objects.get(id=enrollment_id, employee=emp)
                if enroll.status == "completed":
                    return Response({"error": "Không thể hủy khóa đã hoàn thành"}, status=400)
                enroll.status = "cancelled"
                enroll.save()
                return Response({"ok": True})
            except TrainingEnrollment.DoesNotExist:
                return Response({"error": "Enrollment not found"}, status=404)

        # ── Management actions ──
        is_manager = Employee.objects.filter(
            employee_work_info__reporting_manager_id=emp
        ).exists()
        can_manage = (
            request.user.is_superuser
            or request.user.has_perm("training.add_trainingcourse")
            or request.user.has_perm("training.change_trainingcourse")
            or is_manager
        )

        if action == "create_course":
            if not can_manage:
                return Response({"error": "Permission denied"}, status=403)
            from training.models import TrainingCategory, TrainingCourse, TrainingEnrollment
            from base.models import Company

            title = request.data.get("title", "").strip()
            if not title:
                return Response({"error": "Tên khóa học không được để trống"}, status=400)

            category_id = request.data.get("category_id") or None
            company = getattr(getattr(emp, "employee_work_info", None), "company_id", None)
            dept_ids = request.data.get("target_departments") or []
            if isinstance(dept_ids, str):
                dept_ids = [d.strip() for d in dept_ids.split(",") if d.strip()]

            course = TrainingCourse.objects.create(
                title=title,
                description=request.data.get("description", ""),
                course_type=request.data.get("course_type", "internal"),
                instructor=request.data.get("instructor", ""),
                duration_hours=float(request.data.get("duration_hours") or 0),
                max_participants=int(request.data.get("max_participants") or 0),
                start_date=request.data.get("start_date") or None,
                end_date=request.data.get("end_date") or None,
                location=request.data.get("location", ""),
                is_mandatory=bool(request.data.get("is_mandatory", False)),
                is_active=True,
                category_id=category_id,
                company_id=company,
            )
            if dept_ids:
                course.target_departments.set(dept_ids)
                self._auto_enroll_departments(course, dept_ids)
            enrolled_count = TrainingEnrollment.objects.filter(course=course).count()
            return Response({"ok": True, "id": course.id, "title": course.title, "enrolled": enrolled_count}, status=201)

        elif action == "update_course":
            if not can_manage:
                return Response({"error": "Permission denied"}, status=403)
            from training.models import TrainingCourse
            course_id = request.data.get("course_id")
            try:
                course = TrainingCourse.objects.get(id=course_id)
                if request.data.get("title") is not None:
                    course.title = request.data["title"].strip()
                if request.data.get("description") is not None:
                    course.description = request.data["description"]
                if request.data.get("course_type"):
                    course.course_type = request.data["course_type"]
                if request.data.get("instructor") is not None:
                    course.instructor = request.data["instructor"]
                if request.data.get("duration_hours") is not None:
                    course.duration_hours = float(request.data["duration_hours"])
                if request.data.get("max_participants") is not None:
                    course.max_participants = int(request.data["max_participants"])
                if request.data.get("start_date") is not None:
                    course.start_date = request.data["start_date"] or None
                if request.data.get("end_date") is not None:
                    course.end_date = request.data["end_date"] or None
                if request.data.get("location") is not None:
                    course.location = request.data["location"]
                if request.data.get("is_mandatory") is not None:
                    course.is_mandatory = bool(request.data["is_mandatory"])
                if request.data.get("is_active") is not None:
                    course.is_active = bool(request.data["is_active"])
                if "category_id" in request.data:
                    course.category_id = request.data["category_id"] or None
                course.save()
                if "target_departments" in request.data:
                    dept_ids = request.data.get("target_departments") or []
                    if isinstance(dept_ids, str):
                        dept_ids = [d.strip() for d in dept_ids.split(",") if d.strip()]
                    new_dept_ids = set(str(d) for d in dept_ids)
                    old_dept_ids = set(str(d) for d in course.target_departments.values_list("id", flat=True))
                    course.target_departments.set(dept_ids)
                    added = new_dept_ids - old_dept_ids
                    if added:
                        self._auto_enroll_departments(course, list(added))
                return Response({"ok": True})
            except TrainingCourse.DoesNotExist:
                return Response({"error": "Course not found"}, status=404)

        elif action == "delete_course":
            if not can_manage:
                return Response({"error": "Permission denied"}, status=403)
            from training.models import TrainingCourse
            course_id = request.data.get("course_id")
            try:
                course = TrainingCourse.objects.get(id=course_id)
                course.is_active = False
                course.save()
                return Response({"ok": True})
            except TrainingCourse.DoesNotExist:
                return Response({"error": "Course not found"}, status=404)

        elif action == "create_category":
            if not can_manage:
                return Response({"error": "Permission denied"}, status=403)
            from training.models import TrainingCategory
            name = request.data.get("name", "").strip()
            if not name:
                return Response({"error": "Tên danh mục không được để trống"}, status=400)
            company = getattr(getattr(emp, "employee_work_info", None), "company_id", None)
            cat = TrainingCategory.objects.create(name=name, company_id=company)
            return Response({"ok": True, "id": cat.id, "name": cat.name}, status=201)

        return Response({"error": "Invalid action"}, status=400)

    def _auto_enroll_departments(self, course, dept_ids):
        """Enroll all active employees in the given departments who aren't already enrolled."""
        from training.models import TrainingEnrollment
        employees = Employee.objects.filter(
            is_active=True,
            employee_work_info__department_id__in=dept_ids,
        ).exclude(
            training_enrollments__course=course
        )
        TrainingEnrollment.objects.bulk_create(
            [TrainingEnrollment(employee=e, course=course, status="enrolled") for e in employees],
            ignore_conflicts=True,
        )

    def _course_row(self, course, enrollment=None):
        from training.models import TrainingCourse as TC
        TYPE_MAP = dict(TC.COURSE_TYPE_CHOICES)
        row = {
            "id": course.id,
            "title": course.title,
            "description": course.description or "",
            "category": course.category.name if course.category else None,
            "course_type": course.course_type,
            "course_type_display": TYPE_MAP.get(course.course_type, course.course_type),
            "instructor": course.instructor or "",
            "instructor_employee": (
                f"{course.instructor_employee.employee_first_name} {course.instructor_employee.employee_last_name or ''}".strip()
                if course.instructor_employee else None
            ),
            "duration_hours": float(course.duration_hours),
            "max_participants": course.max_participants,
            "enrolled_count": course.enrolled_count,
            "completed_count": course.completed_count,
            "start_date": course.start_date.isoformat() if course.start_date else None,
            "end_date": course.end_date.isoformat() if course.end_date else None,
            "location": course.location or "",
            "is_mandatory": course.is_mandatory,
        }
        if enrollment:
            row["enrollment"] = {
                "id": enrollment.id,
                "status": enrollment.status,
                "enrolled_date": enrollment.enrolled_date.isoformat() if enrollment.enrolled_date else None,
                "started_date": enrollment.started_date.isoformat() if enrollment.started_date else None,
                "completed_date": enrollment.completed_date.isoformat() if enrollment.completed_date else None,
                "score": float(enrollment.score) if enrollment.score else None,
                "certificate": enrollment.certificate_number or None,
                "notes": enrollment.notes or "",
            }
        return row

    def _tab_overview(self, emp, is_manager, today):
        from training.models import TrainingCourse, TrainingEnrollment
        from django.db.models import Count, Q

        my_enrollments = TrainingEnrollment.objects.filter(employee=emp)
        total = my_enrollments.count()
        completed = my_enrollments.filter(status="completed").count()
        in_progress = my_enrollments.filter(status="in_progress").count()
        enrolled = my_enrollments.filter(status="enrolled").count()

        upcoming = TrainingCourse.objects.filter(
            is_active=True, start_date__gte=today,
        ).order_by("start_date")[:5]
        upcoming_list = [self._course_row(c) for c in upcoming]

        mandatory_pending = TrainingCourse.objects.filter(
            is_active=True, is_mandatory=True,
        ).exclude(
            enrollments__employee=emp, enrollments__status="completed",
        ).count()

        recent = my_enrollments.filter(
            status="completed"
        ).select_related("course", "course__category").order_by("-completed_date")[:5]
        recent_list = [self._course_row(e.course, e) for e in recent]

        team_count = 0
        team_completed = 0
        if is_manager:
            team_ids = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp
            ).values_list("id", flat=True)
            team_enrollments = TrainingEnrollment.objects.filter(employee__in=team_ids)
            team_count = team_enrollments.count()
            team_completed = team_enrollments.filter(status="completed").count()

        return Response({
            "tab": "overview",
            "total_enrollments": total,
            "completed": completed,
            "in_progress": in_progress,
            "enrolled": enrolled,
            "mandatory_pending": mandatory_pending,
            "upcoming_courses": upcoming_list,
            "recent_completed": recent_list,
            "team_enrollments": team_count,
            "team_completed": team_completed,
            "is_manager": is_manager,
        })

    def _tab_my_courses(self, emp, today):
        from training.models import TrainingEnrollment

        status_filter = self.request.query_params.get("status", "")

        qs = TrainingEnrollment.objects.filter(
            employee=emp
        ).select_related(
            "course", "course__category", "course__instructor_employee",
        ).order_by("-enrolled_date")

        if status_filter:
            qs = qs.filter(status=status_filter)

        courses = [self._course_row(e.course, e) for e in qs[:50]]

        return Response({"tab": "my_courses", "courses": courses})

    def _tab_catalog(self, emp, today):
        from training.models import TrainingCourse, TrainingEnrollment, TrainingCategory

        category_filter = self.request.query_params.get("category", "")

        qs = TrainingCourse.objects.filter(
            is_active=True,
        ).select_related("category", "instructor_employee").order_by("-start_date")

        if category_filter:
            qs = qs.filter(category_id=category_filter)

        enrolled_course_ids = set(
            TrainingEnrollment.objects.filter(employee=emp).values_list("course_id", flat=True)
        )
        enrollment_map = {}
        for e in TrainingEnrollment.objects.filter(employee=emp).select_related("course"):
            enrollment_map[e.course_id] = e

        courses = []
        for c in qs[:100]:
            row = self._course_row(c, enrollment_map.get(c.id))
            row["is_enrolled"] = c.id in enrolled_course_ids
            row["can_enroll"] = (
                c.id not in enrolled_course_ids
                and (c.max_participants == 0 or c.enrolled_count < c.max_participants)
            )
            courses.append(row)

        categories = list(
            TrainingCategory.objects.values_list("id", "name").order_by("name")
        )

        return Response({
            "tab": "catalog",
            "courses": courses,
            "categories": [{"id": cid, "name": cname} for cid, cname in categories],
        })

    def _tab_team(self, emp, is_manager, today):
        from training.models import TrainingEnrollment

        is_hr = (
            self.request.user.is_superuser
            or self.request.user.has_perm("training.view_trainingenrollment")
        )

        if not is_manager and not is_hr:
            return Response({"tab": "team", "members": [], "is_manager": False})

        dept_filter = self.request.query_params.get("dept", "")
        course_filter = self.request.query_params.get("course", "")

        if is_hr:
            employee_qs = Employee.objects.filter(is_active=True)
        else:
            employee_qs = Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp,
            )

        team_ids = employee_qs.values_list("id", flat=True)
        if dept_filter:
            team_ids = employee_qs.filter(
                employee_work_info__department_id=dept_filter
            ).values_list("id", flat=True)

        enroll_qs = TrainingEnrollment.objects.filter(employee__in=team_ids)
        if course_filter:
            enroll_qs = enroll_qs.filter(course_id=course_filter)

        enrollments = enroll_qs.select_related(
            "employee", "employee__employee_work_info__department_id",
            "course", "course__category",
        ).order_by("employee__employee_first_name", "-enrolled_date")

        members = {}
        for e in enrollments[:200]:
            eid = e.employee.id
            if eid not in members:
                wi = getattr(e.employee, "employee_work_info", None)
                dept = getattr(getattr(wi, "department_id", None), "department", None) if wi else None
                members[eid] = {
                    "id": eid,
                    "name": f"{e.employee.employee_first_name} {e.employee.employee_last_name or ''}".strip(),
                    "department": dept,
                    "avatar": e.employee.employee_profile.url if e.employee.employee_profile else None,
                    "courses": [],
                    "total": 0,
                    "completed": 0,
                }
            members[eid]["courses"].append({
                "course_title": e.course.title,
                "category": e.course.category.name if e.course.category else None,
                "status": e.status,
                "enrolled_date": e.enrolled_date.isoformat() if e.enrolled_date else None,
                "completed_date": e.completed_date.isoformat() if e.completed_date else None,
                "score": float(e.score) if e.score else None,
            })
            members[eid]["total"] += 1
            if e.status == "completed":
                members[eid]["completed"] += 1

        return Response({
            "tab": "team",
            "members": list(members.values()),
            "is_manager": is_manager or is_hr,
            "is_hr": is_hr,
        })

    def _tab_manage(self, emp, can_manage):
        from training.models import TrainingCategory, TrainingCourse
        from base.models import Department

        if not can_manage:
            return Response({"tab": "manage", "can_manage": False, "courses": [], "categories": [], "departments": []})

        courses_qs = TrainingCourse.objects.prefetch_related(
            "target_departments",
        ).select_related(
            "category", "instructor_employee",
        ).order_by("-created_at")[:200]

        courses = []
        for c in courses_qs:
            courses.append({
                "id": c.id,
                "title": c.title,
                "description": c.description or "",
                "category_id": c.category_id,
                "category": c.category.name if c.category else None,
                "course_type": c.course_type,
                "instructor": c.instructor or "",
                "duration_hours": float(c.duration_hours),
                "max_participants": c.max_participants,
                "enrolled_count": c.enrolled_count,
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "location": c.location or "",
                "is_mandatory": c.is_mandatory,
                "is_active": c.is_active,
                "target_departments": list(c.target_departments.values("id", "department")),
            })

        categories = list(
            TrainingCategory.objects.values("id", "name").order_by("name")
        )
        departments = list(
            Department.objects.values("id", "department").order_by("department")
        )

        return Response({
            "tab": "manage",
            "can_manage": True,
            "courses": courses,
            "categories": categories,
            "departments": departments,
        })


class OrgChartView(APIView):
    """Org chart: tree view + manager assignment for PWA."""

    permission_classes = [IsAuthenticated]

    def _can_edit(self, request):
        user = request.user
        if user.is_superuser:
            return True
        if user.has_perm("employee.change_employeeworkinformation"):
            return True
        try:
            from employee.models import EmployeeWorkInformation
            emp = user.employee_get
            return EmployeeWorkInformation.objects.filter(reporting_manager_id=emp).exists()
        except Exception:
            return False

    def _avatar_url(self, emp):
        try:
            if emp.employee_profile:
                return emp.employee_profile.url
        except Exception:
            pass
        return None

    def get(self, request):
        tab = request.GET.get("tab", "tree")
        if tab == "tree":
            return self._tab_tree(request)
        if tab == "list":
            return self._tab_list(request)
        return Response({"error": "Invalid tab"}, status=400)

    def post(self, request):
        action = request.data.get("action")
        if action == "set_manager":
            return self._set_manager(request)
        return Response({"error": "Unknown action"}, status=400)

    def _tab_tree(self, request):
        from employee.models import Employee

        all_emps = (
            Employee.objects.filter(is_active=True)
            .select_related(
                "employee_work_info",
                "employee_work_info__department_id",
                "employee_work_info__job_position_id",
                "employee_work_info__reporting_manager_id",
            )
            .order_by("employee_first_name", "employee_last_name")
        )

        valid_ids = {emp.id for emp in all_emps}
        emp_map = {}
        children_map = {}

        for emp in all_emps:
            wi = getattr(emp, "employee_work_info", None)
            manager_id = None
            if wi and wi.reporting_manager_id_id and wi.reporting_manager_id_id in valid_ids:
                manager_id = wi.reporting_manager_id_id
                children_map.setdefault(manager_id, []).append(emp.id)

            emp_map[emp.id] = {
                "id": emp.id,
                "name": emp.get_full_name(),
                "avatar": self._avatar_url(emp),
                "badge_id": emp.badge_id or "",
                "position": str(wi.job_position_id) if wi and wi.job_position_id else "",
                "department": str(wi.department_id) if wi and wi.department_id else "",
                "manager_id": manager_id,
                "children": [],
            }

        visited = set()

        def build_node(eid):
            if eid in visited:
                return None
            visited.add(eid)
            node = {**emp_map[eid], "children": []}
            for cid in sorted(children_map.get(eid, []), key=lambda x: emp_map[x]["name"]):
                child = build_node(cid)
                if child:
                    node["children"].append(child)
            return node

        roots = []
        for eid, data in emp_map.items():
            if not data["manager_id"]:
                node = build_node(eid)
                if node:
                    roots.append(node)

        roots.sort(key=lambda x: x["name"])

        depts = sorted({d["department"] for d in emp_map.values() if d["department"]})

        return Response({
            "tab": "tree",
            "tree": roots,
            "total": len(emp_map),
            "without_manager": sum(1 for d in emp_map.values() if not d["manager_id"]),
            "departments": depts,
            "can_edit": self._can_edit(request),
        })

    def _tab_list(self, request):
        from employee.models import Employee

        dept_filter = request.GET.get("department", "")
        search = request.GET.get("q", "")

        qs = (
            Employee.objects.filter(is_active=True)
            .select_related(
                "employee_work_info",
                "employee_work_info__department_id",
                "employee_work_info__job_position_id",
                "employee_work_info__reporting_manager_id",
            )
            .order_by("employee_first_name", "employee_last_name")
        )

        if dept_filter:
            qs = qs.filter(employee_work_info__department_id__department=dept_filter)
        if search:
            from django.db.models import Q as DQ
            qs = qs.filter(
                DQ(employee_first_name__icontains=search)
                | DQ(employee_last_name__icontains=search)
                | DQ(badge_id__icontains=search)
            )

        employees = []
        for emp in qs:
            wi = getattr(emp, "employee_work_info", None)
            mgr = wi.reporting_manager_id if wi else None
            employees.append({
                "id": emp.id,
                "name": emp.get_full_name(),
                "avatar": self._avatar_url(emp),
                "badge_id": emp.badge_id or "",
                "position": str(wi.job_position_id) if wi and wi.job_position_id else "",
                "department": str(wi.department_id) if wi and wi.department_id else "",
                "manager_id": mgr.id if mgr else None,
                "manager_name": mgr.get_full_name() if mgr else "",
            })

        # Lightweight list of all active employees for picker
        managers_qs = (
            Employee.objects.filter(is_active=True)
            .select_related("employee_work_info__job_position_id", "employee_work_info__department_id")
            .order_by("employee_first_name", "employee_last_name")
        )
        managers_select = []
        for e in managers_qs:
            wi = getattr(e, "employee_work_info", None)
            managers_select.append({
                "id": e.id,
                "name": e.get_full_name(),
                "position": str(wi.job_position_id) if wi and wi.job_position_id else "",
                "department": str(wi.department_id) if wi and wi.department_id else "",
            })

        depts = sorted({
            str(e.employee_work_info.department_id)
            for e in Employee.objects.filter(is_active=True)
            .select_related("employee_work_info__department_id")
            if getattr(e, "employee_work_info", None) and e.employee_work_info.department_id
        })

        return Response({
            "tab": "list",
            "employees": employees,
            "managers_select": managers_select,
            "departments": depts,
            "can_edit": self._can_edit(request),
        })

    def _set_manager(self, request):
        from employee.models import Employee, EmployeeWorkInformation

        if not self._can_edit(request):
            return Response({"error": "Không có quyền chỉnh sửa"}, status=403)

        emp_id = request.data.get("employee_id")
        manager_id = request.data.get("manager_id")  # None = clear

        try:
            emp = Employee.objects.get(pk=emp_id, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Nhân viên không tồn tại"}, status=404)

        if manager_id:
            if int(manager_id) == emp.id:
                return Response({"error": "Nhân viên không thể tự báo cáo cho chính mình"}, status=400)

            # Cycle detection: walk up from proposed manager, ensure emp is not an ancestor
            visited = set()
            cur = int(manager_id)
            while cur:
                if cur == emp.id:
                    return Response({"error": "Phát hiện vòng lặp phân cấp"}, status=400)
                if cur in visited:
                    break
                visited.add(cur)
                try:
                    cur_emp = Employee.objects.get(pk=cur)
                    wi = getattr(cur_emp, "employee_work_info", None)
                    cur = wi.reporting_manager_id_id if wi else None
                except Employee.DoesNotExist:
                    break

            try:
                mgr = Employee.objects.get(pk=manager_id, is_active=True)
            except Employee.DoesNotExist:
                return Response({"error": "Người quản lý không tồn tại"}, status=404)

        wi, _ = EmployeeWorkInformation.objects.get_or_create(employee_id=emp)
        wi.reporting_manager_id = mgr if manager_id else None
        wi.save(update_fields=["reporting_manager_id"])

        return Response({
            "ok": True,
            "employee_id": emp.id,
            "manager_id": mgr.id if manager_id else None,
            "manager_name": mgr.get_full_name() if manager_id else "",
        })


class PromotionHubView(APIView):
    """Hub Thăng Tiến: 9-Box → Đề xuất → Phê duyệt → Quyết định → Công bố."""

    def _emp(self, request):
        return getattr(request.user, "employee_get", None)

    def _can_manage(self, request):
        u = request.user
        if u.is_superuser:
            return True
        # Explicit promotion perms (assigned to HR/management groups)
        if u.has_perm("promotion.add_promotionnomination") or u.has_perm(
            "promotion.change_promotionnomination"
        ):
            return True
        # HR/managers already have employee change permission — treat as promotion managers
        return u.has_perm("employee.change_employee") or u.has_perm(
            "employee.change_employeeworkinformation"
        )

    def _avatar(self, emp):
        try:
            if emp.employee_profile and emp.employee_profile.name:
                return emp.employee_profile.url
        except Exception:
            pass
        return None

    def _nom_dict(self, nom, include_steps=False):
        d = {
            "id": nom.id,
            "employee_id": nom.employee_id,
            "employee_name": nom.employee.get_full_name(),
            "employee_avatar": self._avatar(nom.employee),
            "nominated_by_id": nom.nominated_by_id,
            "nominated_by_name": nom.nominated_by.get_full_name() if nom.nominated_by else "",
            "status": nom.status,
            "status_label": nom.get_status_display(),
            "current_job_position": str(nom.current_job_position) if nom.current_job_position else "",
            "proposed_job_position": str(nom.proposed_job_position) if nom.proposed_job_position else "",
            "current_department": str(nom.current_department) if nom.current_department else "",
            "proposed_department": str(nom.proposed_department) if nom.proposed_department else "",
            "nomination_reason": nom.nomination_reason,
            "expected_date": str(nom.expected_date) if nom.expected_date else None,
            "effective_date": str(nom.effective_date) if nom.effective_date else None,
            "decision_notes": nom.decision_notes,
            "created_at": nom.created_at.strftime("%d/%m/%Y"),
            "ninebox_id": nom.ninebox_id,
            "ninebox_label": nom.ninebox.quadrant_label if nom.ninebox else "",
        }
        if include_steps:
            d["steps"] = [
                {
                    "id": s.id,
                    "order": s.order,
                    "role": s.role,
                    "role_label": s.get_role_display(),
                    "approver_id": s.approver_id,
                    "approver_name": s.approver.get_full_name(),
                    "status": s.status,
                    "status_label": s.get_status_display(),
                    "comment": s.comment,
                    "decided_at": s.decided_at.strftime("%d/%m/%Y %H:%M") if s.decided_at else None,
                }
                for s in nom.approval_steps.order_by("order")
            ]
            try:
                ann = nom.announcement
                d["announcement"] = {
                    "id": ann.id,
                    "title": ann.title,
                    "content": ann.content,
                    "is_published": ann.is_published,
                    "published_at": ann.published_at.strftime("%d/%m/%Y %H:%M") if ann.published_at else None,
                }
            except Exception:
                d["announcement"] = None
        return d

    # ── GET dispatcher ─────────────────────────────────────────────────
    def get(self, request):
        from promotion.models import (
            EmployeeNineBox,
            PromotionNomination,
            PromotionApprovalStep,
            PromotionAnnouncement,
        )
        tab = request.GET.get("tab", "overview")
        if tab == "overview":
            return self._tab_overview(request)
        if tab == "ninebox":
            return self._tab_ninebox(request)
        if tab == "nominations":
            return self._tab_nominations(request)
        if tab == "approvals":
            return self._tab_approvals(request)
        if tab == "announcements":
            return self._tab_announcements(request)
        return Response({"error": "Tab không hợp lệ"}, status=400)

    def _tab_overview(self, request):
        from promotion.models import PromotionNomination
        emp = self._emp(request)
        can_manage = self._can_manage(request)
        pending_mine = []
        if emp:
            from promotion.models import PromotionApprovalStep
            steps = PromotionApprovalStep.objects.filter(
                approver=emp, status="pending"
            ).select_related("nomination__employee", "nomination__proposed_job_position")
            pending_mine = [
                {
                    "step_id": s.id,
                    "nomination_id": s.nomination_id,
                    "employee_name": s.nomination.employee.get_full_name(),
                    "proposed_position": str(s.nomination.proposed_job_position or ""),
                    "role_label": s.get_role_display(),
                    "order": s.order,
                }
                for s in steps
            ]
        stats = {}
        if can_manage:
            stats = {
                "draft": PromotionNomination.objects.filter(status="draft").count(),
                "reviewing": PromotionNomination.objects.filter(status__in=["submitted", "reviewing"]).count(),
                "approved": PromotionNomination.objects.filter(status="approved").count(),
                "decided": PromotionNomination.objects.filter(status="decided").count(),
                "announced": PromotionNomination.objects.filter(status="announced").count(),
            }
        return Response({"pending_mine": pending_mine, "stats": stats, "can_manage": can_manage})

    def _tab_ninebox(self, request):
        from promotion.models import EmployeeNineBox
        can_manage = self._can_manage(request)
        period = request.GET.get("period", "")
        qs = EmployeeNineBox.objects.select_related("employee", "assessed_by")
        if period:
            qs = qs.filter(period=period)
        periods = list(
            EmployeeNineBox.objects.values_list("period", flat=True).distinct().order_by("-period")
        )
        employees_list = list(
            Employee.objects.filter(is_active=True).values("id", "employee_first_name", "employee_last_name", "badge_id")
        )
        data = [
            {
                "id": a.id,
                "employee_id": a.employee_id,
                "employee_name": a.employee.get_full_name(),
                "employee_avatar": self._avatar(a.employee),
                "assessed_by_name": a.assessed_by.get_full_name() if a.assessed_by else "",
                "period": a.period,
                "performance": a.performance,
                "potential": a.potential,
                "quadrant_label": a.quadrant_label,
                "notes": a.notes,
                "assessed_date": str(a.assessed_date),
            }
            for a in qs
        ]
        return Response({
            "assessments": data,
            "periods": periods,
            "employees": employees_list,
            "can_manage": can_manage,
        })

    def _tab_nominations(self, request):
        from promotion.models import PromotionNomination
        from base.models import JobPosition, Department
        can_manage = self._can_manage(request)
        status_filter = request.GET.get("status", "")
        qs = PromotionNomination.objects.select_related(
            "employee", "nominated_by", "ninebox",
            "current_job_position", "proposed_job_position",
            "current_department", "proposed_department",
        )
        if status_filter:
            qs = qs.filter(status=status_filter)
        noms = [self._nom_dict(n, include_steps=True) for n in qs]
        employees_list = list(
            Employee.objects.filter(is_active=True).values("id", "employee_first_name", "employee_last_name")
        )
        positions = list(JobPosition.objects.values("id", "job_position"))
        departments = list(Department.objects.values("id", "department"))
        return Response({
            "nominations": noms,
            "employees": employees_list,
            "positions": positions,
            "departments": departments,
            "can_manage": can_manage,
        })

    def _tab_approvals(self, request):
        from promotion.models import PromotionApprovalStep, PromotionNomination
        emp = self._emp(request)
        can_manage = self._can_manage(request)
        if can_manage:
            qs = PromotionNomination.objects.filter(
                status__in=["submitted", "reviewing"]
            ).select_related("employee", "nominated_by", "proposed_job_position")
            reviewing = [self._nom_dict(n, include_steps=True) for n in qs]
        else:
            reviewing = []
        my_steps = []
        if emp:
            steps = PromotionApprovalStep.objects.filter(
                approver=emp
            ).select_related("nomination__employee", "nomination__proposed_job_position").order_by("-id")
            my_steps = [
                {
                    "step_id": s.id,
                    "nomination_id": s.nomination_id,
                    "employee_name": s.nomination.employee.get_full_name(),
                    "proposed_position": str(s.nomination.proposed_job_position or ""),
                    "role_label": s.get_role_display(),
                    "status": s.status,
                    "status_label": s.get_status_display(),
                    "order": s.order,
                    "comment": s.comment,
                    "decided_at": s.decided_at.strftime("%d/%m/%Y %H:%M") if s.decided_at else None,
                }
                for s in steps
            ]
        employees_list = list(
            Employee.objects.filter(is_active=True).values("id", "employee_first_name", "employee_last_name")
        )
        return Response({
            "reviewing": reviewing,
            "my_steps": my_steps,
            "employees": employees_list,
            "can_manage": can_manage,
        })

    def _tab_announcements(self, request):
        from promotion.models import PromotionAnnouncement, PromotionNomination
        can_manage = self._can_manage(request)
        anns = PromotionAnnouncement.objects.select_related(
            "nomination__employee", "nomination__proposed_job_position", "created_by"
        ).order_by("-created_at")
        data = [
            {
                "id": a.id,
                "title": a.title,
                "content": a.content,
                "is_published": a.is_published,
                "published_at": a.published_at.strftime("%d/%m/%Y %H:%M") if a.published_at else None,
                "created_at": a.created_at.strftime("%d/%m/%Y"),
                "nomination_id": a.nomination_id,
                "employee_name": a.nomination.employee.get_full_name(),
                "proposed_position": str(a.nomination.proposed_job_position or ""),
                "created_by_name": a.created_by.get_full_name() if a.created_by else "",
            }
            for a in anns
        ]
        decided = []
        if can_manage:
            noms = PromotionNomination.objects.filter(status="decided").exclude(
                id__in=PromotionAnnouncement.objects.values_list("nomination_id", flat=True)
            ).select_related("employee", "proposed_job_position")
            decided = [self._nom_dict(n) for n in noms]
        return Response({"announcements": data, "decided": decided, "can_manage": can_manage})

    # ── POST dispatcher ─────────────────────────────────────────────────
    def post(self, request):
        action = request.data.get("action", "")
        dispatch = {
            "assess_ninebox": self._act_assess_ninebox,
            "create_nomination": self._act_create_nomination,
            "update_nomination": self._act_update_nomination,
            "submit_nomination": self._act_submit_nomination,
            "approve_step": self._act_approve_step,
            "decide": self._act_decide,
            "create_announcement": self._act_create_announcement,
            "publish_announcement": self._act_publish_announcement,
        }
        fn = dispatch.get(action)
        if not fn:
            return Response({"error": "Action không hợp lệ"}, status=400)
        return fn(request)

    def _act_assess_ninebox(self, request):
        from promotion.models import EmployeeNineBox
        emp = self._emp(request)
        if not emp:
            return Response({"error": "Không xác định được nhân viên"}, status=400)
        employee_id = request.data.get("employee_id")
        period = (request.data.get("period") or "").strip()
        performance = request.data.get("performance")
        potential = request.data.get("potential")
        notes = request.data.get("notes", "")
        if not all([employee_id, period, performance, potential]):
            return Response({"error": "Thiếu thông tin bắt buộc"}, status=400)
        try:
            target = Employee.objects.get(pk=employee_id, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Nhân viên không tồn tại"}, status=404)
        obj, created = EmployeeNineBox.objects.update_or_create(
            employee=target, period=period, assessed_by=emp,
            defaults={
                "performance": int(performance),
                "potential": int(potential),
                "notes": notes,
                "company_id": target.get_company(),
            },
        )
        return Response({"ok": True, "id": obj.id, "created": created, "quadrant_label": obj.quadrant_label})

    def _act_create_nomination(self, request):
        from promotion.models import PromotionNomination, EmployeeNineBox
        from base.models import JobPosition, Department
        if not self._can_manage(request):
            return Response({"error": "Không có quyền"}, status=403)
        emp = self._emp(request)
        employee_id = request.data.get("employee_id")
        if not employee_id:
            return Response({"error": "Thiếu employee_id"}, status=400)
        try:
            target = Employee.objects.get(pk=employee_id, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Nhân viên không tồn tại"}, status=404)
        ninebox_id = request.data.get("ninebox_id")
        ninebox = None
        if ninebox_id:
            try:
                ninebox = EmployeeNineBox.objects.get(pk=ninebox_id)
            except EmployeeNineBox.DoesNotExist:
                pass

        def _get_pos(fid):
            try:
                return JobPosition.objects.get(pk=fid) if fid else None
            except JobPosition.DoesNotExist:
                return None

        def _get_dept(fid):
            try:
                return Department.objects.get(pk=fid) if fid else None
            except Department.DoesNotExist:
                return None

        # Derive current position/dept from employee work info if not provided
        wi = getattr(target, "employee_work_info", None)
        cur_pos = _get_pos(request.data.get("current_job_position_id")) or (
            wi.job_position_id if wi else None
        )
        cur_dept = _get_dept(request.data.get("current_department_id")) or (
            wi.department_id if wi else None
        )

        nom = PromotionNomination.objects.create(
            employee=target,
            nominated_by=emp,
            ninebox=ninebox,
            current_job_position=cur_pos,
            proposed_job_position=_get_pos(request.data.get("proposed_job_position_id")),
            current_department=cur_dept,
            proposed_department=_get_dept(request.data.get("proposed_department_id")),
            nomination_reason=request.data.get("nomination_reason", ""),
            expected_date=request.data.get("expected_date") or None,
            status="draft",
            company_id=target.get_company(),
        )
        return Response({"ok": True, "id": nom.id})

    def _act_update_nomination(self, request):
        from promotion.models import PromotionNomination
        from base.models import JobPosition, Department
        if not self._can_manage(request):
            return Response({"error": "Không có quyền"}, status=403)
        nom_id = request.data.get("nomination_id")
        try:
            nom = PromotionNomination.objects.get(pk=nom_id)
        except PromotionNomination.DoesNotExist:
            return Response({"error": "Không tìm thấy hồ sơ"}, status=404)
        if nom.status not in ("draft", "submitted"):
            return Response({"error": "Không thể sửa hồ sơ ở trạng thái này"}, status=400)

        def _get_pos(fid):
            try:
                return JobPosition.objects.get(pk=fid) if fid else None
            except JobPosition.DoesNotExist:
                return None

        def _get_dept(fid):
            try:
                return Department.objects.get(pk=fid) if fid else None
            except Department.DoesNotExist:
                return None

        for field, val in [
            ("nomination_reason", request.data.get("nomination_reason")),
            ("expected_date", request.data.get("expected_date") or None),
            ("proposed_job_position", _get_pos(request.data.get("proposed_job_position_id"))),
            ("proposed_department", _get_dept(request.data.get("proposed_department_id"))),
        ]:
            if val is not None or field in ("expected_date",):
                setattr(nom, field, val)
        nom.save()
        return Response({"ok": True})

    def _act_submit_nomination(self, request):
        from promotion.models import PromotionNomination, PromotionApprovalStep
        if not self._can_manage(request):
            return Response({"error": "Không có quyền"}, status=403)
        nom_id = request.data.get("nomination_id")
        try:
            nom = PromotionNomination.objects.get(pk=nom_id)
        except PromotionNomination.DoesNotExist:
            return Response({"error": "Không tìm thấy hồ sơ"}, status=404)
        if nom.status != "draft":
            return Response({"error": "Chỉ có thể submit hồ sơ ở trạng thái Nháp"}, status=400)
        steps_data = request.data.get("steps", [])
        if not steps_data:
            return Response({"error": "Cần ít nhất 1 bước phê duyệt"}, status=400)
        nom.approval_steps.all().delete()
        for i, s in enumerate(steps_data, start=1):
            approver_id = s.get("approver_id")
            try:
                approver = Employee.objects.get(pk=approver_id, is_active=True)
            except Employee.DoesNotExist:
                return Response({"error": f"Người phê duyệt {approver_id} không tồn tại"}, status=404)
            PromotionApprovalStep.objects.create(
                nomination=nom,
                approver=approver,
                role=s.get("role", "other"),
                order=i,
                status="pending",
            )
        nom.status = "submitted"
        nom.save()
        return Response({"ok": True, "status": nom.status})

    def _act_approve_step(self, request):
        from promotion.models import PromotionApprovalStep
        import django.utils.timezone as tz
        emp = self._emp(request)
        if not emp:
            return Response({"error": "Không xác định được nhân viên"}, status=400)
        step_id = request.data.get("step_id")
        decision = request.data.get("decision", "approved")
        comment = request.data.get("comment", "")
        try:
            step = PromotionApprovalStep.objects.select_related("nomination").get(pk=step_id, approver=emp)
        except PromotionApprovalStep.DoesNotExist:
            return Response({"error": "Không tìm thấy bước phê duyệt"}, status=404)
        if step.status != "pending":
            return Response({"error": "Bước này đã được xử lý"}, status=400)
        step.status = decision
        step.comment = comment
        step.decided_at = tz.now()
        step.save()
        nom = step.nomination
        if decision == "rejected":
            nom.status = "rejected"
            nom.save()
        else:
            all_steps = nom.approval_steps.all()
            if all(s.status == "approved" for s in all_steps):
                nom.status = "approved"
                nom.save()
            else:
                nom.status = "reviewing"
                nom.save()
        return Response({"ok": True, "nomination_status": nom.status})

    def _act_decide(self, request):
        from promotion.models import PromotionNomination
        import django.utils.timezone as tz
        if not self._can_manage(request):
            return Response({"error": "Không có quyền"}, status=403)
        nom_id = request.data.get("nomination_id")
        try:
            nom = PromotionNomination.objects.get(pk=nom_id)
        except PromotionNomination.DoesNotExist:
            return Response({"error": "Không tìm thấy hồ sơ"}, status=404)
        if nom.status != "approved":
            return Response({"error": "Hồ sơ chưa được phê duyệt đầy đủ"}, status=400)
        effective_date = request.data.get("effective_date")
        decision_notes = request.data.get("decision_notes", "")
        nom.effective_date = effective_date or None
        nom.decision_notes = decision_notes
        nom.status = "decided"
        nom.save()
        return Response({"ok": True})

    def _act_create_announcement(self, request):
        from promotion.models import PromotionNomination, PromotionAnnouncement
        if not self._can_manage(request):
            return Response({"error": "Không có quyền"}, status=403)
        emp = self._emp(request)
        nom_id = request.data.get("nomination_id")
        title = (request.data.get("title") or "").strip()
        content = (request.data.get("content") or "").strip()
        if not all([nom_id, title, content]):
            return Response({"error": "Thiếu thông tin"}, status=400)
        try:
            nom = PromotionNomination.objects.get(pk=nom_id)
        except PromotionNomination.DoesNotExist:
            return Response({"error": "Không tìm thấy hồ sơ"}, status=404)
        if nom.status != "decided":
            return Response({"error": "Hồ sơ chưa được quyết định"}, status=400)
        ann, created = PromotionAnnouncement.objects.get_or_create(
            nomination=nom,
            defaults={"title": title, "content": content, "created_by": emp},
        )
        if not created:
            ann.title = title
            ann.content = content
            ann.save()
        return Response({"ok": True, "id": ann.id, "created": created})

    def _act_publish_announcement(self, request):
        from promotion.models import PromotionAnnouncement, PromotionNomination
        import django.utils.timezone as tz
        if not self._can_manage(request):
            return Response({"error": "Không có quyền"}, status=403)
        ann_id = request.data.get("announcement_id")
        try:
            ann = PromotionAnnouncement.objects.select_related("nomination").get(pk=ann_id)
        except PromotionAnnouncement.DoesNotExist:
            return Response({"error": "Không tìm thấy thông báo"}, status=404)
        ann.is_published = True
        ann.published_at = tz.now()
        ann.save()
        ann.nomination.status = "announced"
        ann.nomination.save()
        return Response({"ok": True, "published_at": ann.published_at.strftime("%d/%m/%Y %H:%M")})


# ─── Ten-Day Schedule (Home Widget) ────────────────────────────────────────────

class TenDayScheduleView(APIView):
    """
    GET /api/employee/me/ten-day-schedule/
    Returns today + 9 days with shift info, leave, meetings, and day labels.
    Each day: date, day_type (office/leave/off/trip/event), leave_type,
              shift_start, meetings (list of {title,start,end,meet_url,slots})
    """

    permission_classes = [IsAuthenticated]

    # 8 business time slots: 4 morning + 4 afternoon
    SLOTS = [
        (8, 0, 9, 0),    # 08:00–09:00
        (9, 0, 10, 0),   # 09:00–10:00
        (10, 0, 11, 0),  # 10:00–11:00
        (11, 0, 12, 0),  # 11:00–12:00
        (13, 30, 14, 30),# 13:30–14:30
        (14, 30, 15, 30),# 14:30–15:30
        (15, 30, 16, 30),# 15:30–16:30
        (16, 30, 17, 30),# 16:30–17:30
    ]

    def _meeting_slots(self, start_local, duration_min):
        """Return set of slot indices (0-7) that overlap with a meeting."""
        from datetime import timedelta as td
        end_local = start_local + td(minutes=duration_min)
        sh, sm = start_local.hour, start_local.minute
        eh, em = end_local.hour, end_local.minute
        busy = set()
        for i, (sh0, sm0, eh0, em0) in enumerate(self.SLOTS):
            # overlap if meeting_start < slot_end AND meeting_end > slot_start
            meet_start_min = sh * 60 + sm
            meet_end_min = eh * 60 + em
            slot_start_min = sh0 * 60 + sm0
            slot_end_min = eh0 * 60 + em0
            if meet_start_min < slot_end_min and meet_end_min > slot_start_min:
                busy.add(i)
        return busy

    def get(self, request):
        from datetime import date, timedelta
        from django.utils import timezone
        from base.models import EmployeeShiftSchedule
        from leave.models import LeaveRequest
        from eoffice.models import EmployeeDayLabel

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee record"}, status=404)

        today = date.today()
        days_out = [today + timedelta(days=i) for i in range(10)]
        date_start, date_end = days_out[0], days_out[-1]

        # ── Shift schedule ──────────────────────────────────────────────────
        wi = getattr(emp, "employee_work_info", None)
        shift = wi.shift_id if wi else None
        sched_map = {}
        if shift:
            DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            for s in EmployeeShiftSchedule.objects.filter(shift_id=shift).select_related("day"):
                sched_map[s.day.day] = {
                    "start": s.start_time.strftime("%H:%M") if s.start_time else None,
                    "end": s.end_time.strftime("%H:%M") if s.end_time else None,
                }

        # ── Leave requests ──────────────────────────────────────────────────
        leave_dates: dict = {}
        for lr in LeaveRequest.objects.filter(
            employee_id=emp, status="approved",
            start_date__lte=date_end, end_date__gte=date_start,
        ).select_related("leave_type_id"):
            d = lr.start_date
            while d <= lr.end_date:
                leave_dates[d] = lr.leave_type_id.name if lr.leave_type_id else "Nghỉ phép"
                d += timedelta(days=1)

        # ── Day labels (trip / event) ────────────────────────────────────────
        label_map: dict = {}
        for dl in EmployeeDayLabel.objects.filter(
            employee=emp, date__range=(date_start, date_end)
        ):
            label_map[dl.date] = dl.label

        # ── Google Meetings ─────────────────────────────────────────────────
        meetings_by_date: dict = {}
        try:
            from horilla_meet.models import GoogleMeeting
            tz_local = timezone.get_current_timezone()
            # Also match meetings where employee email appears in attendees
            emp_email = emp.employee_work_info.email if hasattr(emp, "employee_work_info") and emp.employee_work_info else None
            from django.db.models import Q
            q = Q(employee_id=emp)
            if emp_email:
                q |= Q(attendees__contains=emp_email)
            start_dt = timezone.make_aware(
                __import__("datetime").datetime.combine(date_start, __import__("datetime").time.min), tz_local
            )
            end_dt = timezone.make_aware(
                __import__("datetime").datetime.combine(date_end, __import__("datetime").time(23, 59, 59)), tz_local
            )
            for m in GoogleMeeting.objects.filter(q, start_time__range=(start_dt, end_dt)):
                local_start = timezone.localtime(m.start_time, tz_local)
                d = local_start.date()
                slots = list(self._meeting_slots(local_start, m.duration))
                entry = {
                    "id": m.pk,
                    "title": m.title,
                    "start": local_start.strftime("%H:%M"),
                    "end": (local_start + __import__("datetime").timedelta(minutes=m.duration)).strftime("%H:%M"),
                    "meet_url": m.meet_url,
                    "slots": slots,
                }
                meetings_by_date.setdefault(d, []).append(entry)
        except Exception:
            pass

        # ── Build result ─────────────────────────────────────────────────────
        DAY_NAMES_IDX = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        WEEKDAY_VI = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]

        result = []
        for d in days_out:
            leave_type = leave_dates.get(d)
            label = label_map.get(d)
            dow = d.weekday()  # 0=Mon
            day_name = DAY_NAMES_IDX[dow]
            sched = sched_map.get(day_name, {})
            has_shift = bool(sched.get("start"))
            is_weekend = dow >= 5

            if leave_type:
                day_type = "leave"
            elif label:
                day_type = label  # "trip" or "event"
            elif has_shift:
                day_type = "office"
            else:
                day_type = "off"

            result.append({
                "date": d.isoformat(),
                "day": d.day,
                "weekday_vi": WEEKDAY_VI[dow],
                "is_today": d == today,
                "is_weekend": is_weekend,
                "day_type": day_type,
                "leave_type": leave_type,
                "shift_start": sched.get("start"),
                "shift_end": sched.get("end"),
                "meetings": meetings_by_date.get(d, []),
                "busy_slots": sorted({s for m in meetings_by_date.get(d, []) for s in m["slots"]}),
            })

        return Response({"days": result})


class DayDetailView(APIView):
    """
    GET /api/employee/me/day-detail/?date=YYYY-MM-DD
    Returns 24-hour breakdown for a specific day: meetings + tasks.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date as dt_date, datetime, time, timedelta
        from django.utils import timezone
        from eoffice.models import WorkTask

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response({"error": "No employee record"}, status=404)

        date_str = request.query_params.get("date", "")
        try:
            target_date = dt_date.fromisoformat(date_str)
        except ValueError:
            return Response({"error": "date param required (YYYY-MM-DD)"}, status=400)

        tz_local = timezone.get_current_timezone()

        # Tasks due on this date
        tasks = []
        for t in WorkTask.objects.filter(
            assigned_to=emp, due_date=target_date, is_active=True
        ).order_by("priority"):
            tasks.append({
                "id": t.pk,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "type": "task",
                "hour": None,  # tasks have no time, shown at top of day
                "url": f"/tasks/{t.pk}",
            })

        # Google Meetings on this date
        meetings = []
        try:
            from horilla_meet.models import GoogleMeeting
            from django.db.models import Q
            emp_email = emp.employee_work_info.email if hasattr(emp, "employee_work_info") and emp.employee_work_info else None
            q = Q(employee_id=emp)
            if emp_email:
                q |= Q(attendees__contains=emp_email)
            start_dt = timezone.make_aware(datetime.combine(target_date, time.min), tz_local)
            end_dt = timezone.make_aware(datetime.combine(target_date, time(23, 59, 59)), tz_local)
            for m in GoogleMeeting.objects.filter(q, start_time__range=(start_dt, end_dt)):
                local_start = timezone.localtime(m.start_time, tz_local)
                end_local = local_start + timedelta(minutes=m.duration)
                meetings.append({
                    "id": m.pk,
                    "title": m.title,
                    "status": "meeting",
                    "priority": "normal",
                    "type": "meeting",
                    "hour": local_start.hour,
                    "start": local_start.strftime("%H:%M"),
                    "end": end_local.strftime("%H:%M"),
                    "meet_url": m.meet_url,
                    "url": m.meet_url,
                })
        except Exception:
            pass

        # Organise all items into 24 buckets
        hours = []
        for h in range(24):
            hour_meetings = [m for m in meetings if m["hour"] == h]
            hours.append({
                "hour": h,
                "label": f"{h:02d}:00",
                "items": hour_meetings,
            })

        return Response({
            "date": date_str,
            "day": target_date.day,
            "weekday_vi": ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][target_date.weekday()],
            "tasks": tasks,
            "hours": hours,
        })

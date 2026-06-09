from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.filters import (
    RotatingShiftAssignFilters,
    RotatingWorkTypeAssignFilter,
    ShiftRequestFilter,
    WorkTypeRequestFilter,
)
from base.models import (
    Company,
    Department,
    EmployeeShift,
    EmployeeShiftSchedule,
    HRMConfig,
    JobPosition,
    JobRole,
    RotatingShift,
    RotatingShiftAssign,
    RotatingWorkType,
    RotatingWorkTypeAssign,
    ShiftRequest,
    WorkType,
    WorkTypeRequest,
)
from base.views import (
    is_reportingmanger,
    rotating_work_type_assign_export,
    shift_request_export,
    work_type_request_export,
)
from employee.models import Actiontype, Employee
from notifications.signals import notify

from ...api_decorators.base.decorators import (
    check_approval_status,
    manager_or_owner_permission_required,
    manager_permission_required,
    permission_required,
)
from ...api_methods.base.methods import groupby_queryset, permission_based_queryset
from ...api_serializers.base.serializers import (
    CompanySerializer,
    DepartmentSerializer,
    EmployeeShiftScheduleSerializer,
    EmployeeShiftSerializer,
    JobPositionSerializer,
    JobRoleSerializer,
    RotatingShiftAssignSerializer,
    RotatingShiftSerializer,
    RotatingWorkTypeAssignSerializer,
    RotatingWorkTypeSerializer,
    ShiftRequestSerializer,
    WorkTypeRequestSerializer,
    WorkTypeSerializer,
)


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


def individual_permssion_check(request):
    employee_id = request.GET.get("employee_id")
    employee = Employee.objects.filter(id=employee_id).first()
    if request.user.employee_get == employee:
        return True
    elif employee.employee_work_info.reporting_manager_id == request.user.employee_get:
        return True
    elif request.user.has_perm("base.view_rotatingworktypeassign"):
        return True
    return False


def _is_reportingmanger(request, instance):
    """
    If the instance have employee id field then you can use this method to know the request
    user employee is the reporting manager of the instance
    """
    manager = request.user.employee_get
    try:
        employee_work_info_manager = instance.employee_work_info.reporting_manager_id
    except Exception:
        return HttpResponse("This Employee Dont Have any work information")
    return manager == employee_work_info_manager


class JobPositionView(APIView):
    serializer_class = JobPositionSerializer
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("base.view_jobposition"))
    def get(self, request, pk=None):
        if pk:
            job_position = object_check(JobPosition, pk)
            if job_position is None:
                return Response({"error": "Job position not found "}, status=404)
            serializer = self.serializer_class(job_position)
            return Response(serializer.data, status=200)

        job_positions = JobPosition.objects.all()
        paginater = PageNumberPagination()
        page = paginater.paginate_queryset(job_positions, request)
        serializer = self.serializer_class(page, many=True)
        return paginater.get_paginated_response(serializer.data)

    @method_decorator(permission_required("base.change_jobposition"))
    def put(self, request, pk):
        job_position = object_check(JobPosition, pk)
        if job_position is None:
            return Response({"error": "Job position not found "}, status=404)
        serializer = self.serializer_class(job_position, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.add_jobposition"))
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.delete_jobposition"))
    def delete(self, request, pk):
        job_position = object_check(JobPosition, pk)
        if job_position is None:
            return Response({"error": "Job position not found "}, status=404)
        response, status_code = object_delete(JobPosition, pk)
        return Response(response, status=status_code)


class DepartmentView(APIView):
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("base.view_department"), name="dispatch")
    def get(self, request, pk=None):
        if pk:
            department = object_check(Department, pk)
            if department is None:
                return Response({"error": "Department not found "}, status=404)
            serializer = self.serializer_class(department)
            return Response(serializer.data, status=200)

        departments = Department.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(departments, request)
        serializer = self.serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @method_decorator(permission_required("base.change_department"), name="dispatch")
    def put(self, request, pk):
        department = object_check(Department, pk)
        if department is None:
            return Response({"error": "Department not found "}, status=404)
        serializer = self.serializer_class(department, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.add_department"), name="dispatch")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.delete_department"), name="dispatch")
    def delete(self, request, pk):
        department = object_check(Department, pk)
        if department is None:
            return Response({"error": "Department not found "}, status=404)
        response, status_code = object_delete(Department, pk)
        return Response(response, status=status_code)


class JobRoleView(APIView):
    serializer_class = JobRoleSerializer
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("base.view_jobrole"), name="dispatch")
    def get(self, request, pk=None):
        if pk:
            job_role = object_check(JobRole, pk)
            if job_role is None:
                return Response({"error": "Job role not found "}, status=404)
            serializer = self.serializer_class(job_role)
            return Response(serializer.data, status=200)

        job_roles = JobRole.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(job_roles, request)
        serializer = self.serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @method_decorator(permission_required("base.change_jobrole"), name="dispatch")
    def put(self, request, pk):
        job_role = object_check(JobRole, pk)
        if job_role is None:
            return Response({"error": "Job role not found "}, status=404)
        serializer = self.serializer_class(job_role, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.add_jobrole"), name="dispatch")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.delete_jobrole"), name="dispatch")
    def delete(self, request, pk):
        job_role = object_check(JobRole, pk)
        if job_role is None:
            return Response({"error": "Job role not found "}, status=404)
        response, status_code = object_delete(JobRole, pk)
        return Response(response, status=status_code)


class CompanyView(APIView):
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("base.view_company"), name="dispatch")
    def get(self, request, pk=None):
        if pk:
            company = object_check(Company, pk)
            if company is None:
                return Response({"error": "Company not found "}, status=404)
            serializer = self.serializer_class(company)
            return Response(serializer.data, status=200)

        companies = Company.objects.all()
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(companies, request)
        serializer = self.serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @method_decorator(permission_required("base.change_company"), name="dispatch")
    def put(self, request, pk):
        company = object_check(Company, pk)
        if company is None:
            return Response({"error": "Company not found "}, status=404)
        serializer = self.serializer_class(company, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.add_company"), name="dispatch")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.delete_company"), name="dispatch")
    def delete(self, request, pk):
        company = object_check(Company, pk)
        if company is None:
            return Response({"error": "Company not found "}, status=400)
        response, status_code = object_delete(Company, pk)
        return Response(response, status=status_code)


class WorkTypeView(APIView):
    serializer_class = WorkTypeSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            work_type = object_check(WorkType, pk)
            if work_type is None:
                return Response({"error": "WorkType not found"}, status=404)
            serializer = self.serializer_class(work_type)
            return Response(serializer.data, status=200)

        work_types = WorkType.objects.all()
        serializer = self.serializer_class(work_types, many=True)
        return Response(serializer.data)

    @method_decorator(permission_required("base.add_worktype"), name="dispatch")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.change_worktype"), name="dispatch")
    def put(self, request, pk):
        work_type = object_check(WorkType, pk)
        if work_type is None:
            return Response({"error": "WorkType not found"}, status=404)
        serializer = self.serializer_class(work_type, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.delete_worktype"), name="dispatch")
    def delete(self, request, pk):
        work_type = object_check(WorkType, pk)
        if work_type is None:
            return Response({"error": "WorkType not found"}, status=404)
        response, status_code = object_delete(WorkType, pk)
        return Response(response, status=status_code)


class WorkTypeRequestView(APIView):
    serializer_class = WorkTypeRequestSerializer
    filterset_class = WorkTypeRequestFilter
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = WorkTypeRequest.objects.all()
        user = request.user
        # checking user level permissions
        perm = "base.view_worktyperequest"
        queryset = permission_based_queryset(user, perm, queryset, user_obj=True)
        return queryset

    def get(self, request, pk=None):
        # individual object workflow
        if pk:
            work_type_request = object_check(WorkTypeRequest, pk)
            if work_type_request is None:
                return Response({"error": "WorkTypeRequest not found"}, status=404)
            serializer = self.serializer_class(work_type_request)
            return Response(serializer.data, status=200)
        # permission based queryset
        work_type_requests = self.get_queryset(request)
        # filtering queryset
        work_type_request_filter_queryset = self.filterset_class(
            request.GET, queryset=work_type_requests
        ).qs
        # groupby workflow
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(
                request, url, field_name, work_type_request_filter_queryset
            )
        # pagination workflow
        paginater = PageNumberPagination()
        page = paginater.paginate_queryset(work_type_request_filter_queryset, request)
        serializer = self.serializer_class(page, many=True)
        return paginater.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            instance = serializer.save()
            try:
                notify.send(
                    instance.employee_id,
                    recipient=(
                        instance.employee_id.employee_work_info.reporting_manager_id.employee_user_id
                    ),
                    verb=f"You have new work type request to \
                                validate for {instance.employee_id}",
                    verb_ar=f"لديك طلب نوع وظيفة جديد للتحقق من \
                                {instance.employee_id}",
                    verb_de=f"Sie haben eine neue Arbeitstypanfrage zur \
                                Validierung für {instance.employee_id}",
                    verb_es=f"Tiene una nueva solicitud de tipo de trabajo para \
                                validar para {instance.employee_id}",
                    verb_fr=f"Vous avez une nouvelle demande de type de travail\
                                à valider pour {instance.employee_id}",
                    icon="information",
                    redirect=f"/employee/work-type-request-view?id={instance.id}",
                    api_redirect=f"/api/base/worktype-requests/{instance.id}",
                )
            except Exception:
                pass
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @check_approval_status(WorkTypeRequest, "base.change_worktyperequest")
    @manager_or_owner_permission_required(
        WorkTypeRequest, "base.change_worktyperequest"
    )
    def put(self, request, pk):
        work_type_request = object_check(WorkTypeRequest, pk)
        if work_type_request is None:
            return Response({"error": "WorkTypeRequest not found"}, status=404)
        serializer = self.serializer_class(work_type_request, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @check_approval_status(WorkTypeRequest, "base.change_worktyperequest")
    @manager_or_owner_permission_required(
        WorkTypeRequest, "base.delete_worktyperequest"
    )
    def delete(self, request, pk):
        work_type_request = object_check(WorkTypeRequest, pk)
        if work_type_request is None:
            return Response({"error": "WorkTypeRequest not found"}, status=404)
        response, status_code = object_delete(WorkTypeRequest, pk)
        return Response(response, status=status_code)


class WorkTypeRequestCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        work_type_request = WorkTypeRequest.find(pk)
        is_manager = is_reportingmanger(request, work_type_request) is True
        is_own_unapproved = (
            work_type_request.employee_id == request.user.employee_get
            and not work_type_request.approved
        )
        if (
            is_manager
            or request.user.has_perm("base.cancel_worktyperequest")
            or is_own_unapproved
        ):
            work_type_request.canceled = True
            work_type_request.approved = False
            work_type_request.employee_id.employee_work_info.work_type_id = (
                work_type_request.previous_work_type_id
            )
            work_type_request.employee_id.employee_work_info.save()
            work_type_request.save()
            try:
                notify.send(
                    request.user.employee_get,
                    recipient=work_type_request.employee_id.employee_user_id,
                    verb="Your work type request has been rejected.",
                    verb_ar="تم إلغاء طلب نوع وظيفتك",
                    verb_de="Ihre Arbeitstypanfrage wurde storniert",
                    verb_es="Su solicitud de tipo de trabajo ha sido cancelada",
                    verb_fr="Votre demande de type de travail a été annulée",
                    redirect=f"/employee/work-type-request-view?id={work_type_request.id}",
                    icon="close",
                    api_redirect=f"/api/base/worktype-requests/{work_type_request.id}/",
                )
            except:
                pass
            return Response({"status": "canceled"}, status=200)
        return Response({"error": "You don't have permission"}, status=403)


class WorkRequestApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        work_type_request = WorkTypeRequest.find(pk)
        is_manager = is_reportingmanger(request, work_type_request) is True
        if (
            is_manager
            or request.user.has_perm("base.approve_worktyperequest")
            or request.user.has_perm("base.change_worktyperequest")
        ):
            if work_type_request.approved:
                return Response({"error": "Already approved"}, status=400)
            if work_type_request.is_any_work_type_request_exists():
                return Response(
                    {"error": "Another work type request already exists for this period"},
                    status=400,
                )
            work_type_request.approved = True
            work_type_request.canceled = False
            work_type_request.save()
            try:
                notify.send(
                    request.user.employee_get,
                    recipient=work_type_request.employee_id.employee_user_id,
                    verb="Your work type request has been approved.",
                    verb_ar="تمت الموافقة على طلب نوع وظيفتك.",
                    verb_de="Ihre Arbeitstypanfrage wurde genehmigt.",
                    verb_es="Su solicitud de tipo de trabajo ha sido aprobada.",
                    verb_fr="Votre demande de type de travail a été approuvée.",
                    redirect=f"/employee/work-type-request-view?id={work_type_request.id}",
                    icon="checkmark",
                    api_redirect=f"/api/base/worktype-requests/{work_type_request.id}/",
                )
            except:
                pass
            return Response({"status": "approved"}, status=200)
        return Response({"error": "You don't have permission"}, status=403)


class WorkTypeRequestExport(APIView):
    permission_classes = [IsAuthenticated]

    @manager_permission_required("base.view_worktyperequest")
    def get(self, request):
        return work_type_request_export(request)


class IndividualRotatingWorktypesView(APIView):
    serializer_class = RotatingWorkTypeAssignSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if individual_permssion_check(request) == False:
            return Response({"error": "you have no permssion to view"}, status=400)
        if pk:
            rotating_work_type_assign = object_check(RotatingWorkTypeAssign, pk)
            if rotating_work_type_assign is None:
                return Response(
                    {"error": "RotatingWorkTypeAssign not found"}, status=404
                )
            serializer = self.serializer_class(rotating_work_type_assign)
            return Response(serializer.data, status=200)
        employee_id = request.GET.get("employee_id", None)
        rotating_work_type_assigns = RotatingWorkTypeAssign.objects.filter(
            employee_id=employee_id
        )
        pagenation = PageNumberPagination()
        page = pagenation.paginate_queryset(rotating_work_type_assigns, request)
        serializer = self.serializer_class(page, many=True)
        return pagenation.get_paginated_response(serializer.data)


class RotatingWorkTypeAssignView(APIView):
    serializer_class = RotatingWorkTypeAssignSerializer
    filterset_class = RotatingWorkTypeAssignFilter
    permission_classes = [IsAuthenticated]

    def _permission_check(self, request, obj=None, pk=None):
        if pk:
            employee = request.user.employee_get
            manager = obj.employee_id.get_reporting_manager()
            if (
                employee == obj.employee_id
                or manager == employee
                or request.user.has_perm("base.view_rotatingworktypeassign")
            ):
                return True
            return False

    @manager_permission_required("base.view_rotatingworktypeassign")
    def get(self, request, pk=None):

        if pk:

            rotating_work_type_assign = object_check(RotatingWorkTypeAssign, pk)
            if rotating_work_type_assign is None:
                return Response(
                    {"error": "RotatingWorkTypeAssign not found"}, status=404
                )
            serializer = self.serializer_class(rotating_work_type_assign)
            return Response(serializer.data, status=200)
        rotating_work_type_assigns = RotatingWorkTypeAssign.objects.all()
        rotating_work_type_assigns_filter_queryset = self.filterset_class(
            request.GET, queryset=rotating_work_type_assigns
        ).qs
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            # groupby workflow
            url = request.build_absolute_uri()
            return groupby_queryset(
                request, url, field_name, rotating_work_type_assigns_filter_queryset
            )

        pagenation = PageNumberPagination()
        page = pagenation.paginate_queryset(
            rotating_work_type_assigns_filter_queryset, request
        )
        serializer = self.serializer_class(page, many=True)
        return pagenation.get_paginated_response(serializer.data)

    @manager_permission_required("base.add_rotatingworktypeassign")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            obj = serializer.save()
            try:
                users = [employee.employee_user_id for employee in obj]
                notify.send(
                    request.user.employee_get,
                    recipient=users,
                    verb="You are added to rotating work type",
                    verb_ar="تمت إضافتك إلى نوع العمل المتناوب",
                    verb_de="Sie werden zum rotierenden Arbeitstyp hinzugefügt",
                    verb_es="Se le agrega al tipo de trabajo rotativo",
                    verb_fr="Vous êtes ajouté au type de travail rotatif",
                    icon="infinite",
                    redirect="/employee/employee-profile/",
                    api_redirect="",
                )
            except:
                pass
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @manager_permission_required("base.change_rotatingworktypeassign")
    def put(self, request, pk):
        rotating_work_type_assign = object_check(RotatingWorkTypeAssign, pk)
        if rotating_work_type_assign is None:
            return Response({"error": "RotatingWorkTypeAssign not found"}, status=404)
        serializer = self.serializer_class(rotating_work_type_assign, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @manager_permission_required("base.delete_rotatingworktypeassign")
    def delete(self, request, pk):
        rotating_work_type_assign = object_check(RotatingWorkTypeAssign, pk)
        if rotating_work_type_assign is None:
            return Response({"error": "RotatingWorkTypeAssign not found"}, status=404)
        response, status_code = object_delete(RotatingWorkTypeAssign, pk)
        return Response(response, status=status_code)


class IndividualWorkTypeRequestView(APIView):
    serializer_class = WorkTypeRequestSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if individual_permssion_check(request) == False:
            return Response({"error": "you have no permssion to view"}, status=400)

        # individual object workflow
        if pk:
            work_type_request = object_check(WorkTypeRequest, pk)
            if work_type_request is None:
                return Response({"error": "WorkTypeRequest not found"}, status=404)
            serializer = self.serializer_class(work_type_request)
            return Response(serializer.data, status=200)
        employee_id = request.GET.get("employee_id", None)
        work_type_request = WorkTypeRequest.objects.filter(employee_id=employee_id)
        paginater = PageNumberPagination()
        page = paginater.paginate_queryset(work_type_request, request)
        serializer = self.serializer_class(page, many=True)
        return paginater.get_paginated_response(serializer.data)


class EmployeeShiftView(APIView):
    serializer_class = EmployeeShiftSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            employee_shift = object_check(EmployeeShift, pk)
            if employee_shift is None:
                return Response({"error": "EmployeeShift not found"}, status=404)
            serializer = self.serializer_class(employee_shift)
            return Response(serializer.data, status=200)

        employee_shifts = EmployeeShift.objects.all()
        serializer = self.serializer_class(employee_shifts, many=True)
        return Response(serializer.data, status=200)

    @method_decorator(permission_required("base.add_employeeshift"), name="dispatch")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.change_employeeshift"), name="dispatch")
    def put(self, request, pk):
        employee_shift = object_check(EmployeeShift, pk)
        if employee_shift is None:
            return Response({"error": "EmployeeShift not found"}, status=404)
        serializer = self.serializer_class(employee_shift, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.delete_employeeshift"), name="dispatch")
    def delete(self, request, pk):
        employee_shift = object_check(EmployeeShift, pk)
        if employee_shift is None:
            return Response({"error": "EmployeeShift not found"}, status=404)
        response, status_code = object_delete(EmployeeShift, pk)
        return Response(response, status=status_code)


class EmployeeShiftScheduleView(APIView):
    serializer_class = EmployeeShiftScheduleSerializer
    permission_classes = [IsAuthenticated]

    @method_decorator(
        permission_required("base.view_employeeshiftschedule"), name="dispatch"
    )
    def get(self, request, pk=None):
        if pk:
            employee_shift_schedule = object_check(EmployeeShiftSchedule, pk)
            if employee_shift_schedule is None:
                return Response(
                    {"error": "EmployeeShiftSchedule not found"}, status=404
                )
            serializer = self.serializer_class(employee_shift_schedule)
            return Response(serializer.data, status=200)

        employee_shift_schedules = EmployeeShiftSchedule.objects.all()
        serializer = self.serializer_class(employee_shift_schedules, many=True)
        return Response(serializer.data, status=200)

    @method_decorator(
        permission_required("base.add_employeeshiftschedule"), name="dispatch"
    )
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("base.change_employeeshiftschedule"), name="dispatch"
    )
    def put(self, request, pk):
        employee_shift_schedule = object_check(EmployeeShiftSchedule, pk)
        if employee_shift_schedule is None:
            return Response({"error": "EmployeeShiftSchedule not found"}, status=404)
        serializer = self.serializer_class(employee_shift_schedule, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("base.delete_employeeshiftschedule"), name="dispatch"
    )
    def delete(self, request, pk):
        employee_shift_schedule = object_check(EmployeeShiftSchedule, pk)
        if employee_shift_schedule is None:
            return Response({"error": "EmployeeShiftSchedule not found"}, status=404)
        response, status_code = object_delete(EmployeeShiftSchedule, pk)
        return Response(response, status=status_code)


class RotatingShiftView(APIView):
    serializer_class = RotatingShiftSerializer
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("base.view_rotatingshift"), name="dispatch")
    def get(self, request, pk=None):

        if pk:
            rotating_shift = object_check(RotatingShift, pk)
            if rotating_shift is None:
                return Response({"error": "RotatingShift not found"}, status=404)
            serializer = self.serializer_class(rotating_shift)
            return Response(serializer.data, status=200)

        employee_id = request.GET.get(
            "employee_id"
        )  # Get the employee_id from query parameters
        if employee_id:  # Check if employee_ids are present in the request
            rotating_shifts = RotatingShift.objects.filter(
                employee_id__in=[employee_id]
            )

        rotating_shifts = RotatingShift.objects.all()
        serializer = self.serializer_class(rotating_shifts, many=True)
        return Response(serializer.data, status=200)

    @method_decorator(permission_required("base.add_rotatingshift"), name="dispatch")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.change_rotatingshift"), name="dispatch")
    def put(self, request, pk):
        rotating_shift = object_check(RotatingShift, pk)
        if rotating_shift is None:
            return Response({"error": "RotatingShift not found"}, status=404)
        serializer = self.serializer_class(rotating_shift, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("base.delete_rotatingshift"), name="dispatch")
    def delete(self, request, pk):
        rotating_shift = object_check(RotatingShift, pk)
        if rotating_shift is None:
            return Response({"error": "RotatingShift not found"}, status=404)
        response, status_code = object_delete(RotatingShift, pk)
        return Response(response, status=status_code)


class IndividualRotatingShiftView(APIView):
    serializer_class = RotatingShiftAssignSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if individual_permssion_check(request) == False:
            return Response({"error": "you have no permssion to view"}, status=400)

        if pk:
            rotating_shift_assign = object_check(RotatingShiftAssign, pk)
            if rotating_shift_assign is None:
                return Response({"error": "RotatingShiftAssign not found"}, status=404)
            serializer = self.serializer_class(rotating_shift_assign)
            return Response(serializer.data, status=200)
        employee_id = request.GET.get("employee_id", None)
        rotating_shift_assigns = RotatingShiftAssign.objects.filter(
            employee_id=employee_id
        )

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(rotating_shift_assigns, request)
        serializer = self.serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class RotatingShiftAssignView(APIView):
    serializer_class = RotatingShiftAssignSerializer
    filterset_class = RotatingShiftAssignFilters
    permission_classes = [IsAuthenticated]

    @manager_permission_required("base.view_rotatingshiftassign")
    def get(self, request, pk=None):
        if pk:
            rotating_shift_assign = object_check(RotatingShiftAssign, pk)
            if rotating_shift_assign is None:
                return Response({"error": "RotatingShiftAssign not found"}, status=404)
            serializer = self.serializer_class(rotating_shift_assign)
            return Response(serializer.data, status=200)

        rotating_shift_assigns = RotatingShiftAssign.objects.all()
        rotating_shift_assigns_filter_queryset = self.filterset_class(
            request.GET, queryset=rotating_shift_assigns
        ).qs
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            # groupby workflow
            url = request.build_absolute_uri()
            return groupby_queryset(
                request, url, field_name, rotating_shift_assigns_filter_queryset
            )

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(
            rotating_shift_assigns_filter_queryset, request
        )
        serializer = self.serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @manager_permission_required("base.add_rotatingshiftassign")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @manager_permission_required("base.change_rotatingshiftassign")
    def put(self, request, pk):
        rotating_shift_assign = object_check(RotatingShiftAssign, pk)
        if rotating_shift_assign is None:
            return Response({"error": "RotatingShiftAssign not found"}, status=404)
        serializer = self.serializer_class(rotating_shift_assign, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @manager_permission_required("base.delete_rotatingshiftassign")
    def delete(self, request, pk):
        rotating_shift_assign = object_check(RotatingShiftAssign, pk)
        if rotating_shift_assign is None:
            return Response({"error": "RotatingShiftAssign not found"}, status=404)
        response, status_code = object_delete(RotatingShiftAssign, pk)
        return Response(response, status=status_code)


class IndividualShiftRequestView(APIView):
    serializer_class = ShiftRequestSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if individual_permssion_check(request) == False:
            return Response({"error": "you have no permssion to view"}, status=400)

        if pk:
            shift_request = object_check(ShiftRequest, pk)
            if shift_request is None:
                return Response({"error": "EmployeeShift not found"}, status=404)
            serializer = self.serializer_class(shift_request)
            return Response(serializer.data, status=200)
        employee_id = request.GET.get("employee_id", None)
        shift_requests = ShiftRequest.objects.filter(employee_id=employee_id)
        paginater = PageNumberPagination()
        page = paginater.paginate_queryset(shift_requests, request)
        serializer = self.serializer_class(page, many=True)
        return paginater.get_paginated_response(serializer.data)


class ShiftRequestView(APIView):
    serializer_class = ShiftRequestSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = ShiftRequestFilter
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = ShiftRequest.objects.all()
        user = request.user
        # checking user level permissions
        perm = "base.view_shiftrequest"
        queryset = permission_based_queryset(user, perm, queryset, user_obj=True)
        return queryset

    def get(self, request, pk=None):
        # individual section
        if pk:
            shift_request = object_check(ShiftRequest, pk)
            if shift_request is None:
                return Response({"error": "ShiftRequest not found"}, status=404)
            serializer = self.serializer_class(shift_request)
            return Response(serializer.data, status=200)
        # filter section
        shift_requests = self.get_queryset(request)
        shift_requests_filter_queryset = self.filterset_class(
            request.GET, queryset=shift_requests
        ).qs
        # groupby section
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(
                request, url, field_name, shift_requests_filter_queryset
            )
        # pagination section
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(shift_requests_filter_queryset, request)
        serializer = self.serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @check_approval_status(ShiftRequest, "base.change_shiftrequest")
    @manager_or_owner_permission_required(ShiftRequest, "base.change_shiftrequest")
    def put(self, request, pk):
        shift_request = object_check(ShiftRequest, pk)
        if shift_request is None:
            return Response({"error": "ShiftRequest not found"}, status=404)
        serializer = self.serializer_class(shift_request, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @check_approval_status(ShiftRequest, "base.delete_shiftrequest")
    @manager_or_owner_permission_required(ShiftRequest, "base.delete_shiftrequest")
    def delete(self, request, pk):
        shift_request = object_check(ShiftRequest, pk)
        if shift_request is None:
            return Response({"error": "ShiftRequest not found"}, status=404)
        response, status_code = object_delete(ShiftRequest, pk)
        return Response(response, status=status_code)


class RotatingWorkTypeView(APIView):
    serializer_class = RotatingWorkTypeSerializer
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("base.view_rotatingworktype"))
    def get(self, request, pk=None):
        if pk:
            rotating_work_type = object_check(RotatingWorkType, pk)
            if rotating_work_type is None:
                return Response({"error": "RotatingWorkType not found"}, status=404)
            serializer = self.serializer_class(rotating_work_type)
            return Response(serializer.data, status=200)

        rotating_work_types = RotatingWorkType.objects.all()
        serializer = self.serializer_class(rotating_work_types, many=True)
        return Response(serializer.data, status=200)

    @method_decorator(permission_required("base.add_rotatingworktype"), name="dispatch")
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("base.change_rotatingworktype"), name="dispatch"
    )
    def put(self, request, pk):
        rotating_work_type = object_check(RotatingWorkType, pk)
        if rotating_work_type is None:
            return Response({"error": "RotatingWorkType not found"}, status=404)
        serializer = self.serializer_class(rotating_work_type, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(
        permission_required("base.delete_rotatingworktype"), name="dispatch"
    )
    def delete(self, request, pk):
        rotating_work_type = object_check(RotatingWorkType, pk)
        if rotating_work_type is None:
            return Response({"error": "RotatingWorkType not found"}, status=404)
        response, status_code = object_delete(RotatingWorkType, pk)
        return Response(response, status=status_code)


class ShiftRequestApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        shift_request = ShiftRequest.objects.get(id=pk)
        is_manager = is_reportingmanger(request, shift_request) is True
        if (
            is_manager
            or request.user.has_perm("base.approve_shiftrequest")
            or request.user.has_perm("base.change_shiftrequest")
        ):
            if shift_request.approved:
                return Response({"error": "Already approved"}, status=400)
            if shift_request.is_any_request_exists():
                return Response(
                    {"error": "Already request exists on same date"}, status=400
                )
            shift_request.approved = True
            shift_request.canceled = False
            shift_request.save()
            return Response({"status": "success"}, status=200)
        return Response({"error": "No permission"}, status=403)


class ShiftRequestBulkApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ids = request.data["ids"]
        length = len(ids)
        count = 0
        for id in ids:
            shift_request = ShiftRequest.objects.get(id=id)
            is_manager = is_reportingmanger(request, shift_request) is True
            if (
                is_manager
                or request.user.has_perm("base.approve_shiftrequest")
                or request.user.has_perm("base.change_shiftrequest")
            ):
                if not shift_request.approved:
                    shift_request.approved = True
                    shift_request.canceled = False
                    employee_work_info = shift_request.employee_id.employee_work_info
                    employee_work_info.shift_id = shift_request.shift_id
                    employee_work_info.save()
                    shift_request.save()
                count += 1
        if length == count:
            return Response({"status": "success"}, status=200)
        return Response({"status": "failed"}, status=400)


class ShiftRequestCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        shift_request = ShiftRequest.objects.get(id=pk)
        is_manager = is_reportingmanger(request, shift_request) is True
        is_own_unapproved = (
            shift_request.employee_id == request.user.employee_get
            and not shift_request.approved
        )
        if (
            is_manager
            or request.user.has_perm("base.cancel_shiftrequest")
            or is_own_unapproved
        ):
            shift_request.canceled = True
            shift_request.approved = False
            shift_request.employee_id.employee_work_info.shift_id = (
                shift_request.previous_shift_id
            )
            shift_request.employee_id.employee_work_info.save()
            shift_request.save()
            return Response({"status": "success"}, status=200)
        return Response({"error": "No permission"}, status=403)


class ShiftRequestBulkCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ids = request.data.get("ids", None)
        length = len(ids)
        count = 0
        for id in ids:
            shift_request = ShiftRequest.objects.get(id=id)
            is_manager = is_reportingmanger(request, shift_request) is True
            is_own_unapproved = (
                shift_request.employee_id == request.user.employee_get
                and not shift_request.approved
            )
            if (
                is_manager
                or request.user.has_perm("base.cancel_shiftrequest")
                or is_own_unapproved
            ):
                shift_request.canceled = True
                shift_request.approved = False
                shift_request.employee_id.employee_work_info.shift_id = (
                    shift_request.previous_shift_id
                )
                shift_request.employee_id.employee_work_info.save()
                shift_request.save()
                count += 1
        if length == count:
            return Response({"status": "success"}, status=200)
        return Response({"status": "failed"}, status=400)


class ShiftRequestDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk=None):

        if pk is None:
            try:
                ids = request.data["ids"]
                shift_requests = ShiftRequest.objects.filter(id__in=ids)
                shift_requests.delete()
            except Exception as e:
                return Response({"status": "failed", "error": str(e)}, status=400)
            return Response({"status": "success"}, status=200)
        try:
            shift_request = ShiftRequest.objects.get(id=pk)
            if not shift_request.approved:
                raise
            shift_request.delete()

        except ShiftRequest.DoesNotExist:
            return Response(
                {"status": "failed", "error": "Shift request does not exists"},
                status=400,
            )
        return Response({"status": "deleted"}, status=200)


class ShiftRequestExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return shift_request_export(request)


class ShiftRequestAllocationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        shift_request = ShiftRequest.objects.get(id=id)
        if not shift_request.is_any_request_exists():
            shift_request.reallocate_approved = True
            shift_request.reallocate_canceled = False
            shift_request.save()
            return Response({"status": "success"}, status=200)
        return Response({"status": "failed"}, status=400)


class RotatingShiftAssignExport(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return rotating_work_type_assign_export(request)


class RotatingShiftAssignBulkArchive(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, status):
        ids = request.data.get("ids", None)
        try:
            rotating_shift_asssign = RotatingShiftAssign.objects.filter(id__in=ids)
            rotating_shift_asssign.update(is_active=status)
            return Response({"status": "success"}, status=200)
        except Exception as E:
            return Response({"error": str(E)}, status=400)


class RotatingShiftAssignBulkDelete(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        ids = request.data.get("ids", None)
        try:
            rotating_shift_asssign = RotatingShiftAssign.objects.filter(id__in=ids)
            rotating_shift_asssign.delete()
            return Response({"status": "success"}, status=200)
        except Exception as E:
            return Response({"error": str(E)}, status=400)


class RotatingWorKTypePermissionCheck(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        manager = Employee.objects.filter(id=id).first().get_reporting_manager()
        if (
            request.user.has_perm("base.add_rotatingworktypeassign")
            or request.user.employee_get == manager
        ):
            return Response(status=200)
        return Response(status=400)


class RotatingShiftPermissionCheck(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        manager = Employee.objects.filter(id=id).first().get_reporting_manager()
        if (
            request.user.has_perm("base.add_rotatingshiftassign")
            or request.user.employee_get == manager
        ):
            return Response(status=200)
        return Response(status=400)


class WorktypeRequestApprovePermissionCheck(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, employee_id=None):
        if employee_id is None:
            employee_id = request.GET.get("employee_id")
        instance = Employee.objects.filter(id=employee_id).first()
        if (
            _is_reportingmanger(request, instance)
            or request.user.has_perm("base.approve_worktyperequest")
            or request.user.has_perm("base.change_worktyperequest")
        ):
            return Response(status=200)
        return Response(status=400)


class ShiftRequestApprovePermissionCheck(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, employee_id=None):
        if employee_id is None:
            employee_id = request.GET.get("employee_id")
        instance = Employee.objects.filter(id=employee_id).first()
        if (
            _is_reportingmanger(request, instance)
            or request.user.has_perm("approve_shiftrequest")
            or request.user.has_perm("change_shiftrequest")
        ):
            return Response(status=200)
        return Response(status=400)


class EmployeeTabPermissionCheck(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):

        instance = Employee.objects.filter(id=request.GET.get("employee_id")).first()
        if _is_reportingmanger(request, instance) or request.user.has_perms(
            [
                "view.view_worktyperequest",
                "attendance.view_shiftrequest",
                "employee.change_employee",
            ]
        ):
            return Response(status=200)
        return Response({"message": "No permission"}, status=400)


class CheckUserLevel(APIView):

    def get(self, request):
        perm = request.GET.get("perm")
        if request.user.has_perm(perm):
            return Response(status=200)
        return Response({"error": "No permission"}, status=400)


class RoleDirectoryView(APIView):
    """Rich role list for PWA with department/position info and employee count."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.contrib.auth.models import Group, Permission
        from employee.models import EmployeeWorkInformation
        from base.models import KCRoleMapping

        qs = JobRole.objects.filter(is_active=True).select_related(
            "job_position_id", "job_position_id__department_id"
        ).order_by("job_position_id__department_id__department", "job_role")

        dept = request.query_params.get("department")
        if dept:
            qs = qs.filter(job_position_id__department_id=dept)

        search = request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(job_role__icontains=search)
                | Q(job_position_id__job_position__icontains=search)
            )

        kc_map = {
            m.job_role_id: m
            for m in KCRoleMapping.objects.filter(job_role__in=qs)
        }

        results = []
        for role in qs:
            pos = role.job_position_id
            dept_obj = pos.department_id if pos else None
            emp_count = EmployeeWorkInformation.objects.filter(
                job_role_id=role, employee_id__is_active=True
            ).count()

            group = Group.objects.filter(name=role.job_role).first()
            perms = []
            if group:
                perms = list(
                    group.permissions.values_list("codename", flat=True)
                )

            mapping = kc_map.get(role.pk)
            results.append({
                "id": role.pk,
                "name": role.job_role,
                "job_position": pos.job_position if pos else None,
                "job_position_id": pos.pk if pos else None,
                "department": dept_obj.department if dept_obj else None,
                "department_id": dept_obj.pk if dept_obj else None,
                "employee_count": emp_count,
                "permissions": perms,
                "has_django_group": group is not None,
                "kc_role_id": mapping.kc_role_id if mapping else None,
                "kc_role_name": mapping.kc_role_name if mapping else None,
                "kc_synced": mapping is not None,
            })

        return Response(results)


class RolePermissionsView(APIView):
    """List all available Django permissions for assignment."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        app_labels = [
            "employee", "attendance", "leave", "payroll", "base",
            "eoffice", "recruitment", "asset",
        ]
        perms = (
            Permission.objects.filter(content_type__app_label__in=app_labels)
            .select_related("content_type")
            .order_by("content_type__app_label", "codename")
        )
        grouped = {}
        for p in perms:
            app = p.content_type.app_label
            if app not in grouped:
                grouped[app] = []
            grouped[app].append({
                "id": p.pk,
                "codename": p.codename,
                "name": p.name,
            })
        return Response(grouped)


class RoleGroupSyncView(APIView):
    """Create/update Django Group matching a JobRole and assign permissions."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.contrib.auth.models import Group, Permission

        role_id = request.data.get("role_id")
        perm_ids = request.data.get("permission_ids", [])

        role = JobRole.objects.filter(pk=role_id, is_active=True).first()
        if not role:
            return Response({"error": "Role not found"}, status=404)

        group, created = Group.objects.get_or_create(name=role.job_role)
        group.permissions.set(Permission.objects.filter(pk__in=perm_ids))

        return Response({
            "ok": True,
            "group_id": group.pk,
            "action": "created" if created else "updated",
            "permissions_count": group.permissions.count(),
        })


class KeycloakRolesView(APIView):
    """List Keycloak realm roles."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from horilla.keycloak_admin import get_realm_roles

        roles = get_realm_roles()
        if roles is None:
            return Response(
                {"error": "Keycloak not configured or unreachable"},
                status=503,
            )
        return Response(roles)


class KeycloakSyncRolesView(APIView):
    """Sync HRM JobRoles → Keycloak realm roles."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from base.models import KCRoleMapping
        from horilla.keycloak_admin import sync_all_roles

        roles = JobRole.objects.filter(is_active=True).select_related(
            "job_position_id", "job_position_id__department_id"
        )
        roles_data = []
        for r in roles:
            pos = r.job_position_id
            dept = pos.department_id if pos else None
            roles_data.append({
                "job_role_id": r.pk,
                "name": r.job_role,
                "description": f"{pos.job_position if pos else ''} - {dept.department if dept else ''}",
            })

        result = sync_all_roles(roles_data)

        if result.get("ok"):
            for m in result.get("mappings", []):
                if m.get("job_role_id") and m.get("kc_role_id"):
                    KCRoleMapping.objects.update_or_create(
                        job_role_id=m["job_role_id"],
                        defaults={
                            "kc_role_id": m["kc_role_id"],
                            "kc_role_name": m["kc_role_name"],
                        },
                    )
            result.pop("mappings", None)

        return Response(result)


class KeycloakSyncUsersView(APIView):
    """Sync HRM employees → Keycloak users."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from base.models import KCUserMapping
        from horilla.keycloak_admin import sync_all_employees

        employees = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info",
            "employee_work_info__job_role_id",
        )
        result = sync_all_employees(employees)

        if result.get("ok"):
            for m in result.get("mappings", []):
                if m.get("employee_id") and m.get("kc_user_id"):
                    KCUserMapping.objects.update_or_create(
                        employee_id=m["employee_id"],
                        defaults={
                            "kc_user_id": m["kc_user_id"],
                            "kc_username": m["kc_username"],
                        },
                    )
            result.pop("mappings", None)

        return Response(result)


class KeycloakSyncOverviewView(APIView):
    """Department-grouped roles & employees with KC sync status."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import KCRoleMapping, KCUserMapping
        from employee.models import EmployeeWorkInformation

        departments = Department.objects.filter(is_active=True).order_by("department")

        role_mappings = {m.job_role_id: m for m in KCRoleMapping.objects.all()}
        user_mappings = {m.employee_id: m for m in KCUserMapping.objects.all()}

        result = []
        for dept in departments:
            roles_qs = JobRole.objects.filter(
                job_position_id__department_id=dept, is_active=True
            ).select_related("job_position_id").order_by("job_role")

            roles_list = []
            for r in roles_qs:
                rm = role_mappings.get(r.pk)
                roles_list.append({
                    "id": r.pk,
                    "name": r.job_role,
                    "position": r.job_position_id.job_position if r.job_position_id else None,
                    "kc_synced": rm is not None,
                    "kc_role_id": rm.kc_role_id if rm else None,
                    "kc_role_name": rm.kc_role_name if rm else None,
                    "synced_at": rm.synced_at.isoformat() if rm else None,
                })

            emps_qs = Employee.objects.filter(
                employee_work_info__department_id=dept, is_active=True
            ).select_related("employee_work_info", "employee_work_info__job_role_id")

            emps_list = []
            for emp in emps_qs:
                um = user_mappings.get(emp.pk)
                wi = getattr(emp, "employee_work_info", None)
                emps_list.append({
                    "id": emp.pk,
                    "name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                    "email": emp.email,
                    "role": wi.job_role_id.job_role if wi and wi.job_role_id else None,
                    "kc_synced": um is not None,
                    "kc_user_id": um.kc_user_id if um else None,
                    "kc_username": um.kc_username if um else None,
                    "synced_at": um.synced_at.isoformat() if um else None,
                })

            result.append({
                "id": dept.pk,
                "name": dept.department,
                "roles": roles_list,
                "employees": emps_list,
            })

        return Response(result)


class KeycloakSelectiveSyncView(APIView):
    """Selective sync: specific roles or employees to Keycloak."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from base.models import KCRoleMapping, KCUserMapping
        from horilla.keycloak_admin import (
            _get_admin,
            sync_selective_employees,
            sync_selective_roles,
        )

        sync_type = request.data.get("type")  # "roles" or "users"
        ids = request.data.get("ids", [])

        if not ids:
            return Response({"error": "No items selected"}, status=400)

        admin = _get_admin()
        if not admin:
            return Response(
                {"error": "Keycloak not configured"}, status=503
            )

        if sync_type == "roles":
            roles = JobRole.objects.filter(pk__in=ids, is_active=True).select_related(
                "job_position_id", "job_position_id__department_id"
            )
            roles_data = []
            for r in roles:
                pos = r.job_position_id
                dept = pos.department_id if pos else None
                roles_data.append({
                    "job_role_id": r.pk,
                    "name": r.job_role,
                    "description": f"{pos.job_position if pos else ''} - {dept.department if dept else ''}",
                })

            result = sync_selective_roles(admin, roles_data)

            if result.get("ok"):
                for m in result.get("mappings", []):
                    if m.get("job_role_id") and m.get("kc_role_id"):
                        KCRoleMapping.objects.update_or_create(
                            job_role_id=m["job_role_id"],
                            defaults={
                                "kc_role_id": m["kc_role_id"],
                                "kc_role_name": m["kc_role_name"],
                            },
                        )
                result.pop("mappings", None)

            return Response(result)

        elif sync_type == "users":
            employees = Employee.objects.filter(
                pk__in=ids, is_active=True
            ).select_related(
                "employee_work_info",
                "employee_work_info__job_role_id",
            )

            result = sync_selective_employees(admin, employees)

            if result.get("ok"):
                for m in result.get("mappings", []):
                    if m.get("employee_id") and m.get("kc_user_id"):
                        KCUserMapping.objects.update_or_create(
                            employee_id=m["employee_id"],
                            defaults={
                                "kc_user_id": m["kc_user_id"],
                                "kc_username": m["kc_username"],
                            },
                        )
                result.pop("mappings", None)

            return Response(result)

        return Response({"error": "Invalid type, use 'roles' or 'users'"}, status=400)


class KeycloakDeleteSyncView(APIView):
    """Delete KC sync mapping and optionally delete the role on Keycloak."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from base.models import KCRoleMapping
        from horilla.keycloak_admin import _get_admin

        role_ids = request.data.get("role_ids", [])
        delete_on_kc = request.data.get("delete_on_kc", False)

        if not role_ids:
            return Response({"error": "No role_ids provided"}, status=400)

        mappings = KCRoleMapping.objects.filter(job_role_id__in=role_ids)
        deleted_mappings = 0
        deleted_kc = 0
        errors = []

        if delete_on_kc:
            admin = _get_admin()
            if not admin:
                return Response({"error": "Keycloak not configured"}, status=503)
            for m in mappings:
                try:
                    admin.delete_realm_role(m.kc_role_name)
                    deleted_kc += 1
                except Exception as exc:
                    errors.append({"role": m.kc_role_name, "error": str(exc)})

        deleted_mappings = mappings.count()
        mappings.delete()

        return Response({
            "ok": True,
            "deleted_mappings": deleted_mappings,
            "deleted_kc": deleted_kc,
            "errors": errors,
        })


class MyShiftRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response([], status=200)
        qs = ShiftRequest.objects.filter(employee_id=emp).select_related(
            "shift_id", "previous_shift_id"
        ).order_by("-id")
        data = []
        for r in qs:
            if r.canceled:
                status = "cancelled"
            elif r.approved:
                status = "approved"
            else:
                status = "requested"
            data.append({
                "id": r.id,
                "shift_name": r.shift_id.employee_shift if r.shift_id else None,
                "previous_shift_name": r.previous_shift_id.employee_shift if r.previous_shift_id else None,
                "requested_date": str(r.requested_date) if r.requested_date else None,
                "requested_till": str(r.requested_till) if r.requested_till else None,
                "is_permanent_shift": r.is_permanent_shift,
                "description": r.description or "",
                "status": status,
            })
        return Response(data)


class MyWorkTypeRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response([], status=200)
        qs = WorkTypeRequest.objects.filter(employee_id=emp).select_related(
            "work_type_id", "previous_work_type_id"
        ).order_by("-id")
        data = []
        for r in qs:
            if r.canceled:
                status = "cancelled"
            elif r.approved:
                status = "approved"
            else:
                status = "requested"
            data.append({
                "id": r.id,
                "work_type_name": r.work_type_id.work_type if r.work_type_id else None,
                "previous_work_type_name": r.previous_work_type_id.work_type if r.previous_work_type_id else None,
                "requested_date": str(r.requested_date) if r.requested_date else None,
                "requested_till": str(r.requested_till) if r.requested_till else None,
                "is_permanent_work_type": r.is_permanent_work_type,
                "description": r.description or "",
                "status": status,
            })
        return Response(data)


class ApprovalHistoryView(APIView):
    """Processed (approved/rejected) requests that the current manager handled."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        from employee.models import EmployeeWorkInformation

        emp = getattr(request.user, "employee_get", None)
        if not emp:
            return Response([], status=200)

        subordinate_ids = set(
            EmployeeWorkInformation.objects.filter(
                reporting_manager_id=emp
            ).values_list("employee_id", flat=True)
        )

        results = []

        # ── Leave ──
        try:
            from leave.models import LeaveRequest, LeaveRequestConditionApproval

            cond_ids = set(
                LeaveRequestConditionApproval.objects.filter(
                    manager_id=emp
                ).filter(
                    Q(is_approved=True) | Q(is_rejected=True)
                ).values_list("leave_request_id", flat=True)
            )
            sub_qs = LeaveRequest.objects.filter(
                employee_id__in=subordinate_ids,
                status__in=["approved", "cancelled", "rejected"],
            ).values_list("id", flat=True)
            all_ids = cond_ids | set(sub_qs)

            for lr in LeaveRequest.objects.filter(id__in=all_ids).select_related(
                "employee_id", "leave_type_id"
            ).order_by("-id")[:50]:
                e = lr.employee_id
                results.append({
                    "kind": "leave",
                    "id": lr.id,
                    "employee_name": f"{e.employee_first_name} {e.employee_last_name or ''}".strip(),
                    "badge_id": e.badge_id,
                    "title": lr.leave_type_id.name if lr.leave_type_id else "Nghỉ phép",
                    "detail": f"{lr.start_date or '—'} → {lr.end_date or '—'}",
                    "description": lr.description or "",
                    "status": lr.status,
                    "date": str(lr.requested_date) if lr.requested_date else "",
                })
        except Exception:
            pass

        # ── Shift ──
        try:
            for r in ShiftRequest.objects.filter(
                employee_id__in=subordinate_ids
            ).filter(
                Q(approved=True) | Q(canceled=True)
            ).select_related(
                "employee_id", "shift_id", "previous_shift_id"
            ).order_by("-id")[:50]:
                e = r.employee_id
                status = "rejected" if r.canceled else "approved"
                results.append({
                    "kind": "shift",
                    "id": r.id,
                    "employee_name": f"{e.employee_first_name} {e.employee_last_name or ''}".strip(),
                    "badge_id": e.badge_id,
                    "title": f"{r.previous_shift_id or '—'} → {r.shift_id or '—'}",
                    "detail": f"{r.requested_date or '—'}",
                    "description": r.description or "",
                    "status": status,
                    "date": str(r.requested_date) if r.requested_date else "",
                })
        except Exception:
            pass

        # ── WorkType ──
        try:
            for r in WorkTypeRequest.objects.filter(
                employee_id__in=subordinate_ids
            ).filter(
                Q(approved=True) | Q(canceled=True)
            ).select_related(
                "employee_id", "work_type_id", "previous_work_type_id"
            ).order_by("-id")[:50]:
                e = r.employee_id
                status = "rejected" if r.canceled else "approved"
                wt = r.work_type_id.work_type if r.work_type_id else "—"
                pwt = r.previous_work_type_id.work_type if r.previous_work_type_id else "—"
                results.append({
                    "kind": "worktype",
                    "id": r.id,
                    "employee_name": f"{e.employee_first_name} {e.employee_last_name or ''}".strip(),
                    "badge_id": e.badge_id,
                    "title": f"{pwt} → {wt}",
                    "detail": f"{r.requested_date or '—'}",
                    "description": r.description or "",
                    "status": status,
                    "date": str(r.requested_date) if r.requested_date else "",
                })
        except Exception:
            pass

        # ── Attendance ──
        try:
            from attendance.models import Attendance

            for a in Attendance.objects.filter(
                approved_by=emp
            ).select_related("employee_id").order_by("-id")[:50]:
                e = a.employee_id
                results.append({
                    "kind": "attendance",
                    "id": a.id,
                    "employee_name": f"{e.employee_first_name} {e.employee_last_name or ''}".strip(),
                    "badge_id": e.badge_id,
                    "title": str(a.attendance_date) if a.attendance_date else "Ngày công",
                    "detail": f"{a.attendance_clock_in or '—'} → {a.attendance_clock_out or '—'}",
                    "description": a.request_description or "",
                    "status": "approved",
                    "date": str(a.attendance_date) if a.attendance_date else "",
                })
        except Exception:
            pass

        # ── Asset ──
        try:
            from asset.models import AssetRequest

            for ar in AssetRequest.objects.filter(
                asset_request_status__in=["Approved", "Rejected"],
            ).select_related(
                "requested_employee_id", "asset_category_id"
            ).order_by("-id")[:50]:
                if not subordinate_ids or (
                    ar.requested_employee_id and ar.requested_employee_id.id in subordinate_ids
                ):
                    e = ar.requested_employee_id
                    results.append({
                        "kind": "asset",
                        "id": ar.id,
                        "employee_name": e.get_full_name() if e else "—",
                        "badge_id": e.badge_id if e else None,
                        "title": ar.asset_category_id.asset_category_name if ar.asset_category_id else "Tài sản",
                        "detail": str(ar.asset_request_date) if ar.asset_request_date else "",
                        "description": ar.description or "",
                        "status": ar.asset_request_status.lower(),
                        "date": str(ar.asset_request_date) if ar.asset_request_date else "",
                    })
        except Exception:
            pass

        results.sort(key=lambda x: x.get("date", ""), reverse=True)
        return Response(results[:100])


class WeatherProxyView(APIView):
    """Proxy thời tiết qua server — tránh iOS PWA chặn fetch đến external APIs."""
    permission_classes = [IsAuthenticated]

    # wttr.in code → nearest WMO code used by frontend
    _WTTR_WMO = {
        113: 0, 116: 2, 119: 3, 122: 3,
        143: 45, 248: 45, 260: 48,
        176: 61, 293: 61, 353: 80,
        263: 51, 266: 53, 281: 55,
        296: 63, 299: 63, 302: 65, 305: 65, 308: 65, 356: 81, 359: 82,
        311: 66, 314: 67,
        323: 71, 326: 71, 368: 85,
        329: 73, 332: 73, 365: 86,
        335: 75, 338: 75,
        386: 95, 389: 95, 392: 95, 395: 95, 200: 95,
    }

    def get(self, request):
        import re
        import json as _json
        import urllib.request

        lat = request.query_params.get("lat", "")
        lng = request.query_params.get("lng", "")
        try:
            lat_f = float(lat)
            lng_f = float(lng)
        except (ValueError, TypeError):
            return Response({"error": "invalid coordinates"}, status=400)

        temp, code, suburb, city = 0, 0, "", ""

        # wttr.in — works reliably from server
        try:
            wx_url = f"https://wttr.in/{lat_f:.4f},{lng_f:.4f}?format=j1"
            req = urllib.request.Request(wx_url, headers={"User-Agent": "HNH-HRM-Server/1.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                w = _json.loads(resp.read())
            cur = w["current_condition"][0]
            temp = int(cur.get("temp_C", 0))
            wttr_code = int(cur.get("weatherCode", 113))
            code = self._WTTR_WMO.get(wttr_code, 0)
        except Exception:
            pass

        # Nominatim reverse geocoding
        try:
            geo_url = (
                f"https://nominatim.openstreetmap.org/reverse"
                f"?lat={lat_f:.5f}&lon={lng_f:.5f}&format=json&accept-language=vi"
            )
            req2 = urllib.request.Request(geo_url, headers={"User-Agent": "HNH-HRM-Server/1.0"})
            with urllib.request.urlopen(req2, timeout=6) as resp2:
                g = _json.loads(resp2.read())
            addr = g.get("address", {})
            suburb = addr.get("suburb") or addr.get("quarter") or addr.get("neighbourhood") or ""
            city = addr.get("city") or addr.get("town") or addr.get("state") or ""
            suburb = re.sub(r"^(Phường|Xã|Thị trấn|Quận|Huyện)\s+", "", suburb, flags=re.IGNORECASE)
            city = re.sub(r"^Thành phố\s+", "TP.", city, flags=re.IGNORECASE)
            city = re.sub(r"^Tỉnh\s+", "", city, flags=re.IGNORECASE)
            if city.lower() in ("tp.thủ đức", "tp. thủ đức"):
                city = "TP.Hồ Chí Minh"
        except Exception:
            pass

        return Response({"temp": temp, "code": code, "suburb": suburb, "city": city})


# ── HRM Company Configuration ─────────────────────────────────────────────────

KNOWN_KEYS = {
    "geo_approval_required": bool,
}


class HRMConfigView(APIView):
    """
    GET  /api/hrm-config/  — return all HRM config values + is_hr flag
    PATCH /api/hrm-config/ — update one or more config values (HR/admin only)
    """

    permission_classes = [IsAuthenticated]

    def _is_hr(self, request) -> bool:
        u = request.user
        return u.is_superuser or u.has_perm("attendance.change_attendance")

    def get(self, request):
        data = {k: HRMConfig.get_value(k, self._default(k)) for k in KNOWN_KEYS}
        data["is_hr"] = self._is_hr(request)
        return Response(data)

    def patch(self, request):
        if not self._is_hr(request):
            return Response({"error": "Không có quyền"}, status=403)
        updated = {}
        for key, cast in KNOWN_KEYS.items():
            if key in request.data:
                val = request.data[key]
                if cast is bool:
                    val = bool(val)
                HRMConfig.set_value(key, val)
                updated[key] = val
        if not updated:
            return Response({"error": "Không có key hợp lệ"}, status=400)
        return Response(updated)

    @staticmethod
    def _default(key):
        defaults = {"geo_approval_required": True}
        return defaults.get(key)


# ── Per-user PWA preferences ───────────────────────────────────────────────────

class MyPreferencesView(APIView):
    """
    GET  /api/base/my-preferences/  — trả về preferences của user hiện tại
    PATCH /api/base/my-preferences/ — cập nhật một hoặc nhiều preferences
    """

    permission_classes = [IsAuthenticated]

    def _get_employee(self, request):
        try:
            return Employee.objects.get(employee_user_id=request.user)
        except Employee.DoesNotExist:
            return None

    def get(self, request):
        emp = self._get_employee(request)
        if emp is None:
            return Response({"pwa_auto_clock_out": True})
        return Response({"pwa_auto_clock_out": emp.pwa_auto_clock_out})

    def patch(self, request):
        emp = self._get_employee(request)
        if emp is None:
            return Response({"error": "Không tìm thấy Employee"}, status=404)
        if "pwa_auto_clock_out" in request.data:
            val = bool(request.data["pwa_auto_clock_out"])
            Employee.objects.filter(pk=emp.pk).update(pwa_auto_clock_out=val)
            emp.pwa_auto_clock_out = val
        return Response({"pwa_auto_clock_out": emp.pwa_auto_clock_out})


# ── Open API / Service Accounts ──────────────────────────────────────────────

SERVICE_ACCOUNT_GROUP = "API Service Accounts"


def _is_api_admin(user):
    """True nếu user là superuser hoặc thuộc nhóm 'Admin Hệ thống'."""
    if user.is_superuser:
        return True
    return user.groups.filter(name="Admin Hệ thống").exists()


def _get_service_group():
    from django.contrib.auth.models import Group
    group, _ = Group.objects.get_or_create(name=SERVICE_ACCOUNT_GROUP)
    return group


class ServiceAccountView(APIView):
    """
    GET  /api/base/service-accounts/  — danh sách service accounts
    POST /api/base/service-accounts/  — tạo mới, trả về token 1 lần
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_api_admin(request.user):
            return Response({"detail": "Forbidden"}, status=403)

        from django.contrib.auth import get_user_model
        User = get_user_model()
        group = _get_service_group()
        users = User.objects.filter(groups=group).order_by("username")
        return Response([
            {
                "id": u.pk,
                "username": u.username,
                "description": u.first_name,
                "is_active": u.is_active,
                "date_joined": u.date_joined.isoformat(),
            }
            for u in users
        ])

    def post(self, request):
        if not _is_api_admin(request.user):
            return Response({"detail": "Forbidden"}, status=403)

        import secrets
        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.tokens import RefreshToken
        User = get_user_model()

        name = request.data.get("name", "").strip()
        description = request.data.get("description", "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=400)

        slug = "svc_" + "".join(c.lower() if c.isalnum() else "_" for c in name)
        if User.objects.filter(username=slug).exists():
            slug = f"{slug}_{secrets.token_hex(3)}"

        user = User.objects.create_user(
            username=slug,
            password=secrets.token_urlsafe(24),
            first_name=(description or name)[:150],
            is_staff=False,
            is_active=True,
        )
        user.groups.add(_get_service_group())

        refresh = RefreshToken.for_user(user)
        return Response({
            "id": user.pk,
            "username": user.username,
            "description": user.first_name,
            "is_active": True,
            "date_joined": user.date_joined.isoformat(),
            "access_token": str(refresh.access_token),
            "token_note": "Token có hiệu lực 30 ngày. Lưu lại ngay — sẽ không hiển thị lại.",
        }, status=201)


class ServiceAccountDetailView(APIView):
    """
    PATCH  /api/base/service-accounts/<pk>/  — bật/tắt
    DELETE /api/base/service-accounts/<pk>/  — vô hiệu hoá (soft)
    POST   /api/base/service-accounts/<pk>/rotate-token/  — cấp token mới
    """

    permission_classes = [IsAuthenticated]

    def _get_account(self, pk):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.filter(groups__name=SERVICE_ACCOUNT_GROUP).get(pk=pk)
        except User.DoesNotExist:
            return None

    def patch(self, request, pk):
        if not _is_api_admin(request.user):
            return Response({"detail": "Forbidden"}, status=403)
        user = self._get_account(pk)
        if user is None:
            return Response({"detail": "Not found."}, status=404)
        if "is_active" in request.data:
            user.is_active = bool(request.data["is_active"])
            user.save(update_fields=["is_active"])
        return Response({"id": user.pk, "username": user.username, "is_active": user.is_active})

    def delete(self, request, pk):
        if not _is_api_admin(request.user):
            return Response({"detail": "Forbidden"}, status=403)
        user = self._get_account(pk)
        if user is None:
            return Response({"detail": "Not found."}, status=404)
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response(status=204)


class ServiceAccountRotateTokenView(APIView):
    """POST /api/base/service-accounts/<pk>/rotate-token/ — cấp token mới."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_api_admin(request.user):
            return Response({"detail": "Forbidden"}, status=403)
        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.tokens import RefreshToken
        User = get_user_model()
        try:
            user = User.objects.filter(groups__name=SERVICE_ACCOUNT_GROUP).get(pk=pk, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Not found or inactive."}, status=404)
        refresh = RefreshToken.for_user(user)
        return Response({
            "access_token": str(refresh.access_token),
            "token_note": "Token mới đã tạo. Token cũ vẫn hiệu lực cho đến khi hết hạn (30 ngày).",
        })

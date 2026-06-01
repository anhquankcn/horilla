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

        # Start with a base queryset with only required fields
        employees_queryset = Employee.objects.only(
            "id", "employee_first_name", "employee_last_name"
        )

        # Permission-based filtering
        if user.has_perm("employee.view_employee"):
            pass  # employees_queryset is already all employees
        else:
            subordinate_qs = user.employee_get.get_subordinate_employees()
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
        employees = Employee.objects.filter(employee_user_id=request.user)

        is_manager = EmployeeWorkInformation.objects.filter(
            reporting_manager_id=employee
        ).exists()

        if is_manager:
            employees = Employee.objects.filter(
                Q(pk=employee.pk) | Q(employee_work_info__reporting_manager_id=employee)
            )
        if request.user.has_perm("employee.view_employee"):
            employees = Employee.objects.all()

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
                }
            )

        return paginator.get_paginated_response(results)


class DepartmentListView(APIView):
    """List departments for filter chips."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import Department

        depts = Department.objects.filter(is_active=True).order_by("department")
        return Response(
            [{"id": d.pk, "name": d.department} for d in depts]
        )


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

        return Response({
            "id": group.pk,
            "name": group.name,
            "permissions": perms,
            "members": member_list,
            "allowed_apps": allowed_apps,
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
        if allowed_apps is not None:
            vis, _ = GroupAppVisibility.objects.get_or_create(group=group)
            vis.allowed_apps = allowed_apps
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
        })


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
    """Return list of allowed app slugs for the current user."""

    permission_classes = [IsAuthenticated]

    ALL_APP_SLUGS = [
        "attendance", "proposals", "approvals", "payslip", "notifications",
        "employees", "roles", "groups", "attendance-activity",
        "tasks", "projects", "announcement-hub", "dashboard", "unified-calendar", "assets", "reports", "payroll-mgmt", "documents", "onboarding", "journey",
    ]

    def get(self, request):
        from base.models import GroupAppVisibility

        user = request.user
        if user.is_superuser:
            return Response({"allowed": self.ALL_APP_SLUGS, "is_admin": True})

        groups = user.groups.all()
        if not groups.exists():
            return Response({"allowed": self.ALL_APP_SLUGS, "is_admin": False})

        visibilities = GroupAppVisibility.objects.filter(group__in=groups)
        if not visibilities.exists():
            return Response({"allowed": self.ALL_APP_SLUGS, "is_admin": False})

        allowed = set()
        has_any_config = False
        for vis in visibilities:
            if vis.allowed_apps:
                has_any_config = True
                allowed.update(vis.allowed_apps)

        if not has_any_config:
            return Response({"allowed": self.ALL_APP_SLUGS, "is_admin": False})

        return Response({"allowed": sorted(allowed), "is_admin": False})


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

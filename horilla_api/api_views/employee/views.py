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
    """Returns the authenticated user's own employee profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            employee = request.user.employee_get
        except Employee.DoesNotExist:
            return Response(
                {"error": "No employee record for this user"}, status=404
            )
        serializer = EmployeeMeSerializer(employee)
        return Response(serializer.data, status=200)


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


class MyAppsView(APIView):
    """Return list of allowed app slugs for the current user."""

    permission_classes = [IsAuthenticated]

    ALL_APP_SLUGS = [
        "attendance", "proposals", "approvals", "payslip",
        "employees", "roles", "groups", "attendance-activity",
        "tasks", "projects",
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

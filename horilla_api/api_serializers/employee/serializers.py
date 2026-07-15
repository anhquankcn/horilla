from rest_framework import serializers

from base.models import Department, EmployeeType, JobPosition
from employee.models import (
    Actiontype,
    DisciplinaryAction,
    Employee,
    EmployeeBankDetails,
    EmployeeWorkInformation,
    Policy,
)
from horilla_documents.models import Document, DocumentRequest

from ...api_methods.employee.methods import get_next_badge_id


class ActiontypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Actiontype
        fields = ["id", "title", "action_type"]


class EmployeeListSerializer(serializers.ModelSerializer):
    job_position_name = serializers.CharField(
        source="employee_work_info.job_position_id.job_position", read_only=True
    )
    employee_work_info_id = serializers.CharField(
        source="employee_work_info.id", read_only=True
    )
    employee_bank_details_id = serializers.CharField(
        source="employee_bank_details.id", read_only=True
    )

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_first_name",
            "employee_last_name",
            "email",
            "job_position_name",
            "employee_work_info_id",
            "employee_profile",
            "employee_bank_details_id",
        ]


class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(
        source="employee_work_info.department_id.department", read_only=True
    )
    department_id = serializers.CharField(
        source="employee_work_info.department_id.id", read_only=True
    )
    job_position_name = serializers.CharField(
        source="employee_work_info.job_position_id.job_position", read_only=True
    )
    job_position_id = serializers.CharField(
        source="employee_work_info.job_position_id.id", read_only=True
    )
    employee_work_info_id = serializers.CharField(
        source="employee_work_info.id", read_only=True
    )
    employee_bank_details_id = serializers.CharField(
        source="employee_bank_details.id", read_only=True
    )

    class Meta:
        model = Employee
        fields = "__all__"

    def create(self, validated_data):
        validated_data["badge_id"] = get_next_badge_id()
        return super().create(validated_data)


class EmployeeWorkInformationSerializer(serializers.ModelSerializer):
    job_position_name = serializers.CharField(
        source="job_position_id.job_position", read_only=True
    )
    department_name = serializers.CharField(
        source="department_id.department", read_only=True
    )
    shift_name = serializers.CharField(source="shift_id.employee_shift", read_only=True)
    employee_type_name = serializers.CharField(
        source="employee_type_id.employee_type", read_only=True
    )
    reporting_manager_first_name = serializers.CharField(
        source="reporting_manager_id.employee_first_name", read_only=True
    )
    reporting_manager_last_name = serializers.CharField(
        source="reporting_manager_id.employee_last_name", read_only=True
    )
    work_type_name = serializers.CharField(
        source="work_type_id.work_type", read_only=True
    )
    company_name = serializers.CharField(source="company_id.company", read_only=True)
    tags = serializers.SerializerMethodField()

    def get_tags(self, obj):
        return [
            {"id": tag.id, "title": tag.title, "color": tag.color}
            for tag in obj.tags.all()
        ]

    class Meta:
        model = EmployeeWorkInformation
        fields = "__all__"


class EmployeeBankDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeBankDetails
        fields = "__all__"


class EmployeeTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeType
        fields = "__all__"


class EmployeeBulkUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        # fields = [
        #     'employee_last_name',
        #     'address',
        #     'country',
        #     'state',
        #     'city',
        #     'zip',
        #     'dob',
        #     'gender',
        #     'qualification',
        #     'experience',
        #     'marital_status',
        #     'children',
        # ]
        fields = [
            "employee_last_name",
        ]


class DisciplinaryActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisciplinaryAction
        fields = "__all__"


class PolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = Policy
        fields = "__all__"


class DocumentRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentRequest
        fields = "__all__"


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = "__all__"


class EmployeeSelectorSerializer(serializers.ModelSerializer):
    # Thêm mã kế toán + phòng ban/công ty để lọc & tìm ở picker (Announcement Hub).
    department_name = serializers.SerializerMethodField()
    department_id = serializers.SerializerMethodField()
    company_id = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_first_name",
            "employee_last_name",
            "badge_id",
            "accounting_code",
            "employee_profile",
            "department_name",
            "department_id",
            "company_id",
        ]

    @staticmethod
    def _wi(obj):
        return getattr(obj, "employee_work_info", None)

    def get_department_name(self, obj):
        wi = self._wi(obj)
        return wi.department_id.department if wi and wi.department_id else ""

    def get_department_id(self, obj):
        wi = self._wi(obj)
        return wi.department_id_id if wi else None

    def get_company_id(self, obj):
        wi = self._wi(obj)
        return wi.company_id_id if wi else None


class EmployeeMeSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    department_name = serializers.CharField(
        source="employee_work_info.department_id.department", read_only=True
    )
    job_position_name = serializers.CharField(
        source="employee_work_info.job_position_id.job_position", read_only=True
    )
    shift_name = serializers.CharField(
        source="employee_work_info.shift_id.employee_shift", read_only=True
    )
    company_name = serializers.CharField(
        source="employee_work_info.company_id.company", read_only=True
    )
    job_role_name = serializers.CharField(
        source="employee_work_info.job_role_id.job_role", read_only=True
    )
    reporting_manager_name = serializers.SerializerMethodField()
    work_level_name = serializers.SerializerMethodField()
    date_joining = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            "id",
            "badge_id",
            "employee_first_name",
            "employee_last_name",
            "full_name",
            "email",
            "phone",
            "employee_profile",
            "dob",
            "gender",
            "address",
            "country",
            "state",
            "city",
            "zip",
            "qualification",
            "experience",
            "marital_status",
            "children",
            "emergency_contact",
            "emergency_contact_name",
            "emergency_contact_relation",
            "is_active",
            "department_name",
            "job_position_name",
            "job_role_name",
            "shift_name",
            "company_name",
            "reporting_manager_name",
            "work_level_name",
            "date_joining",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_reporting_manager_name(self, obj):
        try:
            mgr = obj.employee_work_info.reporting_manager_id
            return mgr.get_full_name() if mgr else None
        except Exception:
            return None

    def get_work_level_name(self, obj):
        try:
            return obj.work_level.name if obj.work_level else None
        except Exception:
            return None

    def get_date_joining(self, obj):
        try:
            d = obj.employee_work_info.date_joining
            return d.isoformat() if d else None
        except Exception:
            return None

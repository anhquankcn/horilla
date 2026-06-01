import gettext
from collections import defaultdict

from django.contrib.auth.decorators import permission_required
from django.shortcuts import render
from django.utils.decorators import method_decorator
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.backends import ConfiguredEmailBackend
from base.methods import eval_validate
from payroll.filters import (
    AllowanceFilter,
    ContractFilter,
    DeductionFilter,
    PayslipFilter,
)
from payroll.models.models import (
    Allowance,
    Contract,
    Deduction,
    LoanAccount,
    Payslip,
    Reimbursement,
)
from payroll.models.tax_models import TaxBracket
from payroll.threadings.mail import MailSendThread
from payroll.views.views import payslip_pdf

from ...api_methods.base.methods import groupby_queryset
from ...api_serializers.payroll.serializers import (
    AllowanceSerializer,
    ContractSerializer,
    DeductionSerializer,
    LoanAccountSerializer,
    PayslipSerializer,
    ReimbursementSerializer,
    TaxBracketSerializer,
)


class MyPayslipAPIView(APIView):
    """Returns payslips belonging to the authenticated user, newest first."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            employee = request.user.employee_get
        except Exception:
            return Response({"error": "No employee record"}, status=404)
        payslips = Payslip.objects.filter(employee_id=employee).order_by(
            "-start_date"
        )
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(payslips, request)
        serializer = PayslipSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)


class PayslipView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id=None):
        if id:
            payslip = Payslip.objects.filter(id=id).first()
            if (
                request.user.has_perm("payroll.view_payslip")
                or payslip.employee_id == request.user.employee_get
            ):
                serializer = PayslipSerializer(payslip)
            return Response(serializer.data, status=200)
        if request.user.has_perm("payroll.view_payslip"):
            payslips = Payslip.objects.all()
        else:
            payslips = Payslip.objects.filter(
                employee_id__employee_user_id=request.user
            )

        payslip_filter_queryset = PayslipFilter(request.GET, payslips).qs
        # groupby workflow
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, payslip_filter_queryset)
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(payslip_filter_queryset, request)
        serializer = PayslipSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)


class PayslipDownloadView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        if request.user.has_perm("payroll.view_payslip"):
            return payslip_pdf(request, id)

        if Payslip.objects.filter(id=id, employee_id=request.user.employee_get):
            return payslip_pdf(request, id)
        else:
            raise Response({"error": "You don't have permission"})


class PayslipSendMailView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("payroll.add_payslip"))
    def post(self, request):
        email_backend = ConfiguredEmailBackend()
        if not getattr(
            email_backend, "dynamic_username_with_display_name", None
        ) or not len(email_backend.dynamic_username_with_display_name):
            return Response({"error": "Email server is not configured"}, status=400)

        payslip_ids = request.data.get("id", [])
        payslips = Payslip.objects.filter(id__in=payslip_ids)
        result_dict = defaultdict(
            lambda: {"employee_id": None, "instances": [], "count": 0}
        )

        for payslip in payslips:
            employee_id = payslip.employee_id
            result_dict[employee_id]["employee_id"] = employee_id
            result_dict[employee_id]["instances"].append(payslip)
            result_dict[employee_id]["count"] += 1
        mail_thread = MailSendThread(request, result_dict=result_dict, ids=payslip_ids)
        mail_thread.start()
        return Response({"status": "success"}, status=200)


class ContractView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id=None):
        if id:
            contract = Contract.objects.filter(id=id).first()
            serializer = ContractSerializer(contract)
            return Response(serializer.data, status=200)
        if request.user.has_perm("payroll.view_contract"):
            contracts = Contract.objects.all()
        else:
            contracts = Contract.objects.filter(employee_id=request.user.employee_get)
        filter_queryset = ContractFilter(request.GET, contracts).qs
        # groupby workflow
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, filter_queryset)
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(filter_queryset, request)
        serializer = ContractSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)

    @method_decorator(permission_required("payroll.add_contract"))
    def post(self, request):
        serializer = ContractSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.change_contract"))
    def put(self, request, pk):
        contract = Contract.objects.get(id=pk)
        serializer = ContractSerializer(instance=contract, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.delete_contract"))
    def delete(self, request, pk):
        contract = Contract.objects.get(id=pk)
        contract.delete()
        return Response({"status": "deleted"}, status=200)


class AllowanceView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("payroll.view_allowance"))
    def get(self, request, pk=None):
        if pk:
            allowance = Allowance.objects.get(id=pk)
            serializer = AllowanceSerializer(instance=allowance)
            return Response(serializer.data, status=200)
        allowance = Allowance.objects.all()
        filter_queryset = AllowanceFilter(request.GET, allowance).qs
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(filter_queryset, request)
        serializer = AllowanceSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)

    @method_decorator(permission_required("payroll.add_allowance"))
    def post(self, request):
        serializer = AllowanceSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.change_allowance"))
    def put(self, request, pk):
        contract = Allowance.objects.get(id=pk)
        serializer = AllowanceSerializer(instance=contract, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.delete_allowance"))
    def delete(self, request, pk):
        contract = Allowance.objects.get(id=pk)
        contract.delete()
        return Response({"status": "deleted"}, status=200)


class DeductionView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("payroll.view_deduction"))
    def get(self, request, pk=None):
        if pk:
            deduction = Deduction.objects.get(id=pk)
            serializer = DeductionSerializer(instance=deduction)
            return Response(serializer.data, status=200)
        deduction = Deduction.objects.all()
        filter_queryset = DeductionFilter(request.GET, deduction).qs
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(filter_queryset, request)
        serializer = DeductionSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)

    @method_decorator(permission_required("payroll.add_deduction"))
    def post(self, request):
        serializer = DeductionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.change_deduction"))
    def put(self, request, pk):
        contract = Deduction.objects.get(id=pk)
        serializer = DeductionSerializer(instance=contract, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.delete_deduction"))
    def delete(self, request, pk):
        contract = Deduction.objects.get(id=pk)
        contract.delete()
        return Response({"status": "deleted"}, status=200)


class LoanAccountView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(permission_required("payroll.add_loanaccount"))
    def post(self, request):
        serializer = LoanAccountSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.view_loanaccount"))
    def get(self, request, pk=None):
        if pk:
            loan_account = LoanAccount.objects.get(id=pk)
            serializer = LoanAccountSerializer(instance=loan_account)
            return Response(serializer.data, status=200)
        loan_accounts = LoanAccount.objects.all()
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(loan_accounts, request)
        serializer = LoanAccountSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)

    @method_decorator(permission_required("payroll.change_loanaccount"))
    def put(self, request, pk):
        loan_account = LoanAccount.objects.get(id=pk)
        serializer = LoanAccountSerializer(loan_account, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.delete_loanaccount"))
    def delete(self, request, pk):
        loan_account = LoanAccount.objects.get(id=pk)
        loan_account.delete()
        return Response(status=200)


class ReimbursementView(APIView):
    serializer_class = ReimbursementSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            reimbursement = Reimbursement.objects.get(id=pk)
            serializer = self.serializer_class(reimbursement)
            return Response(serializer.data, status=200)
        reimbursements = Reimbursement.objects.all()

        if request.user.has_perm("payroll.view_reimbursement"):
            reimbursements = Reimbursement.objects.all()
        else:
            reimbursements = Reimbursement.objects.filter(
                employee_id=request.user.employee_get
            )
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(reimbursements, request)
        serializer = self.serializer_class(page, many=True)
        return pagination.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = self.serializer_class(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.change_reimbursement"))
    def put(self, request, pk):
        reimbursement = Reimbursement.objects.get(id=pk)
        serializer = self.serializer_class(instance=reimbursement, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("payroll.delete_reimbursement"))
    def delete(self, request, pk):
        reimbursement = Reimbursement.objects.get(id=pk)
        reimbursement.delete()
        return Response(status=200)


class ReimbusementApproveRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        status = request.data.get("status", None)
        amount = request.data.get("amount", None)
        amount = (
            eval_validate(request.data.get("amount"))
            if request.data.get("amount")
            else 0
        )
        amount = max(0, amount)
        reimbursement = Reimbursement.objects.filter(id=pk)
        if amount:
            reimbursement.update(amount=amount)
        reimbursement.update(status=status)
        return Response({"status": reimbursement.first().status}, status=200)


class TaxBracketView(APIView):

    def get(self, request, pk=None):
        if pk:
            tax_bracket = TaxBracket.objects.get(id=pk)
            serializer = TaxBracketSerializer(tax_bracket)
            return Response(serializer.data, status=200)
        tax_brackets = TaxBracket.objects.all()
        serializer = TaxBracketSerializer(instance=tax_brackets, many=True)
        return Response(serializer.data, status=200)

    def post(self, request):
        serializer = TaxBracketSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    def put(self, request, pk):
        tax_bracket = TaxBracket.objects.get(id=pk)
        serializer = TaxBracketSerializer(
            instance=tax_bracket, data=request.data, partial=True
        )
        if serializer.save():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        tax_bracket = TaxBracket.objects.get(id=pk)
        tax_bracket.delete()
        return Response(status=200)


# ── HNH Monthly Payroll (Phiếu lương) ──────────────────────────────────────


class MyMonthlyPayrollView(APIView):
    """Return the current employee's MonthlyPayrollEntry list with computed formulas."""

    permission_classes = [IsAuthenticated]

    MONTH_VI = [
        "", "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
        "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
    ]

    def get(self, request):
        from employee.models import Employee
        from payroll.models.contract_models import MonthlyPayrollEntry
        from payroll.views.contract_hnh_views import (
            _compute_entry_formulas,
            _get_bhxh_caps,
        )

        try:
            employee = request.user.employee_get
        except Exception:
            return Response({"error": "No employee record"}, status=404)

        year = request.query_params.get("year")
        month = request.query_params.get("month")

        qs = MonthlyPayrollEntry.objects.filter(
            employee_id=employee,
        ).order_by("-year", "-month")

        if year:
            qs = qs.filter(year=int(year))
        if month:
            qs = qs.filter(month=int(month))

        bhxh_cap, bhtn_cap = _get_bhxh_caps()

        results = []
        for e in qs[:24]:
            f = _compute_entry_formulas(e, bhxh_cap, bhtn_cap)

            ctype = "—"
            if e.trial_contract_id:
                ctype = "HĐ Thử việc"
            elif e.official_contract_id:
                ctype = "HĐ Chính thức"
            elif e.performance_contract_id:
                ctype = "HĐ Hiệu suất"

            results.append({
                "id": e.pk,
                "year": e.year,
                "month": e.month,
                "month_label": self.MONTH_VI[e.month] if 1 <= e.month <= 12 else f"T{e.month}",
                "contract_type": ctype,
                # Stored fields
                "standard_days": float(e.standard_days),
                "actual_days": float(e.actual_days),
                "lcb_bhxh": int(e.lcb_bhxh),
                "total_gross": int(e.total_gross),
                "pc_chuc_vu": int(e.pc_chuc_vu),
                "pc_travel": int(e.pc_travel),
                "night_shifts": float(e.night_shifts),
                "night_shift_rate": int(e.night_shift_rate),
                "ot_normal": float(e.ot_normal),
                "ot_weekend": float(e.ot_weekend),
                "ot_holiday": float(e.ot_holiday),
                "kpi_pct": float(e.kpi_pct),
                "incentive": int(e.incentive),
                "bonus": int(e.bonus),
                "other_adjust": int(e.other_adjust),
                "npt": e.npt,
                "tam_ung": int(e.tam_ung),
                "notes": e.notes,
                # Computed formulas
                **f,
            })

        return Response(results)


class PayrollManagementView(APIView):
    """Payroll overview for managers: summary + employee payroll entries for a month."""

    permission_classes = [IsAuthenticated]

    MONTH_VI = [
        "", "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
        "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
    ]

    CONTRACT_LABELS = {
        "trial": "HĐ Thử việc",
        "official": "HĐ Chính thức",
        "performance": "HĐ Hiệu suất",
    }

    def get(self, request):
        from datetime import date

        from base.models import Department
        from employee.models import Employee
        from payroll.models.contract_models import MonthlyPayrollEntry
        from payroll.views.contract_hnh_views import (
            _compute_entry_formulas,
            _get_bhxh_caps,
        )

        year = request.query_params.get("year")
        month_param = request.query_params.get("month")
        dept_id = request.query_params.get("department", "")
        ctype = request.query_params.get("contract_type", "")
        search = request.query_params.get("search", "").strip()

        today = date.today()
        if year and month_param:
            try:
                year = int(year)
                month_val = int(month_param)
            except ValueError:
                year, month_val = today.year, today.month
        else:
            year, month_val = today.year, today.month

        departments = []
        for d in Department.objects.all().order_by("department"):
            departments.append({"id": d.id, "name": d.department})

        qs = MonthlyPayrollEntry.objects.filter(
            year=year, month=month_val,
        ).select_related(
            "employee_id",
            "employee_id__employee_work_info",
            "employee_id__employee_work_info__department_id",
            "trial_contract",
            "official_contract",
            "performance_contract",
        ).order_by("employee_id__employee_first_name")

        if dept_id:
            qs = qs.filter(
                employee_id__employee_work_info__department_id=int(dept_id)
            )
        if ctype == "trial":
            qs = qs.filter(trial_contract__isnull=False)
        elif ctype == "official":
            qs = qs.filter(official_contract__isnull=False)
        elif ctype == "performance":
            qs = qs.filter(performance_contract__isnull=False)
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(employee_id__employee_first_name__icontains=search)
                | Q(employee_id__employee_last_name__icontains=search)
            )

        bhxh_cap, bhtn_cap = _get_bhxh_caps()

        rows = []
        total_gross_sum = 0
        total_net_sum = 0
        total_bhxh_sum = 0
        total_pit_sum = 0

        for e in qs[:200]:
            f = _compute_entry_formulas(e, bhxh_cap, bhtn_cap)

            emp = e.employee_id
            dept_name = ""
            position = ""
            if emp and hasattr(emp, "employee_work_info") and emp.employee_work_info:
                wi = emp.employee_work_info
                dept_name = str(wi.department_id) if wi.department_id else ""
                position = str(wi.job_position_id) if wi.job_position_id else ""

            ct = "—"
            if e.trial_contract_id:
                ct = "HĐ Thử việc"
            elif e.official_contract_id:
                ct = "HĐ Chính thức"
            elif e.performance_contract_id:
                ct = "HĐ Hiệu suất"

            ab = f.get("AB", 0)
            ak = f.get("AK", 0)
            af = f.get("AF", 0)
            ai = f.get("AI", 0)

            total_gross_sum += ab
            total_net_sum += ak
            total_bhxh_sum += af
            total_pit_sum += ai

            rows.append({
                "id": e.pk,
                "employee_id": emp.id if emp else None,
                "name": emp.get_full_name() if emp else "—",
                "department": dept_name,
                "position": position,
                "contract_type": ct,
                "standard_days": float(e.standard_days),
                "actual_days": float(e.actual_days),
                "lcb_bhxh": int(e.lcb_bhxh),
                "total_gross": int(e.total_gross),
                "pc_chuc_vu": int(e.pc_chuc_vu),
                "pc_travel": int(e.pc_travel),
                "night_shifts": float(e.night_shifts),
                "ot_normal": float(e.ot_normal),
                "ot_weekend": float(e.ot_weekend),
                "ot_holiday": float(e.ot_holiday),
                "kpi_pct": float(e.kpi_pct),
                "incentive": int(e.incentive),
                "bonus": int(e.bonus),
                "tam_ung": int(e.tam_ung),
                "npt": e.npt,
                **f,
            })

        emp_count = len(rows)

        return Response({
            "year": year,
            "month": month_val,
            "month_label": self.MONTH_VI[month_val] if 1 <= month_val <= 12 else f"T{month_val}",
            "departments": departments,
            "summary": {
                "employees": emp_count,
                "total_gross": total_gross_sum,
                "total_net": total_net_sum,
                "total_bhxh": total_bhxh_sum,
                "total_pit": total_pit_sum,
                "avg_net": round(total_net_sum / emp_count) if emp_count else 0,
            },
            "rows": rows,
        })

import logging
from datetime import datetime

from django.apps import apps
from django.db.models import Q
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from employee.models import EmployeeWorkInformation
from payroll.methods.deductions import create_deductions
from payroll.models.models import Allowance, Contract, Deduction, LoanAccount, Payslip

logger = logging.getLogger(__name__)

NPT_AMOUNT = 4_400_000.0
NPT_DEDUCTION_TITLE = "Giảm trừ người phụ thuộc"


@receiver(post_save, sender="payroll.EmployeeDependent")
def sync_npt_deduction(sender, instance, **kwargs):
    from horilla.horilla_middlewares import _thread_locals

    if not getattr(_thread_locals, "request", None):
        from base.management.commands.setup_hnh_payroll import _MockRequest

        _thread_locals.request = _MockRequest()

    employee = instance.employee
    today = timezone.localdate()
    approved_count = employee.dependents.filter(
        status="approved",
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=today)
    ).count()
    new_amount = NPT_AMOUNT * approved_count

    existing = Deduction.objects.filter(
        title=NPT_DEDUCTION_TITLE,
        specific_employees=employee,
        include_active_employees=False,
    ).first()

    if approved_count == 0:
        if existing:
            existing.delete()
        return

    if existing is None:
        company = employee.get_company()
        new_ded = Deduction(
            title=NPT_DEDUCTION_TITLE,
            is_pretax=True,
            is_tax=False,
            is_fixed=True,
            amount=new_amount,
            employer_rate=0.0,
            company_id=company,
            if_condition="gt",
            if_amount=0.0,
            if_choice="basic_pay",
            include_active_employees=False,
        )
        new_ded.save()
        new_ded.specific_employees.set([employee])
    else:
        existing.amount = new_amount
        existing.save()


@receiver(pre_save, sender=EmployeeWorkInformation)
def employeeworkinformation_pre_save(sender, instance, **_kwargs):
    """
    This method is used to override the save method for EmployeeWorkInformation Model
    """
    active_employee = (
        instance.employee_id
        if instance.employee_id and instance.employee_id.is_active == True
        else None
    )
    if active_employee is not None:
        all_contracts = Contract.objects.entire()
        contract_exists = all_contracts.filter(employee_id_id=active_employee).exists()
        if not contract_exists:
            contract = Contract()
            contract.contract_name = f"{active_employee}'s Contract"
            contract.employee_id = active_employee
            contract.contract_start_date = (
                instance.date_joining if instance.date_joining else datetime.today()
            )
            contract.wage = (
                instance.basic_salary if instance.basic_salary is not None else 0
            )
            contract.save()


@receiver(post_save, sender=LoanAccount)
def create_installments(sender, instance, created, **kwargs):
    """
    Post save method for loan account
    """
    installments = []
    asset = True
    if apps.is_installed("asset"):
        asset = True if instance.asset_id is None else False

    if created and asset and instance.type != "fine":
        loan = Allowance()
        loan.amount = instance.loan_amount
        loan.title = instance.title
        loan.include_active_employees = False
        loan.amount = instance.loan_amount
        loan.only_show_under_employee = True
        loan.is_fixed = True
        loan.is_fixed = True
        loan.one_time_date = instance.provided_date
        loan.is_loan = True
        loan.include_active_employees = False
        loan.save()
        loan.specific_employees.add(instance.employee_id)
        instance.allowance_id = loan
        super(LoanAccount, instance).save()
    else:
        deductions = instance.deduction_ids.values_list("id", flat=True)
        payslips_with_deductions = Payslip.objects.filter(
            installment_ids__in=deductions
        )
        balance_deduction = [
            deduction_id
            for deduction_id in deductions
            if not payslips_with_deductions.filter(
                installment_ids=deduction_id
            ).exists()
        ]
        installment_dict = instance.get_installments()

        if not payslips_with_deductions and not instance.settled:
            Deduction.objects.filter(id__in=deductions).delete()
            for (
                installment_date,
                installment_amount,
            ) in installment_dict.items():
                installment = create_deductions(
                    instance, installment_amount, installment_date
                )

                installments.append(installment)

            instance.deduction_ids.add(*installments)
            return

        if instance.settled:
            Deduction.objects.filter(id__in=balance_deduction).delete()

        else:
            if not balance_deduction:
                for (
                    installment_date,
                    installment_amount,
                ) in installment_dict.items():
                    if not Deduction.objects.filter(
                        one_time_date=installment_date,
                        specific_employees=instance.employee_id,
                        is_installment=True,
                        title=instance.title,
                    ).exists():
                        installment = create_deductions(
                            instance, installment_amount, installment_date
                        )

                        installments.append(installment)

                instance.deduction_ids.add(*installments)

from django import template

register = template.Library()


@register.filter(name="vnd")
def vnd(value):
    """Format a number with Vietnamese dot-thousands separator (e.g. 1.234.567)."""
    try:
        n = int(round(float(value)))
        return f"{n:,}".replace(",", ".")
    except (ValueError, TypeError):
        return "0"


@register.filter(name="paid_amount")
def paid_amount(installment):
    paid = [
        deduction.amount for deduction in installment if deduction.installment_payslip()
    ]

    return round(sum(paid), 2)


@register.filter(name="balance_amount")
def balance_amount(amount, installment):
    balance = amount - paid_amount(installment)
    return round(balance, 2)

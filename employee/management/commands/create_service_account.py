"""
Management command to create / reset a service-account user + Employee record.

Usage:
    python manage.py create_service_account
    python manage.py create_service_account --username eoffice.system --password <secret>
    python manage.py create_service_account --reset-password --password <new-secret>
"""

import secrets
import string

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from base.models import Company, Department
from employee.models import Employee


def _random_password(length=24):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


class Command(BaseCommand):
    help = "Create or reset the eoffice.system service account"

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default="eoffice.system@hongngocha.com",
            help="Django username for the service account (default: eoffice.system@hongngocha.com)",
        )
        parser.add_argument(
            "--email",
            default="eoffice.system@hongngocha.com",
        )
        parser.add_argument(
            "--password",
            default=None,
            help="Password to set. Omit to auto-generate.",
        )
        parser.add_argument(
            "--badge-id",
            default="SVC-EOFFICE",
            help="badge_id for the Employee record",
        )
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="If the user already exists, reset its password",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        username = options["username"]
        email = options["email"]
        password = options["password"] or _random_password()
        badge_id = options["badge_id"]
        reset = options["reset_password"]

        # --- Django User ---
        user, user_created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "is_active": True},
        )
        if user_created:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Created Django user: {username}"))
        elif reset:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.WARNING(f"Reset password for existing user: {username}"))
        else:
            self.stdout.write(f"Django user already exists: {username} (use --reset-password to change password)")
            password = None  # don't print old password

        # --- Employee record ---
        employee = Employee.objects.filter(employee_user_id=user).first()
        if not employee:
            # Try to link to a company (first available)
            company = Company.objects.filter(is_active=True).first()

            employee = Employee(
                employee_user_id=user,
                employee_first_name="eOffice",
                employee_last_name="System",
                email=email,
                badge_id=badge_id,
                phone="0000000000",
                gender="other",
            )
            employee.save()
            self.stdout.write(self.style.SUCCESS(f"Created Employee record (id={employee.pk})"))
        else:
            self.stdout.write(f"Employee record already exists (id={employee.pk})")

        # --- Summary ---
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=== Service account ready ==="))
        self.stdout.write(f"  username : {username}")
        self.stdout.write(f"  email    : {email}")
        self.stdout.write(f"  badge_id : {employee.badge_id}")
        self.stdout.write(f"  emp id   : {employee.pk}")
        if password:
            self.stdout.write(self.style.WARNING(f"  password : {password}"))
            self.stdout.write(self.style.WARNING("  ^^ Save this password — it will not be shown again!"))
        else:
            self.stdout.write("  password : (unchanged)")

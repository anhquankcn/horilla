"""eoffice/apps.py"""

import os
import sys

from django.apps import AppConfig


class EofficeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "eoffice"
    verbose_name = "eOffice — Quản lý Công việc"

    def ready(self):
        import eoffice.signals  # noqa: F401

        from django.urls import include, path

        from horilla.horilla_settings import APP_URLS, APPS
        from horilla.urls import urlpatterns

        APPS.append("eoffice")
        urlpatterns.append(path("eoffice/", include("eoffice.urls")))
        APP_URLS.append("eoffice.urls")

        # Scheduler: only start when explicitly requested (not during migrate, makemigrations, etc.)
        if "runserver" in sys.argv or os.environ.get("RUN_SCHEDULER"):
            try:
                from eoffice.scheduler import start_scheduler
                start_scheduler()
            except Exception:
                pass

        super().ready()

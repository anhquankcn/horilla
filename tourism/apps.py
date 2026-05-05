"""tourism/apps.py"""

from django.apps import AppConfig


class TourismConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "tourism"
    verbose_name = "Quản lý Du lịch"

    def ready(self):
        import tourism.signals  # noqa: F401  register receivers

        from django.urls import include, path

        from horilla.horilla_settings import APP_URLS, APPS
        from horilla.urls import urlpatterns

        APPS.append("tourism")
        urlpatterns.append(
            path("tourism/", include("tourism.urls")),
        )
        APP_URLS.append("tourism.urls")
        super().ready()

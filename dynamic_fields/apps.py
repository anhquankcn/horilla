import logging
import sys
import threading

from django.apps import AppConfig
from django.core.management import call_command
from django.db.backends.signals import connection_created
from django.dispatch import receiver

from dynamic_fields.methods import column_exists

logger = logging.getLogger(__name__)
_init_lock = threading.Lock()
_initialized = False


def _apply_dynamic_fields(db_connection):
    """Apply dynamic fields once the database connection is ready.

    This avoids hitting the database during app initialization (which triggers
    Django's APPS_NOT_READY warning) by running after the connection is created.
    """

    global _initialized

    # Only run for interactive commands where the feature is needed.
    if not any(cmd in sys.argv for cmd in ("runserver", "shell")):
        return

    if _initialized:
        return

    with _init_lock:
        if _initialized:
            return

        try:
            from django.contrib.contenttypes.models import ContentType
            from simple_history.models import HistoricalRecords

            from dynamic_fields.models import DynamicField

            dynamic_objects = DynamicField.objects.filter()
            fields_to_remove = DynamicField.objects.filter(remove_column=True)

            for df in fields_to_remove:
                try:
                    call_command("delete_field", *(df.pk,))
                except Exception as e:
                    logger.error(e)

            for df in dynamic_objects:
                field = df.get_field()
                field.set_attributes_from_name(df.field_name)
                model = df.get_model()
                if not column_exists(model._meta.db_table, df.field_name):
                    logger.info("Field does not exist, adding it.")
                    with db_connection.schema_editor() as editor:
                        editor.add_field(model, field)
                model.add_to_class(field.name, field)

                name = HistoricalRecords().get_history_model_name(model).lower()
                historical_model_ct = ContentType.objects.filter(model=name).first()
                if historical_model_ct:
                    history_model = historical_model_ct.model_class()
                    if not hasattr(history_model, field.column):
                        history_model.add_to_class(field.column, field)

            _initialized = True

        except Exception as e:
            logger.error(e)
            logger.info("ignore if it is fresh installation")


class DynamicFieldsConfig(AppConfig):
    """
    DynamicFieldsConfig
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "dynamic_fields"

    def ready(self):
        # Defer DB access until the connection is created to avoid APPS_NOT_READY warnings
        # on imports or app initialization.
        @receiver(connection_created)
        def _on_connection_created(sender, connection, **kwargs):
            _apply_dynamic_fields(connection)

        from django.urls import include, path

        from base.urls import urlpatterns

        urlpatterns.append(
            path("df/", include("dynamic_fields.urls")),
        )

        return super().ready()

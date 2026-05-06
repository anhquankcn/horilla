from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0002_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE auth_user
                ADD COLUMN IF NOT EXISTS is_new_employee boolean
                NOT NULL DEFAULT false;
            """,
            reverse_sql="""
                ALTER TABLE auth_user
                DROP COLUMN IF EXISTS is_new_employee;
            """,
        ),
    ]

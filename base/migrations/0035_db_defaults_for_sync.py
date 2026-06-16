"""Thêm DB-level DEFAULT cho các cột stage-only NOT NULL (check_mode, device
fields) để raw COPY/INSERT từ standby (bỏ qua các cột này) không vi phạm NOT NULL.
Django chỉ đặt default ở tầng app, không phải DB."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0034_standbysynclog"),
        ("attendance", "0017_attendanceactivity_device_fields"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "ALTER TABLE base_employeeshiftschedule ALTER COLUMN check_mode SET DEFAULT 'both';",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_in_device SET DEFAULT '';",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_out_device SET DEFAULT '';",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_in_user_agent SET DEFAULT '';",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_out_user_agent SET DEFAULT '';",
            ],
            reverse_sql=[
                "ALTER TABLE base_employeeshiftschedule ALTER COLUMN check_mode DROP DEFAULT;",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_in_device DROP DEFAULT;",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_out_device DROP DEFAULT;",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_in_user_agent DROP DEFAULT;",
                "ALTER TABLE attendance_attendanceactivity ALTER COLUMN clock_out_user_agent DROP DEFAULT;",
            ],
        ),
    ]

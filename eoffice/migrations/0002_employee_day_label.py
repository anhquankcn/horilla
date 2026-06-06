from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("eoffice", "0001_initial"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeDayLabel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(verbose_name="Ngày")),
                ("label", models.CharField(
                    choices=[("trip", "Công tác"), ("event", "Sự kiện")],
                    max_length=10, verbose_name="Loại",
                )),
                ("note", models.CharField(blank=True, max_length=200, verbose_name="Ghi chú")),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="day_labels",
                    to="employee.employee",
                    verbose_name="Nhân viên",
                )),
            ],
            options={
                "verbose_name": "Nhãn ngày",
                "verbose_name_plural": "Nhãn ngày làm việc",
            },
        ),
        migrations.AddIndex(
            model_name="employeedaylabel",
            index=models.Index(fields=["employee", "date"], name="edaylabel_emp_date_idx"),
        ),
        migrations.AlterUniqueTogether(
            name="employeedaylabel",
            unique_together={("employee", "date")},
        ),
    ]

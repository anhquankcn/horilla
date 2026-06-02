from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("base", "0001_initial"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TrainingCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, verbose_name="Category Name")),
                ("description", models.TextField(blank=True, null=True)),
                ("company_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to="base.company", verbose_name="Company")),
            ],
            options={
                "verbose_name": "Training Category",
                "verbose_name_plural": "Training Categories",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="TrainingCourse",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200, verbose_name="Course Title")),
                ("description", models.TextField(blank=True, null=True, verbose_name="Description")),
                ("course_type", models.CharField(choices=[("internal", "Internal"), ("external", "External"), ("online", "Online"), ("onsite", "On-site")], default="internal", max_length=20, verbose_name="Type")),
                ("instructor", models.CharField(blank=True, max_length=200, null=True, verbose_name="Instructor")),
                ("duration_hours", models.DecimalField(decimal_places=1, default=0, max_digits=6, verbose_name="Duration (hours)")),
                ("max_participants", models.PositiveIntegerField(default=0, verbose_name="Max Participants (0 = unlimited)")),
                ("start_date", models.DateField(blank=True, null=True, verbose_name="Start Date")),
                ("end_date", models.DateField(blank=True, null=True, verbose_name="End Date")),
                ("location", models.CharField(blank=True, max_length=200, null=True, verbose_name="Location")),
                ("is_mandatory", models.BooleanField(default=False, verbose_name="Mandatory")),
                ("is_active", models.BooleanField(default=True, verbose_name="Active")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("category", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="courses", to="training.trainingcategory", verbose_name="Category")),
                ("company_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to="base.company", verbose_name="Company")),
                ("instructor_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="taught_courses", to="employee.employee", verbose_name="Instructor (Employee)")),
            ],
            options={
                "verbose_name": "Training Course",
                "verbose_name_plural": "Training Courses",
                "ordering": ["-start_date", "title"],
            },
        ),
        migrations.CreateModel(
            name="TrainingEnrollment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("enrolled", "Enrolled"), ("in_progress", "In Progress"), ("completed", "Completed"), ("cancelled", "Cancelled"), ("failed", "Failed")], default="enrolled", max_length=20, verbose_name="Status")),
                ("enrolled_date", models.DateField(auto_now_add=True, verbose_name="Enrolled Date")),
                ("started_date", models.DateField(blank=True, null=True, verbose_name="Started Date")),
                ("completed_date", models.DateField(blank=True, null=True, verbose_name="Completed Date")),
                ("score", models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True, verbose_name="Score")),
                ("certificate_number", models.CharField(blank=True, max_length=100, null=True, verbose_name="Certificate Number")),
                ("notes", models.TextField(blank=True, null=True, verbose_name="Notes")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("course", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="enrollments", to="training.trainingcourse", verbose_name="Course")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="training_enrollments", to="employee.employee", verbose_name="Employee")),
            ],
            options={
                "verbose_name": "Training Enrollment",
                "verbose_name_plural": "Training Enrollments",
                "ordering": ["-enrolled_date"],
                "unique_together": {("employee", "course")},
            },
        ),
    ]

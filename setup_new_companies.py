"""
Create 4 new companies and reassign departments + employees.
Mapping:
  PHÒNG VÉ MÁY BAY (17)  -> Công ty Vemaybay.vn        | Phòng Vé
  LIÊN LỤC ĐỊA   (16)  -> Công ty Liên Lục Địa         | Phòng Vé
  CN ĐÀ NẴNG     (15)  -> Cty HNH Travel CN Đà Nẵng    | Phòng Chi Nhánh DN
  CN HÀ NỘI      (18)  -> Cty HNH Travel CN Hà Nội     | Phòng Chi Nhánh HN
Run: docker exec horilla-web-1 python setup_new_companies.py
"""
import os, django
os.environ["DJANGO_SETTINGS_MODULE"] = "horilla.settings"
django.setup()

from base.models import Company, Department
from employee.models import Employee, EmployeeWorkInformation

MAPPING = [
    {
        "dept_id": 17,
        "dept_old": "PHÒNG VÉ MÁY BAY",
        "company_name": "Công ty Vemaybay.vn",
        "new_dept_name": "Phòng Vé",
    },
    {
        "dept_id": 16,
        "dept_old": "LIÊN LỤC ĐỊA",
        "company_name": "Công ty Liên Lục Địa",
        "new_dept_name": "Phòng Vé",
    },
    {
        "dept_id": 15,
        "dept_old": "CN ĐÀ NẴNG",
        "company_name": "Cty HNH Travel Chi Nhánh Đà Nẵng",
        "new_dept_name": "Phòng Chi Nhánh DN",
    },
    {
        "dept_id": 18,
        "dept_old": "CN HÀ NỘI",
        "company_name": "Cty HNH Travel Chi Nhánh Hà Nội",
        "new_dept_name": "Phòng Chi Nhánh HN",
    },
]

for item in MAPPING:
    # 1. Create or get company
    company, created = Company.objects.get_or_create(
        company=item["company_name"],
        defaults={"company": item["company_name"]},
    )
    action = "Created" if created else "Found"
    print(f"[{action}] Company: {company.company} (pk={company.pk})")

    # 2. Update department name and assign to new company
    try:
        dept = Department.objects.get(pk=item["dept_id"])
        dept.department = item["new_dept_name"]
        dept.save(update_fields=["department"])
        dept.company_id.set([company])
        print(f"  Dept [{dept.pk}] renamed → '{dept.department}', company → {company.company}")
    except Department.DoesNotExist:
        print(f"  Dept pk={item['dept_id']} NOT FOUND — skip")
        continue

    # 3. Move employees' work info to new company
    wis = EmployeeWorkInformation.objects.filter(department_id=dept)
    emp_count = wis.count()
    wis.update(company_id=company)
    print(f"  Updated {emp_count} employee work-info records → company={company.company}")

    # 4. List employees moved
    for wi in EmployeeWorkInformation.objects.filter(department_id=dept).select_related("employee_id"):
        emp = wi.employee_id
        if emp:
            print(f"    - [{emp.pk}] {emp.get_full_name()}")

    print()

print("Done.")

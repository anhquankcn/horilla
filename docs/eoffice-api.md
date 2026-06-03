# API Tích hợp HNH HRM → eOffice

**Base URL**: `https://qlns.hnhtravel.work/api/`  
**Phiên bản**: 1.0  
**Cập nhật**: 2026-06-03  
**Định dạng**: JSON  
**Encoding**: UTF-8  

> Tài liệu này mô tả các API mà hệ thống eOffice có thể gọi vào HNH HRM để lấy thông tin về công ty, phòng ban, nhân viên, vị trí và vai trò.

---

## 1. Xác thực (Authentication)

HNH HRM dùng **JWT Bearer Token** (SimpleJWT).

### 1.1 Đăng nhập — Lấy Access Token

```
POST /api/auth/login/
```

**Không** cần Authorization header.

**Request body**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `username` | string | ✓ | Tên đăng nhập (email) |
| `password` | string | ✓ | Mật khẩu |

**Ví dụ Request**
```http
POST /api/auth/login/
Content-Type: application/json

{
  "username": "eoffice.system@hongngocha.com",
  "password": "••••••••"
}
```

**Response 200**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "employee": {
    "id": 42,
    "badge_id": "HNH-042",
    "employee_first_name": "eOffice",
    "employee_last_name": "System",
    "email": "eoffice.system@hongngocha.com"
  },
  "company_id": 1,
  "face_detection": false,
  "geo_fencing": false
}
```

**Response 401** — Sai thông tin đăng nhập
```json
{ "error": "Invalid credentials" }
```

### 1.2 Sử dụng Token

Thêm header vào **tất cả** request sau khi đã có token:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **Lưu ý về thời hạn token**: Access token mặc định có hiệu lực **5 phút** (cấu hình SimpleJWT). Nên implement refresh logic hoặc lưu token và lấy lại khi hết hạn.  
> **Khuyến nghị**: Tạo một service account riêng cho eOffice (ví dụ: `eoffice.system@hongngocha.com`) với quyền `view_*` chỉ đọc.

### 1.3 Đăng nhập qua Keycloak SSO (tùy chọn)

```
POST /api/auth/oidc-login/
```

```json
{ "access_token": "<keycloak_access_token>" }
```

Response format tương tự 1.1. Dùng khi eOffice đã có Keycloak token của người dùng.

---

## 2. Quy ước chung

### Phân trang (Pagination)

Các endpoint trả về danh sách đều hỗ trợ phân trang PageNumber:

```
GET /api/base/companies/?page=1&page_size=50
```

**Response format**
```json
{
  "count": 3,
  "next": "https://qlns.hnhtravel.work/api/base/companies/?page=2",
  "previous": null,
  "results": [ ... ]
}
```

| Param | Mặc định | Mô tả |
|-------|---------|-------|
| `page` | 1 | Số trang |
| `page_size` | 20 | Số bản ghi mỗi trang (mặc định hệ thống) |

### Mã lỗi

| HTTP | Ý nghĩa |
|------|---------|
| `200` | Thành công |
| `400` | Dữ liệu không hợp lệ |
| `401` | Chưa xác thực / Token hết hạn |
| `403` | Không có quyền truy cập |
| `404` | Không tìm thấy |

---

## 3. Công ty (Companies)

### 3.1 Danh sách công ty (đầy đủ)

```
GET /api/base/companies/
```

> Yêu cầu quyền: `base.view_company`

**Response 200**
```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "company": "Công ty Du lịch Hồng Ngọc Hà",
      "hq": true,
      "address": "185-187 Lê Thánh Tôn, P. Bến Thành, Q.1, TP.HCM",
      "country": "VN",
      "state": "HCM",
      "city": "Hồ Chí Minh",
      "zip": "700000",
      "icon": "/media/base/HNH-logo.png",
      "date_format": "DD/MM/YYYY",
      "time_format": "HH:mm",
      "latitude": "10.77262",
      "longitude": "106.69681"
    }
  ]
}
```

**Mô tả trường**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | integer | ID công ty |
| `company` | string | Tên công ty |
| `hq` | boolean | Là trụ sở chính |
| `address` | string | Địa chỉ đầy đủ |
| `country` | string | Mã quốc gia (ISO 3166-1 alpha-2) |
| `city` | string | Thành phố |
| `icon` | string | Đường dẫn logo (tương đối từ domain) |
| `latitude` | string | Vĩ độ địa lý |
| `longitude` | string | Kinh độ địa lý |

### 3.2 Danh sách công ty (rút gọn)

Dùng khi chỉ cần ID + tên để populate dropdown.

```
GET /api/employee/companies/
```

**Response 200**
```json
[
  { "id": 1, "name": "Công ty Du lịch Hồng Ngọc Hà" }
]
```

### 3.3 Chi tiết một công ty

```
GET /api/base/companies/{id}/
```

Trả về object công ty theo format 3.1, không wrap pagination.

---

## 4. Phòng ban (Departments)

### 4.1 Danh sách phòng ban (đầy đủ)

```
GET /api/base/departments/
```

> Yêu cầu quyền: `base.view_department`

**Response 200**
```json
{
  "count": 10,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "department": "Nhân sự",
      "company_id": [1]
    },
    {
      "id": 2,
      "department": "Kế toán",
      "company_id": [1]
    },
    {
      "id": 3,
      "department": "Kinh doanh & Marketing",
      "company_id": [1]
    }
  ]
}
```

**Mô tả trường**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | integer | ID phòng ban |
| `department` | string | Tên phòng ban |
| `company_id` | integer[] | Danh sách ID công ty phòng ban thuộc về |

### 4.2 Danh sách phòng ban (rút gọn)

```
GET /api/employee/departments/
```

**Response 200**
```json
[
  { "id": 1, "name": "Nhân sự" },
  { "id": 2, "name": "Kế toán" },
  { "id": 3, "name": "Kinh doanh & Marketing" },
  { "id": 4, "name": "Điều hành Tour" },
  { "id": 5, "name": "Hướng dẫn viên" }
]
```

### 4.3 Chi tiết một phòng ban

```
GET /api/base/departments/{id}/
```

---

## 5. Vị trí công việc (Job Positions)

### 5.1 Danh sách vị trí (đầy đủ)

```
GET /api/base/job-positions/
```

> Yêu cầu quyền: `base.view_jobposition`

**Response 200**
```json
{
  "count": 25,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "job_position": "Trưởng phòng Nhân sự",
      "department_id": 1,
      "company_id": [1]
    },
    {
      "id": 2,
      "job_position": "Chuyên viên Nhân sự",
      "department_id": 1,
      "company_id": [1]
    },
    {
      "id": 8,
      "job_position": "Hướng dẫn viên Du lịch",
      "department_id": 5,
      "company_id": [1]
    }
  ]
}
```

**Mô tả trường**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | integer | ID vị trí |
| `job_position` | string | Tên vị trí |
| `department_id` | integer | ID phòng ban chứa vị trí này |
| `company_id` | integer[] | Danh sách ID công ty |

### 5.2 Danh sách vị trí theo phòng ban (rút gọn)

```
GET /api/employee/positions/?department={department_id}
```

**Query params**

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `department` | integer | Không | Lọc theo ID phòng ban |

**Response 200**
```json
[
  { "id": 8, "name": "Hướng dẫn viên Du lịch", "department_id": 5 },
  { "id": 9, "name": "Lái xe Du lịch", "department_id": 5 }
]
```

### 5.3 Chi tiết một vị trí

```
GET /api/base/job-positions/{id}/
```

---

## 6. Vai trò (Job Roles)

Job Role là cấp tinh hơn của vị trí — một Job Position có thể có nhiều Job Role (ví dụ: Vị trí "Hướng dẫn viên" có thể có role "HDV Nội địa", "HDV Quốc tế").

### 6.1 Danh sách vai trò (đầy đủ)

```
GET /api/base/job-roles/
```

> Yêu cầu quyền: `base.view_jobrole`

**Response 200**
```json
{
  "count": 15,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "job_role": "Trưởng nhóm",
      "job_position_id": 2,
      "company_id": [1]
    },
    {
      "id": 2,
      "job_role": "HDV Nội địa",
      "job_position_id": 8,
      "company_id": [1]
    },
    {
      "id": 3,
      "job_role": "HDV Quốc tế",
      "job_position_id": 8,
      "company_id": [1]
    }
  ]
}
```

**Mô tả trường**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | integer | ID vai trò |
| `job_role` | string | Tên vai trò |
| `job_position_id` | integer | ID vị trí cha |
| `company_id` | integer[] | Danh sách ID công ty |

### 6.2 Vai trò theo vị trí (rút gọn)

```
GET /api/employee/roles-for-position/?position={position_id}
```

**Query params**

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `position` | integer | ✓ | ID vị trí |

**Response 200**
```json
[
  { "id": 2, "name": "HDV Nội địa" },
  { "id": 3, "name": "HDV Quốc tế" }
]
```

### 6.3 Loại nhân viên (Employee Types)

Employee Type phân loại hợp đồng/tính chất công việc (Toàn thời gian, Bán thời gian, Thử việc...).

```
GET /api/employee/employee-type/
```

**Response 200**
```json
[
  {
    "id": 1,
    "employee_type": "Toàn thời gian",
    "company_id": [1]
  },
  {
    "id": 2,
    "employee_type": "Bán thời gian",
    "company_id": [1]
  },
  {
    "id": 3,
    "employee_type": "Thử việc",
    "company_id": [1]
  }
]
```

---

## 7. Nhân viên (Employees)

### 7.1 Danh sách nhân viên

```
GET /api/employee/list/employees/
```

**Query params**

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `search` | string | Không | Tìm theo tên (first/last name) |
| `page` | integer | Không | Số trang |

**Ví dụ**
```
GET /api/employee/list/employees/?search=Nguyen&page=1
```

**Response 200**
```json
{
  "count": 45,
  "next": "https://qlns.hnhtravel.work/api/employee/list/employees/?page=2",
  "previous": null,
  "results": [
    {
      "id": 12,
      "employee_first_name": "Hương",
      "employee_last_name": "Nguyễn Thị",
      "email": "huong.nguyen@hongngocha.com",
      "job_position_name": "Chuyên viên Nhân sự",
      "employee_work_info_id": "15",
      "employee_profile": "/media/employee/profiles/12.jpg",
      "employee_bank_details_id": "8"
    }
  ]
}
```

**Mô tả trường**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | integer | ID nhân viên trong HRM |
| `employee_first_name` | string | Tên |
| `employee_last_name` | string | Họ |
| `email` | string | Email công ty |
| `job_position_name` | string | Tên vị trí (denormalized) |
| `employee_work_info_id` | string | ID bản ghi thông tin công việc |
| `employee_profile` | string\|null | URL ảnh đại diện |
| `employee_bank_details_id` | string\|null | ID thông tin ngân hàng |

### 7.2 Chi tiết nhân viên (đầy đủ)

```
GET /api/employee/employees/{id}/
```

> Yêu cầu quyền: `employee.view_employee`

**Response 200**
```json
{
  "id": 12,
  "badge_id": "HNH-012",
  "employee_user_id": 18,
  "employee_first_name": "Hương",
  "employee_last_name": "Nguyễn Thị",
  "email": "huong.nguyen@hongngocha.com",
  "phone": "0901234567",
  "employee_profile": "/media/employee/profiles/12.jpg",
  "dob": "1995-08-15",
  "gender": "female",
  "address": "123 Nguyễn Trãi, Q.1, TP.HCM",
  "country": "VN",
  "state": null,
  "city": "Hồ Chí Minh",
  "zip": null,
  "qualification": "Cử nhân Du lịch",
  "experience": 4,
  "marital_status": "married",
  "children": 1,
  "emergency_contact": "0909876543",
  "emergency_contact_name": "Nguyễn Văn A",
  "emergency_contact_relation": "Chồng",
  "is_active": true,
  "work_level": 3,
  "department_name": "Nhân sự",
  "department_id": "1",
  "job_position_name": "Chuyên viên Nhân sự",
  "job_position_id": "2",
  "employee_work_info_id": "15",
  "employee_bank_details_id": "8"
}
```

**Mô tả trường quan trọng**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | integer | ID nhân viên |
| `badge_id` | string | Mã nhân viên (dạng `HNH-XXX`) |
| `employee_user_id` | integer | ID tài khoản đăng nhập Django |
| `dob` | string | Ngày sinh (YYYY-MM-DD) |
| `gender` | string | `male` / `female` / `other` |
| `is_active` | boolean | Còn làm việc hay không |
| `work_level` | integer\|null | Cấp bậc nội bộ (1–8) |
| `department_name` | string | Tên phòng ban (denormalized) |
| `job_position_name` | string | Tên vị trí (denormalized) |

### 7.3 Thông tin công việc nhân viên

```
GET /api/employee/employee-work-information/
GET /api/employee/employee-work-information/{id}/
```

> Dùng `employee_work_info_id` lấy từ endpoint 7.1 hoặc 7.2 để query.

**Query params (list)**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `page` | integer | Số trang |

**Response 200**
```json
{
  "count": 45,
  "results": [
    {
      "id": 15,
      "employee_id": 12,
      "job_position_id": 2,
      "department_id": 1,
      "shift_id": 1,
      "work_type_id": 1,
      "employee_type_id": 1,
      "reporting_manager_id": 5,
      "company_id": 1,
      "date_joining": "2022-03-01",
      "contract_end_date": null,
      "basic_salary": 12000000,
      "salary_hour_rate": null,
      "job_position_name": "Chuyên viên Nhân sự",
      "department_name": "Nhân sự",
      "shift_name": "Ca hành chính",
      "employee_type_name": "Toàn thời gian",
      "work_type_name": "Văn phòng",
      "company_name": "Công ty Du lịch Hồng Ngọc Hà",
      "reporting_manager_first_name": "An",
      "reporting_manager_last_name": "Trần Thị",
      "tags": []
    }
  ]
}
```

**Mô tả trường quan trọng**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `employee_id` | integer | ID nhân viên |
| `job_position_id` | integer | FK → Job Position |
| `department_id` | integer | FK → Department |
| `shift_id` | integer | FK → Ca làm việc |
| `work_type_id` | integer | FK → Loại công việc (Văn phòng, Từ xa...) |
| `employee_type_id` | integer | FK → Employee Type |
| `reporting_manager_id` | integer | FK → Quản lý trực tiếp |
| `company_id` | integer | FK → Công ty |
| `date_joining` | string | Ngày vào làm (YYYY-MM-DD) |
| `contract_end_date` | string\|null | Ngày kết thúc hợp đồng |
| `basic_salary` | integer\|null | Lương cơ bản (VND) |

### 7.4 Danh sách nhân viên (dạng selector)

Dùng để populate dropdown chọn nhân viên, trả về ít trường nhất.

```
GET /api/employee/employee-selector/
```

**Response 200**
```json
[
  {
    "id": 12,
    "employee_first_name": "Hương",
    "employee_last_name": "Nguyễn Thị",
    "badge_id": "HNH-012",
    "employee_profile": "/media/employee/profiles/12.jpg"
  }
]
```

### 7.5 Thông tin nhân viên đang đăng nhập

```
GET /api/employee/me/
```

Trả về thông tin của chính người đang gọi API. Không cần ID.

**Response 200**
```json
{
  "id": 12,
  "badge_id": "HNH-012",
  "employee_first_name": "Hương",
  "employee_last_name": "Nguyễn Thị",
  "full_name": "Nguyễn Thị Hương",
  "email": "huong.nguyen@hongngocha.com",
  "phone": "0901234567",
  "employee_profile": "/media/employee/profiles/12.jpg",
  "dob": "1995-08-15",
  "gender": "female",
  "department_name": "Nhân sự",
  "job_position_name": "Chuyên viên Nhân sự",
  "job_role_name": "Trưởng nhóm",
  "shift_name": "Ca hành chính",
  "company_name": "Công ty Du lịch Hồng Ngọc Hà",
  "reporting_manager_name": "Trần Thị An",
  "work_level_name": "Cấp 3 — Chuyên viên",
  "date_joining": "2022-03-01",
  "is_active": true,
  "marital_status": "married",
  "children": 1
}
```

---

## 8. Nhóm quyền (Permission Groups)

### 8.1 Danh sách nhóm quyền

```
GET /api/employee/groups/
```

**Response 200**
```json
[
  {
    "id": 1,
    "name": "HR Manager",
    "permissions": ["view_employee", "add_employee", "change_employee"],
    "member_count": 2
  },
  {
    "id": 2,
    "name": "Accountant",
    "permissions": ["view_payroll", "add_payroll"],
    "member_count": 3
  }
]
```

### 8.2 Chi tiết nhóm quyền + danh sách thành viên

```
GET /api/employee/groups/{id}/
```

**Response 200**
```json
{
  "id": 1,
  "name": "HR Manager",
  "permissions": [
    { "id": 101, "codename": "view_employee", "name": "Can view employee" },
    { "id": 102, "codename": "add_employee", "name": "Can add employee" }
  ],
  "members": [
    {
      "id": 5,
      "badge_id": "HNH-005",
      "employee_first_name": "An",
      "employee_last_name": "Trần Thị"
    }
  ]
}
```

---

## 9. Hướng dẫn tích hợp

### 9.1 Luồng lấy cây tổ chức

```
1. GET /api/employee/companies/          → Danh sách công ty
2. GET /api/employee/departments/        → Danh sách phòng ban
3. GET /api/employee/positions/          → Danh sách vị trí (có department_id)
4. GET /api/employee/list/employees/    → Danh sách nhân viên (phân trang)
5. GET /api/employee/employee-work-information/ → Mapping đầy đủ
```

### 9.2 Luồng đồng bộ nhân viên định kỳ

```
1. POST /api/auth/login/                → Lấy access token
2. GET /api/employee/list/employees/?page=1&page_size=100
   → Lặp qua các trang cho đến khi next = null
3. Với mỗi nhân viên cần thông tin đầy đủ:
   GET /api/employee/employees/{id}/
4. Lấy thông tin công việc:
   GET /api/employee/employee-work-information/{work_info_id}/
```

### 9.3 Đồng bộ khi có sự kiện (Webhook — coming soon)

> Hiện tại HNH HRM chưa có Webhook. eOffice cần **polling định kỳ** (khuyến nghị mỗi 15 phút).  
> Có thể dùng `date_joining` và `contract_end_date` từ WorkInformation để detect nhân viên mới/nghỉ việc.

### 9.4 Xử lý ảnh đại diện

Trường `employee_profile` trả về đường dẫn tương đối, ví dụ `/media/employee/profiles/12.jpg`.  
URL đầy đủ: `https://qlns.hnhtravel.work/media/employee/profiles/12.jpg`

> Lưu ý: URL media được serve qua Cloudflare. Không cần Authorization header để xem ảnh công khai.

---

## 10. Bảng tham chiếu nhanh

| Tài nguyên | Endpoint | Cần quyền |
|-----------|---------|-----------|
| Đăng nhập | `POST /api/auth/login/` | Không |
| Công ty (đầy đủ) | `GET /api/base/companies/` | `base.view_company` |
| Công ty (rút gọn) | `GET /api/employee/companies/` | Đã xác thực |
| Phòng ban (đầy đủ) | `GET /api/base/departments/` | `base.view_department` |
| Phòng ban (rút gọn) | `GET /api/employee/departments/` | Đã xác thực |
| Vị trí (đầy đủ) | `GET /api/base/job-positions/` | `base.view_jobposition` |
| Vị trí (theo PB) | `GET /api/employee/positions/?department={id}` | Đã xác thực |
| Vai trò (đầy đủ) | `GET /api/base/job-roles/` | `base.view_jobrole` |
| Vai trò (theo vị trí) | `GET /api/employee/roles-for-position/?position={id}` | Đã xác thực |
| Loại nhân viên | `GET /api/employee/employee-type/` | Đã xác thực |
| Danh sách nhân viên | `GET /api/employee/list/employees/` | Đã xác thực |
| Chi tiết nhân viên | `GET /api/employee/employees/{id}/` | `employee.view_employee` |
| Thông tin công việc | `GET /api/employee/employee-work-information/{id}/` | Đã xác thực |
| Selector nhân viên | `GET /api/employee/employee-selector/` | Đã xác thực |
| Tôi | `GET /api/employee/me/` | Đã xác thực |
| Nhóm quyền | `GET /api/employee/groups/` | Đã xác thực |

---

## 11. Ví dụ code tích hợp (Python)

```python
import requests

BASE_URL = "https://qlns.hnhtravel.work/api"
SESSION = requests.Session()

def login(username: str, password: str) -> str:
    resp = SESSION.post(f"{BASE_URL}/auth/login/", json={
        "username": username,
        "password": password,
    })
    resp.raise_for_status()
    token = resp.json()["access"]
    SESSION.headers["Authorization"] = f"Bearer {token}"
    return token

def get_all_employees(page_size: int = 100) -> list:
    employees = []
    url = f"{BASE_URL}/employee/list/employees/?page_size={page_size}"
    while url:
        resp = SESSION.get(url)
        resp.raise_for_status()
        data = resp.json()
        employees.extend(data["results"])
        url = data["next"]
    return employees

def get_org_tree() -> dict:
    companies = SESSION.get(f"{BASE_URL}/employee/companies/").json()
    departments = SESSION.get(f"{BASE_URL}/employee/departments/").json()
    return {"companies": companies, "departments": departments}

if __name__ == "__main__":
    login("eoffice.system@hongngocha.com", "••••••••")
    employees = get_all_employees()
    print(f"Tổng nhân viên: {len(employees)}")
```

---

*Liên hệ hỗ trợ tích hợp: IT HNH — anhquankcn2412@gmail.com*

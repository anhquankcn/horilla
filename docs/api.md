# HNH HRM — API Documentation

**Base URL:** `https://qlns.hnhtravel.work`  
**API prefix:** `/api/`  
**Phiên bản:** v1 (2026-06)

---

## Mục lục

1. [Authentication](#1-authentication)
2. [Employee — Nhân viên](#2-employee--nhân-viên)
3. [Department — Phòng ban](#3-department--phòng-ban)
4. [Attendance — Chấm công](#4-attendance--chấm-công)
5. [Leave — Nghỉ phép](#5-leave--nghỉ-phép)
6. [Open API — Service Accounts](#6-open-api--service-accounts)
7. [Quy ước chung](#7-quy-ước-chung)

---

## 1. Authentication

### 1.1 Lấy Access Token (người dùng / service account)

```
POST /api/auth/login/
```

**Body**

```json
{
  "username": "your_username",
  "password": "your_password"
}
```

**Response 200**

```json
{
  "access": "<jwt_token>",
  "employee": {
    "id": 5,
    "employee_first_name": "Nguyễn",
    "employee_last_name": "Văn A",
    "email": "van.a@hnhtravel.com",
    "employee_profile": "/media/employee/profile/abc.jpg"
  },
  "face_detection": false,
  "geo_fencing": false,
  "company_id": 1
}
```

**Response 401**

```json
{ "error": "Invalid credentials" }
```

> Token có hiệu lực **30 ngày**.  
> Dùng header sau cho mọi request tiếp theo:
> ```
> Authorization: Bearer <jwt_token>
> ```

### 1.2 Đăng nhập qua Keycloak OIDC (PWA mobile)

```
POST /api/auth/oidc-login/
```

**Body**

```json
{
  "access_token": "<keycloak_access_token>"
}
```

**Response 200** — giống với `/api/auth/login/`

---

## 2. Employee — Nhân viên

Tất cả endpoint yêu cầu `Authorization: Bearer <token>`.

### 2.1 Danh sách nhân viên (directory đầy đủ)

```
GET /api/employee/directory/
```

**Query params**

| Param | Kiểu | Mô tả |
|---|---|---|
| `search` | string | Tìm theo tên, badge_id, SĐT |
| `department` | int | Lọc theo department ID |
| `company` | int | Lọc theo company ID |
| `status` | string | `pending` \| `assigned` |
| `page` | int | Trang (mặc định 1, page_size 50) |

**Response 200**

```json
{
  "count": 42,
  "next": "https://qlns.hnhtravel.work/api/employee/directory/?page=2",
  "previous": null,
  "results": [
    {
      "id": 5,
      "badge_id": "HDV001",
      "first_name": "Nguyễn",
      "last_name": "Văn A",
      "email": "van.a@hnhtravel.com",
      "phone": "0901234567",
      "profile": "/media/employee/profile/abc.jpg",
      "gender": "male",
      "department": "Hướng dẫn viên",
      "department_id": 2,
      "job_position": "Hướng dẫn viên quốc tế",
      "job_role": "Senior HDV",
      "company": "Công ty Du lịch Hồng Ngọc Hà",
      "shift": "HCH26",
      "work_type": "On-site",
      "employee_type": "Full-time",
      "date_joining": "2023-04-01",
      "reporting_manager": "Trần Thị B",
      "reporting_manager_id": 3
    }
  ]
}
```

### 2.2 Nhân viên theo email

```
GET /api/employee/employees/by-email/?email={email}
```

**Query params**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `email` | string | ✅ | Email chính xác của nhân viên |

**Response 200**

```json
{
  "id": 5,
  "badge_id": "HDV001",
  "first_name": "Nguyễn",
  "last_name": "Văn A",
  "email": "van.a@hnhtravel.com",
  "phone": "0901234567",
  "profile": "/media/employee/profile/abc.jpg",
  "gender": "male",
  "department": "Hướng dẫn viên",
  "department_id": 2,
  "job_position": "Hướng dẫn viên quốc tế",
  "job_role": "Senior HDV",
  "reporting_manager_id": 3
}
```

**Response 404** — không tìm thấy hoặc nhân viên không còn active.

### 2.3 Thông tin công khai theo ID

```
GET /api/employee/{id}/public-info/
```

**Response 200**

```json
{
  "id": 5,
  "badge_id": "HDV001",
  "first_name": "Nguyễn",
  "last_name": "Văn A",
  "email": "van.a@hnhtravel.com",
  "phone": "0901234567",
  "profile": "/media/employee/profile/abc.jpg",
  "gender": "male",
  "department": "Hướng dẫn viên",
  "department_id": 2,
  "job_position": "Hướng dẫn viên quốc tế",
  "job_role": "Senior HDV",
  "date_joining": "2023-04-01",
  "reporting_manager_id": 3
}
```

### 2.4 Danh sách rút gọn (dùng cho dropdown / autocomplete)

```
GET /api/employee/list/employees/
```

**Query params**

| Param | Kiểu | Mô tả |
|---|---|---|
| `search` | string | Tìm theo tên |
| `page` | int | Phân trang |

**Response 200**

```json
{
  "count": 42,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 5,
      "employee_first_name": "Nguyễn",
      "employee_last_name": "Văn A",
      "email": "van.a@hnhtravel.com",
      "job_position_name": "Hướng dẫn viên quốc tế",
      "employee_profile": "/media/employee/profile/abc.jpg"
    }
  ]
}
```

### 2.5 Profile của chính user đang đăng nhập

```
GET /api/employee/me/
```

**Response 200** — trả về object Employee đầy đủ.

### 2.6 Chi tiết nhân viên theo ID

```
GET /api/employee/employees/{id}/
```

### 2.7 Lịch làm việc cá nhân

```
GET /api/employee/me/schedule/
```

**Query param:** `?month=YYYY-MM`

### 2.8 Sơ đồ tổ chức

```
GET /api/employee/org-chart/
```

---

## 3. Department — Phòng ban

### 3.1 Danh sách phòng ban

```
GET /api/employee/departments/
```

**Response 200**

```json
[
  {
    "id": 1,
    "name": "Ban Giám Đốc",
    "manager_id": 2
  },
  {
    "id": 2,
    "name": "Hướng dẫn viên",
    "manager_id": null
  }
]
```

> `manager_id`: ID của reporting manager đầu tiên trong phòng ban. `null` nếu chưa có.

### 3.2 Nhân viên trong phòng ban

Dùng endpoint directory với filter:

```
GET /api/employee/directory/?department={dept_id}
```

### 3.3 Danh sách công ty

```
GET /api/employee/companies/
```

**Response 200**

```json
[
  { "id": 1, "name": "Công ty Du lịch Hồng Ngọc Hà" }
]
```

### 3.4 Danh sách vị trí công việc

```
GET /api/employee/positions/?department={dept_id}
```

---

## 4. Attendance — Chấm công

### 4.1 Clock-in

```
POST /api/attendance/attendance-activity/
```

**Body**

```json
{
  "employee": 5,
  "clock_in": "2026-06-09T08:00:00+07:00",
  "clock_in_latitude": 10.7769,
  "clock_in_longitude": 106.7009
}
```

### 4.2 Clock-out

```
PATCH /api/attendance/attendance-activity/{id}/
```

**Body**

```json
{
  "clock_out": "2026-06-09T17:00:00+07:00",
  "clock_out_latitude": 10.7769,
  "clock_out_longitude": 106.7009
}
```

### 4.3 Lịch sử chấm công tháng

```
GET /api/attendance/attendance-activity/?month=YYYY-MM&employee={id}
```

---

## 5. Leave — Nghỉ phép

### 5.1 Số dư nghỉ phép

```
GET /api/leave/available-leaves/?employee={id}
```

**Response 200**

```json
[
  {
    "id": 1,
    "leave_type": "Nghỉ phép năm",
    "available_days": 9.5,
    "carryforward_days": 0
  }
]
```

### 5.2 Tạo đơn nghỉ phép

```
POST /api/leave/leave-requests/
```

**Body**

```json
{
  "employee_id": 5,
  "leave_type_id": 1,
  "start_date": "2026-06-10",
  "end_date": "2026-06-11",
  "description": "Nghỉ phép cá nhân"
}
```

### 5.3 Danh sách đơn nghỉ phép

```
GET /api/leave/leave-requests/?employee={id}&status=requested
```

---

## 6. Open API — Service Accounts

> Chỉ dành cho **Admin Hệ thống** (`is_superuser` hoặc thuộc nhóm `Admin Hệ thống`).

### 6.1 Danh sách service accounts

```
GET /api/base/service-accounts/
```

**Response 200**

```json
[
  {
    "id": 1,
    "username": "svc_arkon_ai",
    "description": "Arkon AI — đọc danh bạ nhân sự",
    "is_active": true,
    "date_joined": "2026-06-09T10:00:00+07:00"
  }
]
```

### 6.2 Tạo service account mới

```
POST /api/base/service-accounts/
```

**Body**

```json
{
  "name": "Arkon AI",
  "description": "AI assistant nội bộ, đọc danh bạ nhân sự"
}
```

**Response 201**

```json
{
  "id": 1,
  "username": "svc_arkon_ai",
  "description": "Arkon AI",
  "is_active": true,
  "date_joined": "2026-06-09T10:00:00+07:00",
  "access_token": "<jwt_token_30_days>",
  "token_note": "Token có hiệu lực 30 ngày. Lưu lại ngay — sẽ không hiển thị lại."
}
```

> Token chỉ trả về **một lần duy nhất** khi tạo. Dùng `/rotate-token/` để lấy token mới.

### 6.3 Bật / Tắt service account

```
PATCH /api/base/service-accounts/{id}/
```

**Body**

```json
{ "is_active": false }
```

**Response 200**

```json
{ "id": 1, "username": "svc_arkon_ai", "is_active": false }
```

> Tắt account (`is_active: false`) sẽ vô hiệu hoá ngay lập tức — JWT cũ sẽ bị từ chối.

### 6.4 Vô hiệu hoá (soft delete)

```
DELETE /api/base/service-accounts/{id}/
```

**Response 204** — No content.

### 6.5 Lấy token mới

```
POST /api/base/service-accounts/{id}/rotate-token/
```

**Response 200**

```json
{
  "access_token": "<new_jwt_token>",
  "token_note": "Token mới đã tạo. Token cũ vẫn hiệu lực cho đến khi hết hạn (30 ngày)."
}
```

---

## 7. Quy ước chung

### HTTP Status Codes

| Code | Ý nghĩa |
|---|---|
| `200` | Thành công |
| `201` | Tạo mới thành công |
| `204` | Thành công, không có body |
| `400` | Request không hợp lệ (thiếu field, sai format) |
| `401` | Chưa xác thực hoặc token hết hạn |
| `403` | Không có quyền truy cập |
| `404` | Không tìm thấy resource |
| `500` | Lỗi server |

### Phân trang

Các endpoint trả về danh sách đều hỗ trợ phân trang:

```json
{
  "count": 100,
  "next": "https://qlns.hnhtravel.work/api/.../.../?page=3",
  "previous": "https://qlns.hnhtravel.work/api/.../.../?page=1",
  "results": [...]
}
```

Mặc định **20 items/trang**. Endpoint `directory/` dùng **50 items/trang**.

### Múi giờ

Tất cả datetime trả về theo **UTC+7 (Asia/Ho_Chi_Minh)** dạng ISO 8601:  
`2026-06-09T08:00:00+07:00`

### Media files

URL ảnh trả về dạng relative path, ví dụ `/media/employee/profile/abc.jpg`.  
Prepend base URL để lấy URL đầy đủ:  
`https://qlns.hnhtravel.work/media/employee/profile/abc.jpg`

### Lỗi phổ biến

```json
{ "detail": "Authentication credentials were not provided." }
```
→ Thiếu header `Authorization: Bearer <token>`.

```json
{ "detail": "Given token not valid for any token type" }
```
→ Token hết hạn hoặc sai. Gọi lại `/api/auth/login/` để lấy token mới.

```json
{ "detail": "Forbidden" }
```
→ Tài khoản không có đủ quyền (cần nhóm Admin Hệ thống hoặc superuser).

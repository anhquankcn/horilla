# Hướng dẫn nhanh cho C&B — Quản lý Nghỉ phép (Production)

> Áp dụng trên **https://qlns.hnhtravel.work** (PWA). Đăng nhập bằng tài khoản C&B.
> Nếu chưa thấy tính năng mới: **tải lại app 1 lần** (kéo xuống refresh hoặc mở lại).
> Các tính năng dưới đây chỉ hiện với tài khoản **C&B / Admin**.

---

## 1. Quản lý người duyệt đơn theo phòng ban

**Mở:** Trang **Tính năng** → nhóm **Chấm công** → **"Cấu hình duyệt phép"**.

Màn này có 2 phần:

**a) Xem ai đang duyệt cho mỗi nhân sự** (phần dưới — *"Người duyệt mỗi nhân viên"*)
- Lọc theo **Công ty / Phòng ban** ở trên cùng.
- Mỗi nhân sự hiển thị: **Quản lý trực tiếp** + **C&B duyệt** (người duyệt được áp theo rule).
- Ai chưa có người duyệt C&B sẽ ghi đỏ **"Chưa gán"**.

**b) Phân quyền người duyệt cho phòng ban** (phần *"Gán người duyệt"* + *"Rule hiện có"*)
1. Chọn **Công ty** và/hoặc **Phòng ban** cần cấu hình (để trống cả hai = áp mặc định toàn công ty).
2. Chọn **người C&B duyệt** trong ô tìm kiếm.
3. Bấm **"Lưu rule"**.
4. Rule vừa tạo hiện ở danh sách bên dưới; bấm nút thùng rác để **xoá** rule.

> Quy tắc áp dụng: rule cụ thể hơn thắng — *(công ty + phòng) > (công ty) > (phòng) > mặc định toàn công ty*.

---

## 2. Tổng quan nghỉ phép — lọc theo tên + xem chi tiết từng nhân sự

**Mở:** Trang **Tính năng** → nhóm **Chấm công** → **"Nghỉ phép Tháng"**.

- **Tìm theo tên:** gõ tên nhân sự (gõ **không dấu vẫn ra**), lọc thêm theo Công ty/Phòng ban.
- **Xem chi tiết:** bấm vào **tên nhân sự** → mở bảng **"Chi tiết phép"**:
  - Liệt kê **từng loại phép**: Phép đầu · Đã dùng trong năm · Còn lại.
  - Dòng **Tổng** cộng ra đúng số **Phép đầu / Còn lại** ở lưới tổng quan → em thấy rõ tổng ngày phép **được cộng ra từ đâu**.

---

## 3. Chỉnh tay ngày phép cho từng nhân sự

*(không cần import lại cả công ty cho mỗi lần điều chỉnh nhỏ)*

1. Làm theo mục **2** để mở **"Chi tiết phép"** của nhân sự.
2. Ở mỗi loại phép có nút **"Sửa"** (chỉ C&B thấy).
3. Nhập lại **số ngày còn lại / chuyển kỳ** + **lý do điều chỉnh** → **Lưu**.
4. Số dư cập nhật ngay; lưới tổng quan tự tính lại tổng.

> Dùng khi cần điều chỉnh 1–2 nhân sự lẻ. Import Excel cả công ty vẫn giữ nguyên cho đầu năm/đợt lớn.

---

## 4. Nhắc quản lý phê duyệt đơn treo *(tự động — không cần thao tác)*

- Khi có đơn nghỉ mới → hệ thống **báo ngay** cho người duyệt (quản lý + C&B).
- Nếu đơn **vẫn treo chưa duyệt**, hệ thống **tự nhắc lại**:
  - **Sau 3 ngày** — nhắc lần 1.
  - **Ngày thứ 4** — nhắc lần 2.
  - **Ngày thứ 5** — nhắc lần 3, rồi **dừng**.
- Nhắc chạy tự động lúc **09:00 mỗi ngày**, gửi qua **thông báo trong app + push điện thoại**.
- Người nhận nhắc: **quản lý trực tiếp** + **C&B** + người duyệt điều kiện đang chờ.

> C&B không phải làm gì — chỉ cần đảm bảo mục **1** đã gán đúng người duyệt cho phòng ban.

---

## 5. Hủy đơn nghỉ đã duyệt (nhân sự không nghỉ nữa, vẫn đi làm)

**Mở:** Trang **Tính năng** → nhóm **Chấm công** → **"Quản lý Phép"** → chuyển sang tab **"Đơn nghỉ"** (nút ở trên đầu).

1. Chọn **tháng** (và lọc Công ty/Phòng ban nếu cần).
2. Danh sách hiện các đơn **đã duyệt** trong tháng.
3. Đơn nào **nhân sự đã đi làm/chấm công vào ngày nghỉ** sẽ **viền đỏ + cảnh báo ⚠** kèm danh sách ngày đã đi làm → biết ngay đơn nào nên hủy.
4. Bấm **"Hủy đơn"** → nhập **lý do** → **Xác nhận hủy**.
5. Đơn chuyển trạng thái **Hủy**; nhân sự + người theo dõi **nhận thông báo**.

> **Lưu ý:** hủy đơn **KHÔNG tự cộng lại** ngày phép. Nếu cần trả lại ngày phép cho nhân sự, dùng mục **3 (chỉnh tay ngày phép)**.

---

*Mọi thao tác trên chỉ tài khoản C&B/Admin thực hiện được. Có vướng mắc báo lại IT.*

// Làm tròn số "công" (ngày công) về 1 chữ số thập phân kiểu CHẶN XUỐNG ở mốc .x5:
// chữ số thập phân thứ 2 >= 6 → làm tròn lên; <= 5 → làm tròn xuống.
// Ví dụ: 0.96 → 1.0, 0.95 → 0.9, 0.85 → 0.8, 0.05 → 0.0.
//
// CHỈ dùng cho HIỂN THỊ (CC Tháng, Trang chủ, Bảng lương, Xuất Excel).
// KHÔNG dùng để tính tiền lương — số liệu gốc giữ nguyên.
export function roundCong(x: number): number {
  return Math.floor(x * 10 + 0.4) / 10
}

export function fmtCong(x: number): string {
  return roundCong(x).toFixed(1)
}

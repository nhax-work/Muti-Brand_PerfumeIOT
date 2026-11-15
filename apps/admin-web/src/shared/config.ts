/** Cấu hình lúc build, đọc từ biến `VITE_*`. Chỗ duy nhất trong app được đọc `import.meta.env`. */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  /** Trang giới thiệu (landing) ở tên miền gốc. Không đặt thì trang xác thực ẩn nút "Về trang chủ". */
  landingUrl: import.meta.env.VITE_LANDING_URL || null,
} as const;

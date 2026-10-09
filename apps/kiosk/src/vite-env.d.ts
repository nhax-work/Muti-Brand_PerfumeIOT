/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gốc API. Mặc định `/api/v1` — cùng origin, dev đi qua proxy của Vite. */
  readonly VITE_API_BASE_URL?: string;
  /** Số serial của máy chạy kiosk này. Tham số `?serial=` trên URL được ưu tiên hơn. */
  readonly VITE_MACHINE_SERIAL?: string;
  /**
   * Kênh khách liên hệ khi gặp sự cố (hotline, Zalo…), hiện nguyên văn trên kiosk. Để trống thì
   * kiosk chỉ dặn khách lưu lại mã — máy chạy không có nhân viên (BR-001).
   */
  readonly VITE_SUPPORT_CONTACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

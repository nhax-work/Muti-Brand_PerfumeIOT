/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gốc API. Mặc định `/api/v1` — cùng origin, dev đi qua proxy của Vite. */
  readonly VITE_API_BASE_URL?: string;
  /** Địa chỉ landing, ví dụ `https://scentstation.id.vn`. Bỏ trống thì không hiện nút về trang chủ. */
  readonly VITE_LANDING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

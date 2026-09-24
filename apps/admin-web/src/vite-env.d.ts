/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gốc API. Mặc định `/api/v1` — cùng origin, dev đi qua proxy của Vite. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

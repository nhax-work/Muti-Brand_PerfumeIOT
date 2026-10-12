import { SPEC_CONSTRAINTS } from './constraints.generated';

/**
 * Cấu hình của kiosk. Chỗ duy nhất trong app được đọc `import.meta.env`.
 *
 * Ngưỡng thời gian lấy từ `SPEC_CONSTRAINTS` (sinh từ `spec/constraints.md` bằng
 * `npm run spec:generate`) — không hardcode (spec/PROJECT.md Mục 3).
 */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',

  /** `?serial=M001` trên URL, rồi tới biến môi trường lúc build. */
  machineSerial:
    new URLSearchParams(window.location.search).get('serial') ??
    import.meta.env.VITE_MACHINE_SERIAL ??
    'M001',

  /** NFR-USA-02: không thao tác quá chừng này thì về màn hình chính. */
  idleTimeoutMs: SPEC_CONSTRAINTS.KIOSK_IDLE_TIMEOUT_SEC * 1000,

  /**
   * Chu kỳ kiosk hỏi lại danh mục — cũng là cách nó phát hiện mất liên lạc với hệ thống
   * (FR-IOT-13). Đặc tả chưa có hằng riêng cho việc này nên dùng chu kỳ heartbeat của chính thiết
   * bị (FR-IOT-01); cần giá trị khác thì thêm hằng vào `spec/constraints.md`.
   */
  catalogPollMs: SPEC_CONSTRAINTS.HEARTBEAT_INTERVAL_SEC * 1000,

  /**
   * FR-ORD-11: trạng thái đơn phải hiện trên kiosk trong ORDER_STATUS_POLL_MAX_SEC. Poll dày gấp ba
   * để còn biên cho độ trễ mạng.
   */
  orderStatusPollMs: (SPEC_CONSTRAINTS.ORDER_STATUS_POLL_MAX_SEC * 1000) / 3,

  /** FR-ORD-25: thời gian khách có để bấm nút — hiện trong điều khoản trước khi trả tiền. */
  pressWindowSec: SPEC_CONSTRAINTS.DISPENSE_PRESS_WINDOW_SEC,

  /** NFR-USA-04: cỡ chữ tối thiểu, áp vào biến CSS `--kiosk-min-font` lúc khởi động. */
  minFontPx: SPEC_CONSTRAINTS.KIOSK_MIN_FONT_PX,

  /** FR-ORD-21: kênh hỗ trợ hiện cho khách khi gặp sự cố; `null` khi chưa cấu hình. */
  supportContact: import.meta.env.VITE_SUPPORT_CONTACT?.trim() || null,
} as const;

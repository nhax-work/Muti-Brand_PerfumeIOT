/**
 * Dữ liệu tĩnh gắn vào route qua `handle` của React Router.
 *
 * `keepAwake`: màn hình này không bị `useIdleReset` đá về trang chủ — dành cho thanh toán (khách
 * đang quét QR, có thể lâu hơn thời gian chờ) và đang xịt.
 */
export interface KioskRouteHandle {
  keepAwake?: boolean;
}

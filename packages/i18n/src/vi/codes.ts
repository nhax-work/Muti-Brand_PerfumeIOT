/**
 * Nhãn dễ hiểu cho các mã máy chủ trả về mà màn hình quản trị phải hiển thị — mã thất bại và lý do
 * chuyển trạng thái của đơn, chủ thể thực hiện, chủ doanh thu, trạng thái khóa kết nối, nguồn đổi
 * trạng thái máy. Mã mới chưa có nhãn thì màn hình hiện nguyên mã (xem `codeLabel` ở web quản trị).
 */

/** `orders.failure_code` và `order_status_histories.reason`. */
export const orderCode = {
  ORDER_CREATED: 'Tạo đơn',
  PAYMENT_REQUESTED: 'Hiện mã QR thanh toán',
  PAYMENT_CONFIRMED: 'Đã nhận tiền',
  DISPENSE_REQUESTED: 'Đã gửi lệnh xịt tới máy',
  DISPENSE_CONFIRMED: 'Máy xác nhận đã xịt',
  ORDER_PAYMENT_TTL: 'Quá hạn thanh toán',
  CUSTOMER_CANCELLED: 'Khách hủy trên kiosk',
  PAID_AFTER_EXPIRY: 'Tiền về sau khi đơn đã hết hạn',
  PAID_AFTER_CANCEL: 'Tiền về sau khi khách đã hủy',
  REFUND_CLAIM_ACCEPTED: 'Chấp nhận phiếu khiếu nại',
  MANUAL_REFUND_RECORDED: 'Đã ghi nhận hoàn tiền',
  QUEUE_TIMEOUT: 'Chờ lượt quá lâu, máy chưa phục vụ được',
  PRESS_TIMEOUT: 'Khách không bấm nút kịp',
  ACTUATOR_FAULT: 'Bơm xịt gặp sự cố',
  NO_CURRENT: 'Bơm không chạy',
  HARD_TIMEOUT: 'Bơm chạy quá lâu, đã tự ngắt',
  DOOR_OPEN: 'Cửa máy đang mở',
  SLOT_EMPTY: 'Ngăn đã hết nước hoa',
  SLOT_UNAVAILABLE: 'Ngăn chưa sẵn sàng',
  MACHINE_IN_MAINTENANCE: 'Máy đang bảo trì',
  CMD_EXPIRED: 'Lệnh xịt tới máy quá muộn',
  CMD_INVALID_SIGNATURE: 'Máy từ chối lệnh không hợp lệ',
  CMD_WRONG_MACHINE: 'Lệnh gửi nhầm máy',
  CMD_DUPLICATE: 'Lệnh bị gửi trùng',
  UNKNOWN: 'Không xác định được kết quả',
} as const;

export const actorType = {
  SYSTEM: 'Hệ thống',
  USER: 'Nhân viên',
  DEVICE: 'Máy',
  PAYMENT_PROVIDER: 'Cổng thanh toán',
} as const;

export const revenueOwner = {
  BRAND: 'Thương hiệu',
  PLATFORM: 'Nền tảng',
} as const;

export const credentialStatus = {
  ACTIVE: 'Đang dùng',
  REVOKED: 'Đã thu hồi',
  EXPIRED: 'Hết hạn',
} as const;

/** `machine_status_histories.source`. */
export const statusSource = {
  HEARTBEAT: 'Máy tự báo',
  OPERATOR: 'Nhân viên',
  SYSTEM: 'Hệ thống',
} as const;

export const alr = {
  notificationNotFound: 'Không tìm thấy thông báo hoặc bằng chứng gửi này.',
  retryOnlyFailed: 'Chỉ gửi lại được email ở trạng thái gửi thất bại (FAILED).',
  alertNotFound: 'Không tìm thấy cảnh báo này.',
  alreadyAcknowledged: 'Cảnh báo đã được tiếp nhận trước đó.',
  alreadyClosed: 'Cảnh báo đã ở trạng thái đóng (CLOSED).',
  cannotCloseUnresolved: 'Cảnh báo chưa được xử lý, không thể đóng.',
  resolutionRequired: 'Cần nhập nội dung xử lý trước khi hoàn thành.',
  cannotAssignClosed: 'Không thể phân công cảnh báo đã đóng.',
  cannotResolveClosed: 'Không thể xử lý cảnh báo đã đóng.',
} as const;

export const alertSeverity = {
  INFO: 'Thông tin',
  WARNING: 'Cảnh báo',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
} as const;

export const alertStatus = {
  OPEN: 'Mới mở',
  ACKNOWLEDGED: 'Đã tiếp nhận',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã xử lý',
  CLOSED: 'Đã đóng',
} as const;

export const notificationStatus = {
  PENDING: 'Đang chờ gửi',
  SENT: 'Đã gửi thành công',
  FAILED: 'Gửi thất bại',
  READ: 'Đã đọc',
} as const;

export const notificationChannel = {
  EMAIL: 'Email',
  IN_APP: 'Trong ứng dụng',
} as const;

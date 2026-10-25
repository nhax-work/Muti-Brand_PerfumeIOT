export const alr = {
  notificationNotFound: 'Không tìm thấy thông báo hoặc bằng chứng gửi này.',
  retryOnlyFailed: 'Chỉ gửi lại được email ở trạng thái gửi thất bại (FAILED).',
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

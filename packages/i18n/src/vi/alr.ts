export const alr = {
  notificationNotFound: 'Không tìm thấy thông báo hoặc bằng chứng gửi này.',
  retryOnlyFailed: 'Chỉ có thể thử gửi lại cho các thông báo có trạng thái gửi thất bại (FAILED).',
  emailChannelRequired:
    'Chỉ có thể gửi lại đối với thông báo qua kênh Email và có địa chỉ người nhận.',
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

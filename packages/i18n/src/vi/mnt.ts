export const mnt = {
  ticketNotFound: 'Không tìm thấy phiếu bảo trì',
  cannotAssignClosed: 'Không thể phân công phiếu đã đóng',
  cannotResolveClosed: 'Không thể xử lý phiếu đã đóng',
  invalidStaff: 'Nhân viên vận hành được chọn không hợp lệ',
  diagnosisRequired: 'Chẩn đoán sự cố là bắt buộc',
  correctiveActionRequired: 'Biện pháp khắc phục là bắt buộc',
  checklistIncomplete: 'Checklist kiểm tra sau bảo trì chưa hoàn thành',
  postTestIncomplete:
    'Máy còn phiếu bảo trì chưa hoàn tất checklist sau bảo trì (yêu cầu PASS để trở lại NORMAL)',
  ticketClosed: 'Phiếu bảo trì đã đóng',
} as const;

export const ticketStatus = {
  OPEN: 'Mới tạo',
  ASSIGNED: 'Đã phân công',
  IN_PROGRESS: 'Đang xử lý',
  WAITING_PART: 'Chờ linh kiện',
  POST_TEST: 'Kiểm tra sau bảo trì',
  RESOLVED: 'Đã xử lý',
  CLOSED: 'Đã đóng',
  REOPENED: 'Mở lại',
} as const;

export const ticketPriority = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Khẩn cấp',
} as const;

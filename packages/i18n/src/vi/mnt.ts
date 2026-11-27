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
  evidenceFileRequired: 'Vui lòng chọn tệp ảnh bằng chứng',
  evidenceFileTooLarge: 'Kích thước ảnh bằng chứng vượt quá giới hạn cho phép',
  evidenceUnsupported: 'Định dạng ảnh bằng chứng không được hỗ trợ (chỉ nhận JPEG, PNG, WebP)',
  // ADR-0029: phân công phiếu bảo trì
  ticketAssignedSubject: 'Bạn được giao phiếu bảo trì {ticket}',
  ticketAssignedContent:
    'Bạn được giao phiếu bảo trì {ticket} tại máy {machine}, độ ưu tiên {priority}. Hạn xử lý: {deadline}.',
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

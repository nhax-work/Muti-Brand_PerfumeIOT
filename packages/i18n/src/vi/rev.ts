/**
 * Kỳ chi trả doanh thu, bảng đối soát và doanh thu tách hai nguồn (FR-SLT-17, 18, 52..54, FR-REV-04,
 * ADR-0013). Người đọc là Brand Admin và Super Admin trên web quản trị.
 */
export const rev = {
  payoutNotConfirmed: 'Chỉ ghi nhận chuyển khoản được cho kỳ đã chốt số liệu (CONFIRMED)',
  payoutDisputeOpen:
    'Kỳ này còn khiếu nại chưa được trả lời. Hãy trả lời khiếu nại trước khi chuyển khoản.',
  brandNotVerified:
    'Thương hiệu chưa được xác minh pháp nhân hoặc chưa khai tài khoản nhận doanh thu nên chưa chuyển khoản được',
  disputeBrandOnly: 'Chỉ Brand Admin của thương hiệu mới gửi khiếu nại số liệu được',
  disputeNotAllowed: 'Chỉ khiếu nại được kỳ đã chốt số liệu và chưa từng khiếu nại',
  noOpenDispute: 'Kỳ này không có khiếu nại nào đang chờ trả lời',
  brandIdRequired: 'Chọn thương hiệu cần xem bảng đối soát',
  periodEndBeforeStart: 'Ngày kết thúc phải sau ngày bắt đầu',
  // Thông báo trong ứng dụng
  payoutDisputedSubject: 'Thương hiệu khiếu nại số liệu kỳ chi trả {period}',
  payoutDisputedContent:
    'Một thương hiệu vừa gửi khiếu nại số liệu kỳ chi trả tháng {period}. Kỳ này không chuyển khoản được cho tới khi khiếu nại được trả lời.',
  payoutDisputeAnsweredSubject: 'Khiếu nại kỳ chi trả {period} đã được trả lời',
  payoutDisputeAnsweredContent:
    'Nền tảng đã trả lời khiếu nại số liệu kỳ chi trả tháng {period}. Xem chi tiết trong mục Kỳ chi trả.',
  payoutPaidSubject: 'Đã chuyển khoản doanh thu kỳ {period}',
  payoutPaidContent:
    'Nền tảng đã chuyển khoản doanh thu lượt xịt kỳ tháng {period}. Mã giao dịch có trong mục Kỳ chi trả.',
} as const;

/**
 * Đơn hàng và thanh toán (FR-ORD-01..24). Câu khách đọc trên kiosk viết bằng ngôn ngữ thông thường,
 * kèm việc cần làm tiếp (NFR-USA-03).
 */
export const ord = {
  machineNotFound: 'Không tìm thấy máy',
  slotNotFound: 'Không tìm thấy ngăn này trên máy',
  machineOffline: 'Máy đang mất kết nối. Vui lòng thử lại sau ít phút.',
  machineInMaintenance: 'Máy đang bảo trì. Vui lòng quay lại sau.',
  slotUnavailable: 'Mùi hương này tạm hết. Vui lòng chọn mùi khác.',
  machineBusy: 'Máy đang phục vụ khách khác. Vui lòng chờ trong giây lát.',
  orderNotFound: 'Không tìm thấy đơn hàng',
  orderNotCancellable: 'Hệ thống đã nhận được tiền của bạn nên không hủy đơn được nữa.',
  idempotencyKeyReused: 'Mã yêu cầu đã được dùng cho một lựa chọn khác',
  paymentProviderUnknown: 'Cổng thanh toán không được hỗ trợ',
  webhookMalformed: 'Dữ liệu thông báo thanh toán không đọc được',
  webhookSignatureInvalid: 'Chữ ký thông báo thanh toán không hợp lệ',
  paymentReferenceUnknown: 'Không tìm thấy giao dịch ứng với mã tham chiếu',
  amountMismatch: 'Số tiền thanh toán không khớp với đơn',
  // Phiếu khiếu nại hoàn tiền (ADR-0012)
  claimNotFound: 'Không tìm thấy khiếu nại. Vui lòng quét lại mã QR trên máy.',
  orderNotClaimable: 'Đơn này không thuộc trường hợp được hoàn tiền.',
  claimAlreadyOpen: 'Đơn này đã được gửi khiếu nại. Chúng tôi sẽ liên hệ bạn sớm.',
  claimNotAssigned: 'Chỉ nhân viên được phân công cho phiếu này mới thực hiện được thao tác',
  claimClosed: 'Phiếu khiếu nại đã đóng',
  claimFeatureDisabled: 'Chưa cấu hình khóa mã hóa cho phiếu khiếu nại (REFUND_ACCOUNT_ENC_KEY)',
  assigneeNotOperations: 'Người nhận xử lý phải là Operations Staff đang hoạt động',
  claimRateLimited: 'Bạn gửi quá nhiều lần. Vui lòng thử lại sau một phút.',
} as const;

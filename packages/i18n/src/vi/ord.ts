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
  claimFeatureDisabled:
    'Chức năng khiếu nại hoàn tiền chưa được bật. Vui lòng liên hệ bộ phận kỹ thuật.',
  assigneeNotOperations: 'Người nhận xử lý phải là Operations Staff đang hoạt động',
  claimRateLimited: 'Bạn gửi quá nhiều lần. Vui lòng thử lại sau một phút.',
  orderRateLimited: 'Máy đang nhận quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
  // Thông báo trong ứng dụng cho nhân sự nền tảng
  claimSubmittedSubject: 'Phiếu khiếu nại hoàn tiền mới: {amount} {currency}',
  claimSubmittedContent:
    'Khách vừa gửi phiếu khiếu nại hoàn tiền {amount} {currency} cho đơn {orderId}. ' +
    'Hạn xử lý: {deadline}.',
  claimAssignedSubject: 'Bạn được giao phiếu khiếu nại hoàn tiền',
  claimAssignedContent:
    'Bạn được giao xử lý phiếu khiếu nại hoàn tiền {amount} {currency} của đơn {orderId}. ' +
    'Hạn xử lý: {deadline}.',
  manualReviewSubject: 'Đơn cần kiểm tra thủ công: {amount} {currency}',
  manualReviewContent:
    'Đơn {orderId} đã nhận tiền nhưng chưa giao được lượt xịt bình thường. ' +
    'Kiểm tra trong mục Đơn cần kiểm tra và hoàn tiền nếu cần.',
  // Email gửi khách và tra cứu phiếu (ADR-0031) — không bao giờ chèn tài khoản ngân hàng vào đây.
  claimLookupRateLimited: 'Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau một phút.',
  claimReceiptEmailSubject: 'ScentStation đã nhận khiếu nại {code}',
  claimReceiptEmailBody:
    'Chúng tôi đã nhận khiếu nại hoàn tiền của bạn.\n\n' +
    'Mã khiếu nại: {code}\n' +
    'Số tiền: {amount} {currency}\n' +
    'Hạn xử lý dự kiến: {deadline}\n\n' +
    'Xem tiến độ tại: {link}\n\n' +
    'Hãy giữ lại mã khiếu nại. Email này được gửi tự động, vui lòng không trả lời.',
  claimClosedEmailSubject: 'Khiếu nại {code} đã có kết quả',
  claimClosedEmailBody:
    'Khiếu nại hoàn tiền {code} của bạn đã có kết quả: {outcome}.\n\n' +
    'Xem chi tiết tại: {link}\n\n' +
    'Email này được gửi tự động, vui lòng không trả lời.',
  claimOutcomeRefunded: 'đã hoàn tiền',
  claimOutcomeRejected: 'không được chấp nhận',
  claimOutcomeExpired: 'đã hết hạn xử lý',
} as const;

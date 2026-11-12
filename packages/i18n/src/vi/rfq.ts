/**
 * Yêu cầu bổ sung nước hoa (FR-RFQ-01 ÷ 12, ADR-0018). Người đọc là Brand Admin, Super Admin và
 * Inventory Staff trên web quản trị.
 */
export const rfq = {
  brandAccountOnly: 'Chỉ Brand Admin của thương hiệu thuê slot mới gửi yêu cầu bổ sung được',
  rentalNotActive:
    'Hóa đơn của slot chưa thanh toán hoặc đã kết thúc nên chưa nhận yêu cầu bổ sung',
  productNotConfigured:
    'Slot chưa được cấu hình sản phẩm — cấu hình sản phẩm trước khi yêu cầu bổ sung',
  requestPending: 'Slot này đang có yêu cầu bổ sung chưa hoàn tất',
  rejectionReasonRequired: 'Bắt buộc nhập lý do từ chối',
  scheduleInPast: 'Thời điểm xử lý phải ở tương lai',
  requestNotForSlot: 'Yêu cầu bổ sung không thuộc slot của phiếu nạp này',
  requestNotLinkable:
    'Yêu cầu bổ sung chưa được chấp nhận, đã kết thúc hoặc đã gắn với phiếu nạp khác',
  invalidTransition: 'Không chuyển được yêu cầu từ {from} sang {to}',
  requestInProgress: 'Yêu cầu đang được xử lý bằng một phiếu nạp nên không hủy được',
  // Thông báo trong ứng dụng
  newRequestSubject: 'Yêu cầu bổ sung mới: {brand} — máy {machine}, slot {slot}',
  newRequestContent:
    'Thương hiệu {brand} yêu cầu bổ sung {product} cho slot {slot} của máy {machine}. Vui lòng xem xét và chấp nhận hoặc từ chối.',
  acceptedSubject: 'Yêu cầu bổ sung slot {slot} đã được chấp nhận',
  acceptedContent:
    'Yêu cầu bổ sung {product} cho slot {slot} máy {machine} đã được chấp nhận. Kho sẽ lên lịch nạp.',
  rejectedSubject: 'Yêu cầu bổ sung slot {slot} bị từ chối',
  rejectedContent:
    'Yêu cầu bổ sung {product} cho slot {slot} máy {machine} bị từ chối. Lý do: {reason}.',
  scheduledSubject: 'Đã lên lịch bổ sung slot {slot}',
  scheduledContent: 'Việc bổ sung {product} cho slot {slot} máy {machine} được lên lịch lúc {at}.',
  cancelledSubject: 'Yêu cầu bổ sung slot {slot} đã bị hủy',
  cancelledContent:
    'Yêu cầu bổ sung {product} cho slot {slot} máy {machine} đã bị hủy trước khi nạp.',
  completedSubject: 'Đã bổ sung xong slot {slot}',
  completedContent: 'Slot {slot} máy {machine} đã được nạp {product} theo yêu cầu của bạn.',
} as const;

export const refillRequestStatus = {
  SUBMITTED: 'Đã gửi',
  ACCEPTED: 'Đã chấp nhận',
  REJECTED: 'Bị từ chối',
  SCHEDULED: 'Đã lên lịch',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
} as const;

export const refillRequestReason = {
  LOW_STOCK: 'Sắp hết hàng',
  EXPIRING: 'Hàng sắp hết hạn',
  PRODUCT_CHANGE: 'Đổi sản phẩm',
} as const;

/**
 * Tồn kho, Khai báo gửi hàng, Giấy tờ chính hãng và Phiếu nạp (FR-INV-01..35).
 */
export const inv = {
  shipmentDeclared: 'Đã tạo khai báo gửi hàng đến kho',
  shipmentReceived: 'Đã xác nhận tiếp nhận hàng tại kho',
  shipmentDiscrepancy: 'Đã ghi nhận đối soát có chênh lệch số lượng',
  batchCreated: 'Đã tạo lô hàng tồn kho mới',
  batchNotApproved: 'Lô hàng chưa được phê duyệt giấy tờ chính hãng',
  batchApproved: 'Đã duyệt giấy tờ chính hãng cho lô hàng',
  batchRejected: 'Đã từ chối giấy tờ chính hãng cho lô hàng',
  authenticitySubmitted: 'Đã nộp giấy tờ chính hãng để chờ duyệt',
  bottleRegistered: 'Đã đăng ký chai nước hoa vào kho',
  refillSessionOpened: 'Đã mở phiếu nạp nước hoa',
  refillSessionClosed: 'Đã hoàn tất phiếu nạp và kiểm tra an toàn',
  checklistRequired: 'Bắt buộc hoàn thành checklist an toàn trước khi đóng phiếu',
} as const;

export const shipmentStatus = {
  DECLARED: 'Đã khai báo',
  RECEIVED: 'Đã nhận khớp',
  DISCREPANCY: 'Lệch số lượng',
  CANCELLED: 'Đã hủy',
} as const;

export const authenticityStatus = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Chính hãng (Đã duyệt)',
  REJECTED: 'Từ chối duyệt',
} as const;

export const refillSessionStatus = {
  STARTED: 'Đang thao tác',
  COMPLETED: 'Hoàn tất',
  ABORTED: 'Hủy bỏ',
} as const;

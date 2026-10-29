/**
 * Tồn kho, Khai báo gửi hàng, Giấy tờ chính hãng và Phiếu nạp (FR-INV-01..35).
 */
export const inv = {
  shipmentDeclared: 'Đã tạo khai báo gửi hàng đến kho',
  shipmentReceived: 'Đã xác nhận tiếp nhận hàng tại kho',
  shipmentDiscrepancy: 'Đã ghi nhận đối soát có chênh lệch số lượng',
  batchCreated: 'Đã tạo lô hàng tồn kho mới',
  batchNotApproved: 'Lô của chai này chưa được duyệt giấy tờ chính hãng — chưa lắp vào slot được',
  batchApproved: 'Đã duyệt giấy tờ chính hãng cho lô hàng',
  batchRejected: 'Đã từ chối giấy tờ chính hãng cho lô hàng',
  authenticitySubmitted: 'Đã nộp giấy tờ chính hãng để chờ duyệt',
  bottleRegistered: 'Đã đăng ký chai nước hoa vào kho',
  refillSessionOpened: 'Đã mở phiếu nạp nước hoa',
  refillSessionClosed: 'Đã hoàn tất phiếu nạp và kiểm tra an toàn',
  checklistRequired: 'Bắt buộc hoàn thành checklist an toàn trước khi đóng phiếu',

  brandAccountOnly: 'Chỉ tài khoản thuộc thương hiệu mới thực hiện được thao tác này',
  productNotOwned: 'Sản phẩm không thuộc thương hiệu của bạn',
  shipmentNotFound: 'Không tìm thấy khai báo gửi hàng',
  shipmentAlreadyProcessed: 'Khai báo này đã được tiếp nhận hoặc đã hủy',
  discrepancyNotesRequired: 'Số thực nhận lệch số khai báo — bắt buộc ghi chú lý do',
  batchNumberTaken: 'Số lô này đã tồn tại cho sản phẩm của thương hiệu',
  batchNotFound: 'Không tìm thấy lô hàng',
  authenticityAlreadyApproved: 'Lô đã được duyệt giấy tờ chính hãng, không nộp lại được',
  authenticityNotPending: 'Lô không ở trạng thái chờ duyệt giấy tờ',
  documentSubmissionExpired:
    'Đã quá hạn nộp giấy tờ chính hãng ({days} ngày kể từ khi thanh toán hóa đơn)',
  reasonRequired: 'Bắt buộc nhập lý do',
  bottleIdentifierTaken: 'Mã định danh chai đã tồn tại trong thương hiệu',
  bottleNotFound: 'Không tìm thấy chai',
  bottleNotOwned: 'Chai không thuộc thương hiệu đang thuê slot',
  bottleNotInStock: 'Chai không còn trong kho (đã lắp, hỏng, hết hoặc đã trả)',
  bottleExpired: 'Chai đã quá hạn sử dụng',
  productMismatch: 'Sản phẩm của chai khác sản phẩm thương hiệu đã cấu hình cho slot',
  slotNotFound: 'Không tìm thấy slot',
  machineBusy: 'Máy còn đơn chờ thanh toán hoặc lượt xịt đang chờ khách — thử lại sau',
  rentalNotStockable: 'Slot chưa có hóa đơn thuê đã thanh toán nên chưa nhận chai',
  refillSessionOpen: 'Slot đang có phiếu nạp mở',
  refillSessionNotOpen: 'Phiếu nạp đã đóng hoặc đã hủy',
  refillSessionNotFound: 'Không tìm thấy phiếu nạp',
  damageReasonRequired: 'Bắt buộc nhập lý do hư hỏng',
  bottleAlreadyDamaged: 'Chai này đã được ghi nhận hư hỏng',
  bottleHandedOver:
    'Chai đã bàn giao trả thương hiệu, nền tảng không còn giữ nên không ghi nhận hư hỏng được',

  newShipmentSubject: 'Khai báo gửi hàng mới: {product}',
  newShipmentContent: 'Thương hiệu vừa khai báo gửi {quantity} chai {product} đến kho.',
  authenticityApprovedSubject: 'Lô {batch} đã được duyệt giấy tờ chính hãng',
  authenticityApprovedContent:
    'Giấy tờ chính hãng của lô {batch} ({product}) đã được duyệt. Chai của lô này lắp được vào slot.',
  authenticityRejectedSubject: 'Lô {batch} bị từ chối giấy tờ chính hãng',
  authenticityRejectedContent:
    'Giấy tờ chính hãng của lô {batch} ({product}) bị từ chối. Lý do: {reason}. Vui lòng nộp lại.',
  lowStockAlertTitle: 'Slot {slot} sắp hết nước hoa',
  lowStockAlertContent:
    'Slot {slot} còn {remainingMl} ml (khoảng {sprays} lượt), dưới ngưỡng {thresholdMl} ml.',
  slotEmptyAlertTitle: 'Slot {slot} đã hết nước hoa',
  slotEmptyAlertContent:
    'Slot {slot} còn {remainingMl} ml, không đủ một lượt {dosageMl} ml — slot đã ngừng bán.',
} as const;

export const shipmentStatus = {
  DECLARED: 'Đã khai báo',
  RECEIVED: 'Đã nhận khớp',
  DISCREPANCY: 'Lệch số lượng',
  CANCELLED: 'Đã hủy',
} as const;

export const authenticityStatus = {
  NOT_SUBMITTED: 'Chưa nộp giấy tờ',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Chính hãng (Đã duyệt)',
  REJECTED: 'Từ chối duyệt',
} as const;

export const bottleStatus = {
  IN_STOCK: 'Trong kho',
  INSTALLED: 'Đang lắp',
  LOW: 'Sắp hết',
  EMPTY: 'Đã hết',
  DAMAGED: 'Hư hỏng',
  EXPIRED: 'Hết hạn',
  LIQUIDATED: 'Đã thanh lý',
  RETURNED_TO_BRAND: 'Chờ trả thương hiệu',
} as const;

export const refillSessionStatus = {
  STARTED: 'Đang thao tác',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
} as const;

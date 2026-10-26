/** Hóa đơn thuê slot và bảng giá (FR-SLT, ADR-0006). */
export const slt = {
  packageNameTaken: 'Đã có gói thuê mang tên này',
  storagePlanNameTaken: 'Đã có gói bảo quản mang tên này',
  lastActiveStoragePlan:
    'Không thể ngừng mở bán gói bảo quản cuối cùng — mỗi lượt thuê bắt buộc chọn một gói bảo quản',
  slotNotForRent: 'Slot chưa được mở cho thuê hoặc không có giá niêm yết',
  emptyCart: 'Giỏ hàng không được rỗng',
  duplicateSlotInCart: 'Không thể chọn cùng một slot nhiều lần trong một phiên thanh toán',
  storagePlanRequired: 'Gói bảo quản là bắt buộc cho mỗi slot trong phiên thanh toán',
  packageNotFoundOrInactive: 'Gói thuê không tồn tại hoặc đã ngừng mở bán',
  planNotFoundOrInactive: 'Gói bảo quản không tồn tại hoặc đã ngừng mở bán',
  productDiscontinued: 'Sản phẩm đã ngừng kinh doanh, không thể gán vào slot',
  invalidPricePerSpray: 'Giá mỗi lượt xịt phải lớn hơn 0',
  slotOccupied: 'Slot đã được thuê hoặc đang bị giữ chỗ',
  rentalNotActive: 'Hóa đơn chưa thanh toán hoặc đã kết thúc',
  productNotOwned: 'Sản phẩm không thuộc thương hiệu thuê slot',
  emailNotVerified: 'Tài khoản chưa xác minh email, không thể tạo phiên thanh toán',
  agreementNotAccepted: 'Thương hiệu chưa đồng ý phiên bản hợp đồng khung hiện hành',
  agreementNotFound: 'Không tìm thấy phiên bản hợp đồng khung',
  agreementNotCurrent: 'Chỉ đồng ý được phiên bản hợp đồng khung hiện hành',
  agreementContentChanged: 'Nội dung hợp đồng khung đã thay đổi, vui lòng mở lại để xem bản mới',
  holdLimitReached:
    'Số slot giữ chỗ chưa thanh toán vượt quá giới hạn tối đa (tối đa 5 slot cho mỗi thương hiệu)',
  slotSwapNotAllowed:
    'Không thể đổi slot do quá thời hạn 48 giờ, đã lắp chai, đã đổi trước đó hoặc slot đích khác giá niêm yết',
  annexNotAccepted: 'Chưa đồng ý phụ lục điều khoản của phiên thanh toán',
  annexNotFound: 'Không tìm thấy phụ lục điều khoản cho phiên thanh toán này',
  annexContentChanged: 'Nội dung phụ lục đã thay đổi, vui lòng tải lại để xem bản mới nhất',
  slotSwapDifferentMachine: 'Chỉ có thể đổi sang slot trống trên cùng máy',
  slotSwapDifferentPrice: 'Slot đích phải có cùng giá thuê niêm yết với slot hiện tại',
  slotSwapTimeExpired: 'Đã quá thời hạn 48 giờ kể từ lúc thanh toán để đổi slot',
  slotSwapAlreadySwapped: 'Hóa đơn này đã được đổi slot một lần, không thể đổi tiếp',
  slotSwapBottleInstalled: 'Hóa đơn đã lắp chai đầu tiên, không thể đổi slot',
  slotSwapNotDraft: 'Hóa đơn không ở trạng thái chờ nạp hàng (DRAFT), không thể đổi slot',
  slotSwapUnpaid: 'Hóa đơn chưa thanh toán, không thể đổi slot',
  checkoutPaidSubject: '[ScentStation] Xác nhận thanh toán thuê slot thành công ({invoices})',
  checkoutPaidContent:
    'Phiên thanh toán thuê slot {checkout} đã được xác nhận lúc {paidAt}. Mã hóa đơn: {invoices}. ' +
    'Bước tiếp theo: khai báo lô hàng gửi kho, nộp giấy tờ chính hãng và cấu hình sản phẩm cho slot. ' +
    'Thông báo này được lưu làm bằng chứng đối soát.',
  // Bảo hiểm hàng hóa (FR-SLT-44 ÷ 46, ADR-0018)
  compensationAlreadyPaid: 'Khoản bồi thường này đã được ghi nhận chi trả',
  compensationCreatedSubject: 'Chai {bottle} hư hỏng — đã ghi nhận khoản bồi thường {amount} đ',
  compensationCreatedContent:
    'Chai {bottle} bị hư hỏng khi nền tảng đang giữ. Khoản bồi thường {amount} đ theo gói bảo quản đã được ghi nhận và chờ chi trả.',
  compensationPaidSubject: 'Đã chi trả bồi thường chai {bottle}',
  compensationPaidContent:
    'Khoản bồi thường {amount} đ cho chai {bottle} đã được chuyển khoản. Mã giao dịch: {reference}.',
} as const;

export const storageCompensationStatus = {
  PENDING: 'Chờ chi trả',
  PAID: 'Đã chi trả',
} as const;

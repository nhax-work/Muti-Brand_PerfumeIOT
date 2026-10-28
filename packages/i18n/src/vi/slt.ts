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
  rentalActivatedSubject: '[ScentStation] Hóa đơn thuê slot bắt đầu có hiệu lực ({invoiceNumber})',
  rentalActivatedContent:
    'Hóa đơn thuê slot {invoiceNumber} đã bắt đầu có hiệu lực từ {startsAt} đến {endsAt}. ' +
    'Thông báo này được lưu làm bằng chứng đối soát.',
  rentalExpiringT7Subject: '[ScentStation] Cảnh báo hóa đơn thuê slot sắp hết hạn trong 7 ngày',
  rentalExpiringT7Content:
    'Các hóa đơn sau sắp hết hạn vào ngày {expiryDate}: {invoices}. ' +
    'Vui lòng truy cập hệ thống để gia hạn hoặc rút lại yêu cầu không gia hạn: {actionLinks}',
  rentalExpiringT3Subject:
    '[ScentStation] Nhắc nhở lần 2: Hóa đơn thuê slot sắp hết hạn trong 3 ngày',
  rentalExpiringT3Content:
    'Các hóa đơn sau sắp hết hạn vào ngày {expiryDate}: {invoices}. ' +
    'Nếu không gia hạn trước ngày kết thúc, hóa đơn sẽ chuyển sang giai đoạn ân hạn có tính phí lưu kho và nguy cơ thanh lý hàng tồn: {actionLinks}',
  rentalGraceEnteredSubject:
    '[ScentStation] Hóa đơn thuê slot đã chuyển sang giai đoạn ân hạn ({invoiceNumber})',
  rentalGraceEnteredContent:
    'Hóa đơn {invoiceNumber} đã hết hạn và chuyển sang giai đoạn ân hạn đến ngày {graceEndsAt}. ' +
    'Phí ân hạn phát sinh hằng ngày. Quý khách vui lòng gia hạn để duy trì slot và tránh thanh lý hàng tồn.',
  rentalRenewedSubject: '[ScentStation] Gia hạn hóa đơn thuê slot thành công ({invoiceNumber})',
  rentalRenewedContent:
    'Hóa đơn gia hạn {invoiceNumber} đã được kích hoạt thành công, bắt đầu từ {startsAt} đến {endsAt}. ' +
    'Hóa đơn cũ đã chuyển sang trạng thái RENEWED và việc tính phí ân hạn (nếu có) đã dừng lại.',
  rentalNotLiquidated: 'Hóa đơn không ở trạng thái thanh lý',
  rentalBottleStillActive:
    'Không thể đóng hóa đơn do chai nước hoa trong slot vẫn còn dung lượng và chưa tháo',
  rentalLiquidatedSubject: '[ScentStation] Hóa đơn thuê slot đã được thanh lý ({invoiceNumber})',
  rentalLiquidatedContent:
    'Hóa đơn {invoiceNumber} đã quá thời hạn ân hạn và được chuyển sang thanh lý. Toàn bộ chai tồn tại slot đã chuyển quyền sở hữu sang nền tảng.',
  rentalClosedSubject: '[ScentStation] Hóa đơn thuê slot đã đóng ({invoiceNumber})',
  rentalClosedContent: 'Hóa đơn {invoiceNumber} đã được đóng và slot đã được giải phóng.',
} as const;

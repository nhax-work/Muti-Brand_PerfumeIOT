/**
 * Trả hàng khi không gia hạn (FR-EXP-26..28, ADR-0014).
 */
export const exp = {
  returnNotFound: 'Không tìm thấy phiếu trả hàng',
  forbiddenBrandScope: 'Không có quyền truy cập phiếu trả hàng của thương hiệu khác',
  rentalNotFound: 'Không tìm thấy hóa đơn thuê slot',
  rentalRenewalNotDeclined: 'Chỉ lập phiếu trả hàng cho các slot đã xác nhận không gia hạn thuê',
  bottlesRequired: 'Bắt buộc chọn ít nhất một chai để lập phiếu trả hàng',
  bottleNotFound: 'Không tìm thấy chai nước hoa trong hệ thống',
  bottleNotOwnedByBrand: 'Chai nước hoa không thuộc sở hữu của thương hiệu thuê slot',
  returnAlreadyClosed: 'Phiếu trả hàng đã được bàn giao hoặc đã thanh lý',
  trackingNumberRequiredForShipping: 'Bắt buộc nhập mã vận đơn khi trả hàng qua đường vận chuyển',
  // Thông báo cho Brand Admin — trong ứng dụng và email (FR-ALR-16 sự kiện 5, 6, 7)
  bottleReturnReadySubject: '[ScentStation] Hàng trả về đã sẵn sàng ({invoiceNumber})',
  bottleReturnReadyContent:
    'Hóa đơn {invoiceNumber} đã kết thúc và {count} chai đã được tháo khỏi slot. ' +
    'Hình thức nhận: {method}. Hạn bàn giao: {deadline}. ' +
    'Quá hạn mà hàng chưa được bàn giao, số chai này sẽ chuyển quyền sở hữu sang nền tảng.',
  bottleReturnReminderSubject: '[ScentStation] Sắp hết hạn nhận lại hàng ({invoiceNumber})',
  bottleReturnReminderContent:
    'Hạn bàn giao hàng trả về của hóa đơn {invoiceNumber} là {deadline}. ' +
    'Sau hạn này, các chai chưa được bàn giao sẽ bị thanh lý và chuyển quyền sở hữu sang nền tảng.',
  bottleReturnForfeitedSubject:
    '[ScentStation] Hàng trả về quá hạn đã được thanh lý ({invoiceNumber})',
  bottleReturnForfeitedContent:
    'Hàng trả về của hóa đơn {invoiceNumber} đã quá hạn bàn giao ({deadline}). ' +
    'Các chai trong phiếu trả hàng đã chuyển quyền sở hữu sang nền tảng.',
} as const;

export const bottleReturnMethod = {
  WAREHOUSE_PICKUP: 'Nhận tại kho',
  SHIP_TO_BRAND: 'Giao tận nơi cho thương hiệu',
} as const;

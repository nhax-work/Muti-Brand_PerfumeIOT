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
} as const;

export const bottleReturnMethod = {
  PICKUP_AT_STATION: 'Nhận tại trạm / kho',
  SHIP_TO_BRAND: 'Giao tận nơi cho thương hiệu',
} as const;

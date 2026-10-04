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
} as const;

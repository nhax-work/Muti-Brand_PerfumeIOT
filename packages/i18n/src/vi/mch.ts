/** Máy, slot và địa điểm (FR-MCH-01..17). */
export const mch = {
  locationNotFound: 'Không tìm thấy địa điểm',
  locationCodeTaken: 'Mã địa điểm "{code}" đã được sử dụng',
  locationInactive: 'Địa điểm không tồn tại hoặc không còn hoạt động',
  newLocationInactive: 'Địa điểm mới không tồn tại hoặc không còn hoạt động',

  machineNotFound: 'Không tìm thấy máy',
  serialTaken: 'Số sê-ri "{serialNumber}" đã tồn tại',
  slotCountPositive: 'Số lượng slot phải lớn hơn 0',
  credentialNotIssued: 'Máy chưa được cấp thông tin xác thực',

  slotNotFound: 'Không tìm thấy slot',
  dosagePositive: 'Định lượng xịt phải lớn hơn 0',
  thresholdNonNegative: 'Ngưỡng cảnh báo không được âm',
  // {status} nhận nhãn đã dịch từ `slotStatus`, KHÔNG nhận thẳng giá trị enum tiếng Anh.
  slotNotDirectlyEnableable: 'Slot đang {status}, không bật trực tiếp được',
  machineDisabledCannotEnableSlot: 'Máy chứa slot đã bị vô hiệu hóa, không bật slot được',
  slotOccupied: 'Slot đang có hợp đồng thuê, không xóa được',
  slotChangedConcurrently: 'Slot vừa được thay đổi bởi thao tác khác, vui lòng tải lại và thử lại',
} as const;

/** Nhãn hiển thị của `slot_status`. Khóa trùng đúng giá trị enum trong CSDL. */
export const slotStatus = {
  AVAILABLE: 'khả dụng',
  UNAVAILABLE: 'không khả dụng',
  MAINTENANCE: 'bảo trì',
  DISABLED: 'đã vô hiệu hóa',
} as const;

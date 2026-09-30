/** Hợp đồng thuê slot (FR-SLT-01..29). */
export const slt = {
  rentalNotFound: 'Không tìm thấy hợp đồng thuê slot',
  invalidRentalPeriod: 'Ngày kết thúc phải sau ngày bắt đầu',
  financialsInvalid: 'Phí cố định và tỷ lệ chia sẻ doanh thu không hợp lệ',
  slotOccupied: 'Slot đã có hợp đồng thuê ở trạng thái hiệu lực',
  invalidStatusTransition: 'Không thể chuyển trạng thái hợp đồng này',
} as const;

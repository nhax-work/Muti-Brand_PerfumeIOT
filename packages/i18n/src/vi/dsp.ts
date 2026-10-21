/**
 * Lệnh xịt và lượt xịt chẩn đoán (FR-DSP-20, FR-MNT-09). Người đọc là nhân viên vận hành trên web
 * quản trị.
 */
export const dsp = {
  slotNotFound: 'Không tìm thấy slot này trên máy',
  machineOffline: 'Máy đang mất kết nối nên không gửi được lệnh chẩn đoán',
  slotNotCalibrated: 'Slot chưa được hiệu chuẩn lượng xịt nên không xịt chẩn đoán được',
  machineBusy:
    'Máy đang phục vụ khách hoặc đang chạy một lệnh khác. Vui lòng thử lại sau khi máy rảnh.',
  commandNotFound: 'Đơn này chưa có lệnh xịt',
} as const;

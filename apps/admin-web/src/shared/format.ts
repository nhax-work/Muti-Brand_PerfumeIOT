/** Tiền trong contract là chuỗi thập phân (NFR-DAT-02); chỉ đổi sang số để hiển thị. */
export function formatVnd(amount: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${Number(amount).toLocaleString('vi-VN')} VND`;
}

/** Thời điểm ISO-8601 từ máy chủ → giờ địa phương của người xem. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('vi-VN') : '—';
}

/** Như `formatDateTime` nhưng chỉ ngày — cho hạn tính theo ngày. */
export function formatDate(value: string | Date | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '—';
}

/** Định dạng số tiền VND cho InputNumber của Ant Design (dấu chấm phân tách hàng nghìn). */
export function formatVndInput(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  const parts = String(value).split('.');
  const intPart = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length > 1 ? `${intPart},${parts[1]}` : intPart;
}

/** Chuyển chuỗi hiển thị tiền VND về dạng số thô cho Form / InputNumber. */
export function parseVndInput(displayValue: string | undefined): string {
  return displayValue ? displayValue.replace(/\D/g, '') : '';
}

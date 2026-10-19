/** Tiền trong contract là chuỗi thập phân (NFR-DAT-02); chỉ đổi sang số để hiển thị. */
export function formatVnd(amount: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${Number(amount).toLocaleString('vi-VN')} VND`;
}

/** Thời điểm ISO-8601 từ máy chủ → giờ địa phương của người xem. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('vi-VN') : '—';
}

/**
 * Định dạng số và thời điểm cho nội dung thông báo gửi người dùng. Luôn theo giờ Việt Nam, không
 * phụ thuộc múi giờ của máy chạy tiến trình.
 */

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** `dd/mm/yyyy` theo giờ Việt Nam. */
export function formatVnDate(at: Date): string {
  return at.toLocaleDateString('vi-VN', { timeZone: VN_TIME_ZONE });
}

/** Giờ phút kèm ngày theo giờ Việt Nam — cho hạn tính tới từng giờ. */
export function formatVnDateTime(at: Date): string {
  return at.toLocaleString('vi-VN', {
    timeZone: VN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Số tiền dạng NUMERIC của CSDL (`'98000.0000'`) → `98.000`. */
export function formatAmount(amount: string | number): string {
  return Number(amount).toLocaleString('vi-VN');
}

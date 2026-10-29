/**
 * Kỳ hạn của hóa đơn DRAFT khi được kích hoạt — lắp chai đầu tiên (FR-SLT-24) hoặc quá
 * `RENTAL_MAX_STOCKING_DAYS` (FR-SLT-42). `ends_at` của hóa đơn DRAFT chỉ là mốc tạm (schema.sql), nên
 * hạn thật tính lại từ thời điểm kích hoạt.
 *
 * Hóa đơn theo gói (ADR-0006) có `duration_months` → `startsAt + duration_months`. Hóa đơn mô hình cũ
 * không có gói nên `duration_months` NULL: giữ nguyên độ dài kỳ hạn đã ghi. Cộng 0 tháng sẽ cho
 * `ends_at = starts_at` và bị `chk_rental_period` từ chối.
 */
export function activatedEndsAt(
  rental: {
    readonly starts_at: Date;
    readonly ends_at: Date;
    readonly duration_months: number | null;
  },
  startsAt: Date,
): Date {
  if (rental.duration_months === null) {
    return new Date(startsAt.getTime() + (rental.ends_at.getTime() - rental.starts_at.getTime()));
  }
  const endsAt = new Date(startsAt);
  endsAt.setMonth(endsAt.getMonth() + rental.duration_months);
  return endsAt;
}

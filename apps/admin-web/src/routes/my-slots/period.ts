export type PeriodKey = 'thisMonth' | 'lastMonth' | 'last30Days' | 'all';

/**
 * Mốc `[from, to)` gửi `/reports/brand-slots`, theo giờ của trình duyệt — người dùng web quản trị
 * ở Việt Nam, trùng với kỳ tháng của kỳ chi trả (ADR-0013). Bỏ trống mốc là không giới hạn phía đó.
 */
export function periodRange(
  key: PeriodKey,
  now: Date = new Date(),
): { from?: string; to?: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case 'thisMonth':
      return { from: new Date(y, m, 1).toISOString(), to: new Date(y, m + 1, 1).toISOString() };
    case 'lastMonth':
      return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
    case 'last30Days':
      return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() };
    case 'all':
      return {};
  }
}

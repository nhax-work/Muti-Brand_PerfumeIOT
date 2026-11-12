import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export interface RevenueFilter {
  readonly from?: string;
  readonly to?: string;
  readonly machineId?: string;
}

/** FR-REV-04: tổng doanh thu BRAND và PLATFORM — chỉ Super Admin. Bỏ trống khoảng = tháng hiện tại. */
export function useRevenueSplit(filter: RevenueFilter) {
  return useQuery({
    queryKey: ['revenue-split', filter],
    queryFn: () => unwrap(api.GET('/revenue/split', { params: { query: filter } })),
  });
}

/** Danh sách máy cho bộ lọc (Super Admin có `machine.manage`). */
export function useMachineOptions() {
  return useQuery({
    queryKey: ['machines', 'options'],
    queryFn: () => unwrap(api.GET('/machines', { params: { query: { page: 1, pageSize: 200 } } })),
  });
}

import type { components } from '@scentstation/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type ProductRankingItem = components['schemas']['ProductRankingItem'];
export type RentalSalesReport = components['schemas']['RentalSalesReport'];
export type RentalSalesGroupBy = RentalSalesReport['groupBy'];

export interface ReportPeriod {
  readonly from?: string;
  readonly to?: string;
}

export interface RankingFilter extends ReportPeriod {
  readonly machineId?: string;
  readonly locationId?: string;
}

export interface RentalSalesFilter extends ReportPeriod {
  readonly groupBy: RentalSalesGroupBy;
  readonly machineId?: string;
  readonly locationId?: string;
}

/** FR-RPT-06: Brand Admin chỉ nhận sản phẩm của thương hiệu mình (máy chủ lọc). */
export function useProductRanking(filter: RankingFilter) {
  return useQuery({
    queryKey: ['product-ranking', filter],
    queryFn: () => unwrap(api.GET('/reports/product-ranking', { params: { query: filter } })),
  });
}

/** FR-SLT-47: chỉ Super Admin. Bỏ trống khoảng = tháng hiện tại (máy chủ quyết). */
export function useRentalSales(filter: RentalSalesFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['rental-sales', filter],
    queryFn: () => unwrap(api.GET('/reports/rental-sales', { params: { query: filter } })),
    enabled,
  });
}

/** Máy và địa điểm cho bộ lọc của tài khoản nền tảng; Brand Admin không gọi. */
export function useMachineOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['machines', 'options'],
    queryFn: () => unwrap(api.GET('/machines', { params: { query: { page: 1, pageSize: 200 } } })),
    enabled,
  });
}

export function useLocationOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['locations', 'options'],
    queryFn: () => unwrap(api.GET('/locations', { params: { query: { page: 1, pageSize: 200 } } })),
    enabled,
  });
}

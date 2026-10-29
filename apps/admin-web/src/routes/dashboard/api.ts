import type { components } from '@scentstation/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type PlatformDashboard = components['schemas']['PlatformDashboard'] & {
  readonly machineBreakdown?: Array<{
    readonly machineId: string;
    readonly serialNumber: string;
    readonly displayName: string;
    readonly locationName: string;
    readonly connectionStatus: string;
    readonly operatingMode: string;
    readonly totalPaidOrders: number;
    readonly successCount: number;
    readonly forfeitedCount: number;
    readonly failureCount: number;
    readonly successRate: number;
    readonly forfeitedRate: number;
    readonly failureRate: number;
    readonly forfeitedAlert: boolean;
  }>;
};

export type TimeSeriesPoint = components['schemas']['TimeSeriesPoint'];

export function usePlatformDashboard(from?: string, to?: string) {
  return useQuery({
    queryKey: ['platform-dashboard', { from, to }],
    queryFn: () =>
      unwrap(
        api.GET('/reports/platform-dashboard', {
          params: { query: { from, to } },
        }),
      ) as Promise<PlatformDashboard>,
  });
}

export function useOrdersTimeseries(
  from?: string,
  to?: string,
  granularity: 'DAY' | 'WEEK' | 'MONTH' = 'DAY',
) {
  return useQuery({
    queryKey: ['orders-timeseries', { from, to, granularity }],
    queryFn: () =>
      unwrap(
        api.GET('/reports/orders-timeseries', {
          params: { query: { from, to, granularity } },
        }),
      ),
  });
}

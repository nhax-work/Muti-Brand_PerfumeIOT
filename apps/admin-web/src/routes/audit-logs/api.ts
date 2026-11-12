import type { components } from '@scentstation/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type AuditLogEntry = components['schemas']['AuditLogEntry'];

export function useAuditLogs(query?: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  actorId?: string;
  action?: string;
  targetType?: string;
}) {
  return useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () =>
      unwrap(
        api.GET('/audit-logs', {
          params: { query },
        }),
      ),
  });
}

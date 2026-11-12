import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type Alert = components['schemas']['Alert'];
export type AlertSeverity = components['schemas']['AlertSeverity'];
export type AlertStatus = components['schemas']['AlertStatus'];
export type AlertAssign = components['schemas']['AlertAssign'];
export type AlertResolve = components['schemas']['AlertResolve'];

export interface AlertListParams {
  readonly page: number;
  readonly pageSize: number;
  readonly severity?: AlertSeverity | undefined;
  readonly status?: AlertStatus | undefined;
  readonly machineId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/** Danh sách cảnh báo (FR-ALR-06, FR-ALR-08, FR-ALR-10). Brand Admin chỉ thấy cảnh báo ảnh hưởng tới slot của mình. */
export function useAlerts({
  page,
  pageSize,
  severity,
  status,
  machineId,
  from,
  to,
}: AlertListParams) {
  return useQuery({
    queryKey: ['alerts', { page, pageSize, severity, status, machineId, from, to }],
    queryFn: () =>
      unwrap(
        api.GET('/alerts', {
          params: { query: { page, pageSize, severity, status, machineId, from, to } },
        }),
      ),
  });
}

/** Chi tiết cảnh báo (FR-ALR-12). */
export function useAlert(id: string | null) {
  return useQuery({
    queryKey: ['alerts', id],
    enabled: id !== null,
    queryFn: () => unwrap(api.GET('/alerts/{id}', { params: { path: { id: id! } } })),
  });
}

/** Tiếp nhận cảnh báo (FR-ALR-11, FR-ALR-12). */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/alerts/{id}/acknowledge', { params: { path: { id } } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

/** Phân công cảnh báo (FR-ALR-11). */
export function useAssignAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedTo }: { readonly id: string; readonly assignedTo: string }) =>
      unwrap(
        api.POST('/alerts/{id}/assign', {
          params: { path: { id } },
          body: { assignedTo },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

/** Xử lý xong cảnh báo (FR-ALR-11, FR-ALR-12). */
export function useResolveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution }: { readonly id: string; readonly resolution: string }) =>
      unwrap(
        api.POST('/alerts/{id}/resolve', {
          params: { path: { id } },
          body: { resolution },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

/** Đóng cảnh báo (FR-ALR-08, FR-ALR-11). */
export function useCloseAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/alerts/{id}/close', { params: { path: { id } } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

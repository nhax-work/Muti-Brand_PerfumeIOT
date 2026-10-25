import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type Notification = components['schemas']['Notification'];
export type NotificationStatus = components['schemas']['NotificationStatus'];
export type NotificationChannel = Notification['channel'];

export interface NotificationListParams {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: NotificationStatus | undefined;
  /** Chỉ có tác dụng với `notification.manage` — máy chủ bỏ qua với người dùng khác (ADR-0017). */
  readonly channel?: NotificationChannel | undefined;
}

/** Thông báo của tôi; Super Admin thấy mọi thông báo để đối soát bằng chứng gửi (FR-ALR-16). */
export function useNotifications({ page, pageSize, status, channel }: NotificationListParams) {
  return useQuery({
    queryKey: ['notifications', { page, pageSize, status, channel }],
    queryFn: () =>
      unwrap(api.GET('/notifications', { params: { query: { page, pageSize, status, channel } } })),
  });
}

/** FR-ALR-16 AC2: chi tiết và bằng chứng gửi. */
export function useNotification(id: string | null) {
  return useQuery({
    queryKey: ['notifications', id],
    enabled: id !== null,
    queryFn: () => unwrap(api.GET('/notifications/{id}', { params: { path: { id: id! } } })),
  });
}

/** FR-ALR-16 AC3: đưa email FAILED về hàng đợi gửi lại. */
export function useRetryNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/notifications/{id}/retry', { params: { path: { id } } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

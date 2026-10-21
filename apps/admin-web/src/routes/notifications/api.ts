import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type NotificationChannel = 'EMAIL' | 'IN_APP';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';

export interface NotificationItem {
  readonly id: string;
  readonly brandId: string;
  readonly brandName?: string | null;
  readonly recipientUserId: string;
  readonly recipientEmail?: string | null;
  readonly recipientName?: string | null;
  readonly type: string;
  readonly channel: NotificationChannel;
  readonly subject: string | null;
  readonly content: string;
  readonly status: NotificationStatus;
  readonly sentAt: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface NotificationListParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly channel?: NotificationChannel;
  readonly status?: NotificationStatus;
  readonly brandId?: string;
  readonly type?: string;
}

export interface NotificationListResult {
  readonly items: readonly NotificationItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/**
 * Tra cứu danh sách thông báo và bằng chứng gửi (FR-ALR-16).
 * Brand Admin tự động nhận dữ liệu cô lập cho thương hiệu của mình (BR-012, FR-AUTH-07).
 */
export function useNotifications(params: NotificationListParams = {}) {
  const { page = 1, pageSize = 20, channel, status, brandId, type } = params;
  return useQuery({
    queryKey: ['notifications', { page, pageSize, channel, status, brandId, type }],
    queryFn: () =>
      unwrap(
        (api as any).GET('/notifications', {
          params: {
            query: {
              page,
              pageSize,
              channel: channel || undefined,
              status: status || undefined,
              brandId: brandId || undefined,
              type: type || undefined,
            },
          },
        }),
      ) as Promise<NotificationListResult>,
  });
}

/**
 * Lấy chi tiết một thông báo và bằng chứng gửi làm căn cứ đối soát pháp lý (FR-ALR-16 AC2).
 */
export function useNotification(id: string | null) {
  return useQuery({
    queryKey: ['notifications', id],
    queryFn: () =>
      unwrap(
        (api as any).GET('/notifications/{id}', {
          params: { path: { id: id! } },
        }),
      ) as Promise<NotificationItem>,
    enabled: Boolean(id),
  });
}

/**
 * Thử gửi lại email thông báo bị thất bại (FR-ALR-16 AC3).
 */
export function useRetryNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        (api as any).POST('/notifications/{id}/retry', {
          params: { path: { id } },
        }),
      ) as Promise<NotificationItem>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

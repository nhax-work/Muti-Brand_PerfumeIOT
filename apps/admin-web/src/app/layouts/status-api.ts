import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type MachineSalesStop = components['schemas']['MachineSalesStop'];
export type BellNotification = components['schemas']['Notification'];

/**
 * Nhịp hỏi lại của chuông và banner đầu trang (ADR-0028). Cả hai là số tổng hợp rẻ; 30 giây đủ để
 * người đang mở trang thấy máy dừng bán hay thông báo mới mà không cần tải lại.
 */
const POLL_MS = 30_000;

/** ADR-0028: máy đang dừng bán — máy chủ lọc theo phạm vi thương hiệu. */
export function useMachineSalesStops(enabled: boolean) {
  return useQuery({
    queryKey: ['machine-sales-stops'],
    enabled,
    refetchInterval: POLL_MS,
    queryFn: () => unwrap(api.GET('/machine-sales-stops')),
  });
}

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    enabled,
    refetchInterval: POLL_MS,
    queryFn: () => unwrap(api.GET('/notifications/unread-count')),
  });
}

/** Thông báo mới nhất của CHÍNH người dùng — kể cả Super Admin (`mine=true`). */
export function useMyLatestNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'bell-latest'],
    enabled,
    queryFn: () =>
      unwrap(
        api.GET('/notifications', { params: { query: { page: 1, pageSize: 8, mine: 'true' } } }),
      ),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/notifications/{id}/read', { params: { path: { id } } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/notifications/read-all')),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

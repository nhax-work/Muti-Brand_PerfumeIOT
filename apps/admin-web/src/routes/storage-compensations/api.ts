import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';
import { useReauth } from '@/shared/auth';

export type StorageCompensation = components['schemas']['StorageCompensation'];
export type StorageCompensationStatus = components['schemas']['StorageCompensationStatus'];
export type Bottle = components['schemas']['Bottle'];
export type BottleStatus = components['schemas']['BottleStatus'];
export type BottleDamageResult = components['schemas']['BottleDamageResult'];

export interface CompensationSearch {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: StorageCompensationStatus;
  /** Chỉ Super Admin — máy chủ bỏ qua với Brand Admin. */
  readonly brandId?: string;
}

/** FR-SLT-44, 46: Brand Admin chỉ nhận khoản của thương hiệu mình (máy chủ lọc). */
export function useStorageCompensations(search: CompensationSearch, enabled = true) {
  return useQuery({
    queryKey: ['storage-compensations', search],
    queryFn: () => unwrap(api.GET('/storage-compensations', { params: { query: search } })),
    enabled,
  });
}

/** Tên thương hiệu cho bộ lọc của Super Admin; vai trò khác không gọi. */
export function useBrandNames(enabled: boolean) {
  return useQuery({
    queryKey: ['brands', 'names'],
    queryFn: () => unwrap(api.GET('/brands', { params: { query: { page: 1, pageSize: 200 } } })),
    enabled,
  });
}

/** FR-SLT-45: ghi nhận đã chuyển tiền bồi thường — cần xác thực lại. */
export function usePayoutCompensation() {
  const requestReauth = useReauth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; payoutReference: string }) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.POST('/storage-compensations/{id}/payout', {
          params: { path: { id: input.id }, header: { 'X-Reauth-Token': reauthToken } },
          body: { payoutReference: input.payoutReference },
        }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['storage-compensations'] }),
  });
}

export interface BottleSearch {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: BottleStatus;
}

/** Chai nền tảng đang giữ — chọn chai để ghi nhận hư hỏng (FR-INV-04). */
export function useBottles(search: BottleSearch, enabled: boolean) {
  return useQuery({
    queryKey: ['bottles', search],
    queryFn: () => unwrap(api.GET('/bottles', { params: { query: search } })),
    enabled,
  });
}

/** FR-SLT-44, ADR-0018: chai sang DAMAGED, khoản bồi thường (nếu có) sinh cùng lúc — cần xác thực lại. */
export function useMarkBottleDamaged() {
  const requestReauth = useReauth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.POST('/bottles/{id}/mark-damaged', {
          params: { path: { id: input.id }, header: { 'X-Reauth-Token': reauthToken } },
          body: { reason: input.reason },
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bottles'] });
      void queryClient.invalidateQueries({ queryKey: ['storage-compensations'] });
    },
  });
}

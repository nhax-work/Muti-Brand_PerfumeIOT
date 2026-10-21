import type {
  components,
  MachineConnectionStatus,
  MachineOperatingMode,
} from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';
import { useReauth } from '@/shared/auth';

export type Machine = components['schemas']['Machine'] & { drainingOrdersCount?: number };
export type MachineSlot = components['schemas']['MachineSlot'];
export type Location = components['schemas']['Location'];
export type SlotRental = components['schemas']['SlotRental'];
export type Brand = components['schemas']['Brand'];
export type Product = components['schemas']['Product'];

export interface MachineFilterParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly locationId?: string;
  readonly status?: MachineConnectionStatus;
  readonly operatingMode?: MachineOperatingMode;
}

/** Danh sách máy có phân trang và bộ lọc (FR-MCH-08..10). */
export function useMachines(params: MachineFilterParams = {}) {
  const { page = 1, pageSize = 20, locationId, status, operatingMode } = params;
  return useQuery({
    queryKey: ['machines', { page, pageSize, locationId, status, operatingMode }],
    queryFn: async () => {
      const res = await unwrap(
        api.GET('/machines', {
          params: {
            query: {
              page,
              pageSize,
              locationId: locationId || undefined,
              status: status || undefined,
              operatingMode: operatingMode || undefined,
            },
          },
        }),
      );
      return res as unknown as {
        items: Machine[];
        meta: { page: number; pageSize: number; total: number };
      };
    },
  });
}

/** Danh sách địa điểm phục vụ hiển thị tên và bộ lọc (FR-MCH-03). */
export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () =>
      unwrap(
        api.GET('/locations', {
          params: { query: { page: 1, pageSize: 100 } },
        }),
      ),
    staleTime: 5 * 60 * 1000,
  });
}

/** Chi tiết một máy (FR-MCH-08..10). */
export function useMachine(id: string | undefined) {
  return useQuery({
    queryKey: ['machine', id],
    queryFn: async () => {
      const res = await unwrap(
        api.GET('/machines/{id}', {
          params: { path: { id: id! } },
        }),
      );
      return res as Machine;
    },
    enabled: Boolean(id),
  });
}

/** Danh sách slot của máy (FR-MCH-15..17). */
export function useMachineSlots(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-slots', machineId],
    queryFn: () =>
      unwrap(
        api.GET('/machines/{id}/slots', {
          params: { path: { id: machineId! } },
        }),
      ),
    enabled: Boolean(machineId),
  });
}

/** Hợp đồng thuê trên các slot của máy (FR-SLT-15). */
export function useMachineRentals(machineId: string | undefined) {
  return useQuery({
    queryKey: ['slot-rentals', machineId],
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET('/slot-rentals', {
            params: {
              query: {
                machineId: machineId!,
                page: 1,
                pageSize: 50,
              },
            },
          }),
        );
      } catch {
        // Fallback an toàn nếu backend chưa triển khai module SLT
        return { items: [] as SlotRental[], meta: { page: 1, pageSize: 50, total: 0 } };
      }
    },
    enabled: Boolean(machineId),
  });
}

/** Danh sách thương hiệu để tra cứu tên thương hiệu đang thuê slot (FR-BND-07). */
export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET('/brands', {
            params: { query: { page: 1, pageSize: 100 } },
          }),
        );
      } catch {
        return { items: [] as Brand[], meta: { page: 1, pageSize: 100, total: 0 } };
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Danh sách sản phẩm nước hoa để tra cứu tên loại nước hoa đang lắp (FR-PRD-03). */
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET('/products', {
            params: { query: { page: 1, pageSize: 100 } },
          }),
        );
      } catch {
        return { items: [] as Product[], meta: { page: 1, pageSize: 100, total: 0 } };
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Đổi chế độ hoạt động của máy — thao tác nhạy cảm yêu cầu xác thực lại (FR-MCH-11, FR-AUTH-09). */
export function useSetMachineMode() {
  const queryClient = useQueryClient();
  const requestReauth = useReauth();

  return useMutation({
    mutationFn: async ({
      id,
      operatingMode,
      reason,
      force,
    }: {
      id: string;
      operatingMode: MachineOperatingMode;
      reason?: string;
      force?: boolean;
    }) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.PUT('/machines/{id}/mode', {
          params: {
            path: { id },
            header: { 'X-Reauth-Token': reauthToken },
          },
          body: { operatingMode, reason, force },
        }),
      );
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['machine', id] });
      void queryClient.invalidateQueries({ queryKey: ['machines'] });
    },
  });
}

/** Bật / tắt slot từ xa (FR-MCH-12). */
export function useSetSlotEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      enabled,
      reason,
    }: {
      id: string;
      enabled: boolean;
      reason?: string;
    }) => {
      return unwrap(
        api.PUT('/slots/{id}/enabled', {
          params: { path: { id } },
          body: { enabled, reason },
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['machine-slots'] });
    },
  });
}

/** Cấu hình liều lượng và ngưỡng cảnh báo slot — thao tác nhạy cảm (FR-MCH-06, FR-AUTH-09). */
export function useUpdateSlotConfig() {
  const queryClient = useQueryClient();
  const requestReauth = useReauth();

  return useMutation({
    mutationFn: async ({
      id,
      calibratedDosageMl,
      lowStockThresholdMl,
    }: {
      id: string;
      calibratedDosageMl?: number;
      lowStockThresholdMl?: number;
    }) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.PUT('/slots/{id}/config', {
          params: {
            path: { id },
            header: { 'X-Reauth-Token': reauthToken },
          },
          body: { calibratedDosageMl, lowStockThresholdMl },
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['machine-slots'] });
    },
  });
}

// ---------------------------------------------------------------------------------------
// Đăng ký máy, khóa MQTT, lịch sử trạng thái (FR-MCH-01, 02, 13)
// ---------------------------------------------------------------------------------------

export type MachineCreate = components['schemas']['MachineCreate'];
export type DeviceCredential = components['schemas']['DeviceCredential'];
export type MachineStatusHistoryEntry = components['schemas']['MachineStatusHistoryEntry'];

/** FR-MCH-01, 04, 05: số sê-ri duy nhất, địa điểm, số slot. Máy mới chưa có khóa MQTT. */
export function useRegisterMachine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MachineCreate) => unwrap(api.POST('/machines', { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['machines'] }),
  });
}

/**
 * Metadata khóa MQTT hiện tại (FR-MCH-02) — không bao giờ có bí mật gốc. Máy chưa từng được cấp
 * khóa trả 404: hiển thị "chưa cấp", không coi là lỗi, nên không thử lại.
 */
export function useMachineCredential(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-credential', machineId],
    queryFn: () =>
      unwrap(api.GET('/machines/{id}/credentials', { params: { path: { id: machineId! } } })),
    enabled: Boolean(machineId),
    retry: false,
  });
}

/**
 * Cấp khóa mới và thu hồi khóa cũ (FR-MCH-02, NFR-SEC-07) — cần xác thực lại. Bí mật gốc chỉ có
 * trong phản hồi này; người gọi hiển thị một lần rồi bỏ.
 */
export function useIssueCredential() {
  const queryClient = useQueryClient();
  const requestReauth = useReauth();
  return useMutation({
    mutationFn: async (machineId: string) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.POST('/machines/{id}/credentials', {
          params: { path: { id: machineId }, header: { 'X-Reauth-Token': reauthToken } },
        }),
      );
    },
    onSuccess: (_, machineId) =>
      void queryClient.invalidateQueries({ queryKey: ['machine-credential', machineId] }),
  });
}

/** Thu hồi khóa: broker từ chối thiết bị ngay sau đó (FR-AUTH-11, FR-IOT-08) — cần xác thực lại. */
export function useRevokeCredential() {
  const queryClient = useQueryClient();
  const requestReauth = useReauth();
  return useMutation({
    mutationFn: async (machineId: string) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.POST('/machines/{id}/credentials/revoke', {
          params: { path: { id: machineId }, header: { 'X-Reauth-Token': reauthToken } },
        }),
      );
    },
    onSuccess: (_, machineId) =>
      void queryClient.invalidateQueries({ queryKey: ['machine-credential', machineId] }),
  });
}

/** FR-MCH-13: mỗi lần đổi kết nối hoặc chế độ một hàng, mới nhất trước. */
export function useMachineStatusHistory(machineId: string | undefined, page: number) {
  return useQuery({
    queryKey: ['machine-status-history', machineId, page],
    queryFn: () =>
      unwrap(
        api.GET('/machines/{id}/status-history', {
          params: { path: { id: machineId! }, query: { page, pageSize: 10 } },
        }),
      ),
    enabled: Boolean(machineId),
  });
}

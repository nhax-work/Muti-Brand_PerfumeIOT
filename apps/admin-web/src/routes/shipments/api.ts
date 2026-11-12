import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type ShipmentDeclaration = components['schemas']['ShipmentDeclaration'];
export type ShipmentStatus = components['schemas']['ShipmentDeclarationStatus'];
export type InventoryBatch = components['schemas']['InventoryBatch'];
export type AuthenticityStatus = components['schemas']['BatchAuthenticityStatus'];
export type Bottle = components['schemas']['Bottle'];
export type RefillSession = components['schemas']['RefillSession'];
export type RefillStatus = components['schemas']['RefillStatus'];
export type Product = components['schemas']['Product'];
export type Machine = components['schemas']['Machine'];
export type MachineSlot = components['schemas']['MachineSlot'];

/** Trang đầu đủ lớn cho bảng có phân trang phía client. */
const LIST_PAGE_SIZE = 200;

/** FR-INV-27: Brand Admin thấy khai báo của mình, nhân sự kho thấy tất cả. */
export function useShipmentDeclarations() {
  return useQuery({
    queryKey: ['shipments'],
    queryFn: () =>
      unwrap(
        api.GET('/shipment-declarations', {
          params: { query: { page: 1, pageSize: LIST_PAGE_SIZE } },
        }),
      ),
  });
}

/** FR-INV-22 */
export function useCreateShipmentDeclaration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: components['schemas']['ShipmentDeclarationCreate']) =>
      unwrap(api.POST('/shipment-declarations', { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['shipments'] }),
  });
}

/** FR-INV-24, 25, 26: tiếp nhận; nhận được chai thì máy chủ tạo lô ngay. */
export function useReceiveShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & components['schemas']['ShipmentReceive']) =>
      unwrap(api.POST('/shipment-declarations/{id}/receive', { params: { path: { id } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

/** FR-INV-01, 34: lọc theo trạng thái giấy tờ để Super Admin xem hàng chờ duyệt. */
export function useInventoryBatches(authenticityStatus?: AuthenticityStatus) {
  return useQuery({
    queryKey: ['batches', { authenticityStatus }],
    queryFn: () =>
      unwrap(
        api.GET('/inventory-batches', {
          params: { query: { page: 1, pageSize: LIST_PAGE_SIZE, authenticityStatus } },
        }),
      ),
  });
}

/** FR-INV-33 */
export function useSubmitAuthenticity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      ...body
    }: { batchId: string } & components['schemas']['AuthenticityDocumentSubmit']) =>
      unwrap(
        api.POST('/inventory-batches/{id}/authenticity-documents', {
          params: { path: { id: batchId } },
          body,
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['batches'] }),
  });
}

/** FR-INV-34 AC1 */
export function useApproveAuthenticity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      unwrap(
        api.POST('/inventory-batches/{id}/approve-authenticity', {
          params: { path: { id: batchId } },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['batches'] }),
  });
}

/** FR-INV-34 AC2 */
export function useRejectAuthenticity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, reason }: { batchId: string; reason: string }) =>
      unwrap(
        api.POST('/inventory-batches/{id}/reject-authenticity', {
          params: { path: { id: batchId } },
          body: { reason },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['batches'] }),
  });
}

/** FR-INV-13 */
export function useRefillSessions() {
  return useQuery({
    queryKey: ['refill-sessions'],
    queryFn: () =>
      unwrap(
        api.GET('/refill-sessions', { params: { query: { page: 1, pageSize: LIST_PAGE_SIZE } } }),
      ),
  });
}

/** FR-INV-29: máy suy từ slot. */
export function useOpenRefillSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: components['schemas']['RefillSessionOpen']) =>
      unwrap(api.POST('/refill-sessions', { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['refill-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['bottles'] });
    },
  });
}

/** FR-INV-31, 35 */
export function useCloseRefillSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & components['schemas']['RefillSessionClose']) =>
      unwrap(api.POST('/refill-sessions/{id}/close', { params: { path: { id } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['refill-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['bottles'] });
    },
  });
}

/** Chai trong kho — để chọn chai lắp khi đóng phiếu nạp. */
export function useStockBottles(enabled: boolean) {
  return useQuery({
    queryKey: ['bottles', 'IN_STOCK'],
    enabled,
    queryFn: () =>
      unwrap(
        api.GET('/bottles', {
          params: { query: { page: 1, pageSize: LIST_PAGE_SIZE, status: 'IN_STOCK' } },
        }),
      ),
  });
}

/** Sản phẩm của thương hiệu — để chọn khi khai báo gửi hàng. */
export function useBrandProducts(enabled: boolean) {
  return useQuery({
    queryKey: ['products', 'shipment-select'],
    enabled,
    queryFn: () =>
      unwrap(api.GET('/products', { params: { query: { page: 1, pageSize: LIST_PAGE_SIZE } } })),
  });
}

/** Máy và slot — để chọn slot khi mở phiếu nạp. */
export function useMachinesForRefill(enabled: boolean) {
  return useQuery({
    queryKey: ['machines', 'refill-select'],
    enabled,
    queryFn: () =>
      unwrap(api.GET('/machines', { params: { query: { page: 1, pageSize: LIST_PAGE_SIZE } } })),
  });
}

export function useMachineSlots(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-slots', machineId],
    enabled: Boolean(machineId),
    queryFn: () =>
      unwrap(api.GET('/machines/{id}/slots', { params: { path: { id: machineId! } } })),
  });
}

export type InventoryReportItem = components['schemas']['InventoryReportItem'];

export function useInventoryReport(params?: {
  lowStockOnly?: boolean;
  machineId?: string;
  fragranceProductId?: string;
}) {
  return useQuery({
    queryKey: ['inventory-report', params],
    queryFn: () =>
      unwrap(
        api.GET('/reports/inventory', {
          params: { query: params },
        }),
      ),
  });
}

import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type ShipmentDeclaration = components['schemas']['ShipmentDeclaration'];
export type ShipmentStatus = components['schemas']['ShipmentDeclarationStatus'];
export type ShipmentPhoto = components['schemas']['ShipmentPhoto'];
export type ShipmentPhotoKind = components['schemas']['ShipmentPhotoKind'];
export type InventoryBatch = components['schemas']['InventoryBatch'];
export type AuthenticityStatus = components['schemas']['BatchAuthenticityStatus'];
export type Bottle = components['schemas']['Bottle'];
export type RefillSession = components['schemas']['RefillSession'];
export type RefillWorkItem = components['schemas']['RefillWorkItem'];
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

/**
 * Thêm ảnh lô hàng / kiện hàng cho khai báo (FR-INV-22, ADR-0024). Gửi FormData nguyên trạng —
 * openapi-fetch để trình duyệt tự đặt Content-Type kèm boundary.
 */
export function useAddShipmentPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, file }: { id: string; kind: ShipmentPhotoKind; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return unwrap(
        api.POST('/shipment-declarations/{id}/photos', {
          params: { path: { id }, query: { kind } },
          body: form as unknown as { file: string },
        }),
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['shipments'] }),
  });
}

/** Xóa một ảnh khi khai báo còn DECLARED (ADR-0024). */
export function useDeleteShipmentPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, photoId }: { id: string; photoId: string }) =>
      unwrap(
        api.DELETE('/shipment-declarations/{id}/photos/{photoId}', {
          params: { path: { id, photoId } },
        }),
      ),
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

/** ADR-0026: việc cần nạp — máy chủ tính, chỉ người có `inventory.manage` gọi được. */
export function useRefillWorklist(enabled: boolean) {
  return useQuery({
    queryKey: ['refill-worklist'],
    enabled,
    queryFn: () => unwrap(api.GET('/refill-worklist')),
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
      void queryClient.invalidateQueries({ queryKey: ['refill-worklist'] });
      void queryClient.invalidateQueries({ queryKey: ['machine-sales-stops'] });
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
      void queryClient.invalidateQueries({ queryKey: ['refill-worklist'] });
      void queryClient.invalidateQueries({ queryKey: ['machine-sales-stops'] });
      void queryClient.invalidateQueries({ queryKey: ['bottles'] });
    },
  });
}

/** ADR-0028: hủy phiếu mở mà không lắp chai — máy bán lại ngay. */
export function useCancelRefillSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(
        api.POST('/refill-sessions/{id}/cancel', { params: { path: { id } }, body: { reason } }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['refill-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['refill-worklist'] });
      void queryClient.invalidateQueries({ queryKey: ['machine-sales-stops'] });
    },
  });
}

/**
 * Chai trong kho của đúng sản phẩm cần lắp — để chọn khi đóng phiếu nạp. Lọc ở máy chủ (ADR-0026):
 * mỗi lô tự sinh hàng trăm chai, lấy cả kho rồi lọc ở trình duyệt thì trang đầu có thể thiếu chai cần.
 */
export function useStockBottles(fragranceProductId: string | null | undefined) {
  return useQuery({
    queryKey: ['bottles', 'IN_STOCK', fragranceProductId],
    enabled: Boolean(fragranceProductId),
    queryFn: () =>
      unwrap(
        api.GET('/bottles', {
          params: {
            query: {
              page: 1,
              pageSize: LIST_PAGE_SIZE,
              status: 'IN_STOCK',
              fragranceProductId: fragranceProductId!,
            },
          },
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

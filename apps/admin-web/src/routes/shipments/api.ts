import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type ShipmentStatus = 'DECLARED' | 'RECEIVED' | 'DISCREPANCY' | 'CANCELLED';
export type AuthenticityStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RefillStatus = 'STARTED' | 'COMPLETED' | 'ABORTED';

export interface ShipmentItem {
  readonly id: string;
  readonly brandId: string;
  readonly fragranceProductId: string;
  readonly declaredQuantity: number;
  readonly declaredBottleVolumeMl: string;
  readonly expectedShipDate: string | null;
  readonly status: ShipmentStatus;
  readonly receivedQuantity: number | null;
  readonly discrepancyNotes: string | null;
  readonly declaredBy: string;
  readonly receivedBy: string | null;
  readonly receivedAt: string | null;
  readonly createdAt: string;
}

export interface InventoryBatchItem {
  readonly id: string;
  readonly brandId: string;
  readonly fragranceProductId: string;
  readonly sourceDeclarationId: string | null;
  readonly batchNumber: string;
  readonly quantityReceived: number;
  readonly receivedAt: string;
  readonly supplierInfo: {
    authenticityStatus?: AuthenticityStatus;
    documentUrl?: string;
    documentType?: string;
    rejectionReason?: string | null;
    verifiedBy?: string | null;
    verifiedAt?: string | null;
    initialDeclaredQuantity?: number;
  };
  readonly createdAt: string;
}

export interface BottleItem {
  readonly id: string;
  readonly batchId: string;
  readonly brandId: string;
  readonly fragranceProductId: string;
  readonly identifier: string;
  readonly initialVolumeMl: string;
  readonly emptyWeightG: string | null;
  readonly initialMeasuredWeightG: string | null;
  readonly status: string;
}

export interface RefillSessionItem {
  readonly id: string;
  readonly machineId: string;
  readonly slotId: string;
  readonly brandId: string;
  readonly status: RefillStatus;
  readonly performedBy: string;
  readonly newBottleId: string | null;
  readonly afterWeightG: string | null;
  readonly checklistCompleted: boolean;
  readonly notes: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export function useShipmentDeclarations(
  params: { page?: number; pageSize?: number; status?: string } = {},
) {
  const { page = 1, pageSize = 20, status } = params;
  return useQuery({
    queryKey: ['shipments', { page, pageSize, status }],
    queryFn: () =>
      unwrap(
        (api as any).GET('/shipment-declarations', {
          params: { query: { page, pageSize, status: status || undefined } },
        }),
      ) as Promise<{
        items: readonly ShipmentItem[];
        meta: { total: number; page: number; pageSize: number };
      }>,
  });
}

export function useCreateShipmentDeclaration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      fragranceProductId: string;
      declaredQuantity: number;
      declaredBottleVolumeMl: string;
      expectedShipDate?: string | null;
    }) => unwrap((api as any).POST('/shipment-declarations', { body })) as Promise<ShipmentItem>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
    },
  });
}

export function useReceiveShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      receivedQuantity,
      discrepancyNotes,
    }: {
      id: string;
      receivedQuantity: number;
      discrepancyNotes?: string | null;
    }) =>
      unwrap(
        (api as any).POST('/shipment-declarations/{id}/receive', {
          params: { path: { id } },
          body: { receivedQuantity, discrepancyNotes },
        }),
      ) as Promise<{ declaration: ShipmentItem; batch?: InventoryBatchItem }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

export function useInventoryBatches(params: { page?: number; pageSize?: number } = {}) {
  const { page = 1, pageSize = 20 } = params;
  return useQuery({
    queryKey: ['batches', { page, pageSize }],
    queryFn: () =>
      unwrap(
        (api as any).GET('/inventory-batches', {
          params: { query: { page, pageSize } },
        }),
      ) as Promise<{
        items: readonly InventoryBatchItem[];
        meta: { total: number; page: number; pageSize: number };
      }>,
  });
}

export function useSubmitAuthenticity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchId,
      documentUrl,
      documentType,
    }: {
      batchId: string;
      documentUrl: string;
      documentType?: string;
    }) =>
      unwrap(
        (api as any).POST('/inventory-batches/{id}/authenticity-documents', {
          params: { path: { id: batchId } },
          body: { documentUrl, documentType },
        }),
      ) as Promise<InventoryBatchItem>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

export function useApproveAuthenticity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      unwrap(
        (api as any).POST('/inventory-batches/{id}/approve-authenticity', {
          params: { path: { id: batchId } },
        }),
      ) as Promise<InventoryBatchItem>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

export function useRejectAuthenticity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, reason }: { batchId: string; reason: string }) =>
      unwrap(
        (api as any).POST('/inventory-batches/{id}/reject-authenticity', {
          params: { path: { id: batchId } },
          body: { reason },
        }),
      ) as Promise<InventoryBatchItem>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

export function useRefillSessions(
  params: { page?: number; pageSize?: number; machineId?: string } = {},
) {
  const { page = 1, pageSize = 20, machineId } = params;
  return useQuery({
    queryKey: ['refill-sessions', { page, pageSize, machineId }],
    queryFn: () =>
      unwrap(
        (api as any).GET('/refill-sessions', {
          params: { query: { page, pageSize, machineId: machineId || undefined } },
        }),
      ) as Promise<{
        items: readonly RefillSessionItem[];
        meta: { total: number; page: number; pageSize: number };
      }>,
  });
}

export function useOpenRefillSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { machineId: string; slotId: string; notes?: string | null }) =>
      unwrap((api as any).POST('/refill-sessions', { body })) as Promise<RefillSessionItem>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refill-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['machines'] });
    },
  });
}

export function useCloseRefillSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      newBottleId,
      initialMeasuredWeightG,
      checklistCompleted,
      notes,
    }: {
      id: string;
      newBottleId: string;
      initialMeasuredWeightG: number;
      checklistCompleted: boolean;
      notes?: string | null;
    }) =>
      unwrap(
        (api as any).POST('/refill-sessions/{id}/close', {
          params: { path: { id } },
          body: { newBottleId, initialMeasuredWeightG, checklistCompleted, notes },
        }),
      ) as Promise<RefillSessionItem>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refill-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['machines'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
    },
  });
}

export function useBottles(params: { page?: number; pageSize?: number; status?: string } = {}) {
  const { page = 1, pageSize = 50, status } = params;
  return useQuery({
    queryKey: ['bottles', { page, pageSize, status }],
    queryFn: () =>
      unwrap(
        (api as any).GET('/bottles', {
          params: { query: { page, pageSize, status: status || undefined } },
        }),
      ) as Promise<{
        items: readonly BottleItem[];
        meta: { total: number; page: number; pageSize: number };
      }>,
  });
}

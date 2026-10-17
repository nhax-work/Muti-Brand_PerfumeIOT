import type { components } from '@scentstation/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type SlotRental = components['schemas']['SlotRental'];
export type RentalInvoice = components['schemas']['RentalInvoice'];
export type RentalInvoiceStage = components['schemas']['RentalInvoiceStage'];
export type MachineMapSlot = components['schemas']['MachineMapSlot'];
export type BrandSlotReportItem = components['schemas']['BrandSlotReportItem'];

/** Giai đoạn mà thương hiệu đang giữ slot — đọc nhãn `stage` máy chủ tính (FE5). */
export const HELD_STAGES: readonly RentalInvoiceStage[] = [
  'AWAITING_STOCK',
  'ACTIVE',
  'EXPIRING',
  'GRACE',
];

/** Hóa đơn của thương hiệu — máy chủ lọc theo brandId của người gọi (FR-SLT-40). */
export function useMyRentals() {
  return useQuery({
    queryKey: ['slot-rentals', { page: 1, pageSize: 100 }],
    queryFn: () =>
      unwrap(api.GET('/slot-rentals', { params: { query: { page: 1, pageSize: 100 } } })),
  });
}

/** Chi tiết từng hóa đơn: số slot, tên máy, địa điểm (FR-SLT-40). */
export function useInvoices(rentalIds: readonly string[]) {
  return useQueries({
    queries: rentalIds.map((id) => ({
      queryKey: ['slot-rental-invoice', id],
      queryFn: () => unwrap(api.GET('/slot-rentals/{id}/invoice', { params: { path: { id } } })),
    })),
  });
}

/**
 * Sơ đồ từng máy (FR-RPT-12): slot nào đang bán và còn bao nhiêu lượt xịt. Máy chỉ có slot đang
 * chờ nạp hàng trả 404 — không phải lỗi, chỉ là chưa có gì để xem — nên không thử lại.
 */
export function useMachineMaps(machineIds: readonly string[]) {
  return useQueries({
    queries: machineIds.map((machineId) => ({
      queryKey: ['machine-map', machineId],
      queryFn: () =>
        unwrap(api.GET('/reports/machine-map/{machineId}', { params: { path: { machineId } } })),
      retry: false,
    })),
  });
}

/** Số đơn và doanh thu theo slot trong `[from, to)` (FR-RPT-08, FR-RPT-10). */
export function useBrandSlotReport(from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: ['brand-slot-report', { from, to }],
    queryFn: () => unwrap(api.GET('/reports/brand-slots', { params: { query: { from, to } } })),
  });
}

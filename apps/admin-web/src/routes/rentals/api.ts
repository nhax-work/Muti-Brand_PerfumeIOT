import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type MachineSlot = components['schemas']['MachineSlot'];
export type AvailableSlot = components['schemas']['AvailableSlot'];
export type SlotRental = components['schemas']['SlotRental'];
export type RentalCheckout = components['schemas']['RentalCheckout'];
export type RentalQuote = components['schemas']['RentalQuote'];
export type RentalInvoice = components['schemas']['RentalInvoice'];
export type RentalPaymentIntent = components['schemas']['RentalPaymentIntent'];
export type RentalInvoiceStage = components['schemas']['RentalInvoiceStage'];
export type Product = components['schemas']['Product'];

export interface AvailableSlotsParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly machineId?: string;
  readonly locationId?: string;
}

/** Danh sách slot trống mở cho thuê (FR-SLT-19). */
export function useAvailableSlots(params: AvailableSlotsParams = {}) {
  const { page = 1, pageSize = 20, machineId, locationId } = params;
  return useQuery({
    queryKey: ['available-slots', { page, pageSize, machineId, locationId }],
    queryFn: () =>
      unwrap(
        api.GET('/slots/available', {
          params: {
            query: {
              page,
              pageSize,
              machineId: machineId || undefined,
              locationId: locationId || undefined,
            },
          },
        }),
      ),
  });
}

/** Bảng giá các gói cho slot được chọn (FR-SLT-34). */
export function useRentalQuote(slotId: string | undefined) {
  return useQuery({
    queryKey: ['rental-quote', slotId],
    queryFn: () =>
      unwrap(
        api.GET('/slots/{id}/rental-quote', {
          params: { path: { id: slotId! } },
        }),
      ),
    enabled: Boolean(slotId),
  });
}

/** Tạo phiên thanh toán và giữ chỗ slot (FR-SLT-35). */
export function useCreateCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      items: Array<{ slotId: string; rentalPackageId: string; storagePlanId: string }>;
    }) =>
      unwrap(
        api.POST('/rental-checkouts', {
          body: input,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Chi tiết phiên thanh toán (FR-SLT-37). */
export function useCheckout(id: string | undefined, refetchInterval?: number | false) {
  return useQuery({
    queryKey: ['rental-checkout', id],
    queryFn: () =>
      unwrap(
        api.GET('/rental-checkouts/{id}', {
          params: { path: { id: id! } },
        }),
      ),
    enabled: Boolean(id),
    refetchInterval,
  });
}

/** Khởi tạo thanh toán cho phiên (FR-SLT-37). */
export function usePayCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (checkoutId: string) =>
      unwrap(
        api.POST('/rental-checkouts/{id}/payments', {
          params: { path: { id: checkoutId } },
        }),
      ),
    onSuccess: (_, checkoutId) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-checkout', checkoutId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Hủy phiên thanh toán và giải phóng slot ngay lập tức. */
export function useCancelCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (checkoutId: string) =>
      unwrap(
        api.POST(
          '/rental-checkouts/{id}/cancel' as never,
          {
            params: { path: { id: checkoutId } },
          } as never,
        ),
      ),
    onSuccess: (_, checkoutId) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-checkout', checkoutId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
      void queryClient.invalidateQueries({ queryKey: ['available-slots'] });
    },
  });
}

export interface SlotRentalsParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly stage?: RentalInvoiceStage;
  readonly machineId?: string;
}

/** Danh sách hóa đơn của thương hiệu (FR-SLT-41). */
export function useSlotRentals(params: SlotRentalsParams = {}) {
  const { page = 1, pageSize = 20, stage, machineId } = params;
  return useQuery({
    queryKey: ['slot-rentals', { page, pageSize, stage, machineId }],
    queryFn: () =>
      unwrap(
        api.GET('/slot-rentals', {
          params: {
            query: {
              page,
              pageSize,
              stage: stage || undefined,
              machineId: machineId || undefined,
            },
          },
        }),
      ),
  });
}

/** Chi tiết hóa đơn thuê slot (FR-SLT-40). */
export function useRentalInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['rental-invoice', id],
    queryFn: () =>
      unwrap(
        api.GET('/slot-rentals/{id}/invoice', {
          params: { path: { id: id! } },
        }),
      ),
    enabled: Boolean(id),
  });
}

/** Danh sách sản phẩm của thương hiệu để gán vào slot. */
export function useBrandProducts() {
  return useQuery({
    queryKey: ['brand-products'],
    queryFn: () =>
      unwrap(
        api.GET('/products', {
          params: { query: { page: 1, pageSize: 100 } },
        }),
      ),
  });
}

/** Gán / đổi sản phẩm cho slot (FR-SLT-27, FR-SLT-28). */
export function useAssignProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      rentalId,
      fragranceProductId,
    }: {
      rentalId: string;
      fragranceProductId: string;
    }) =>
      unwrap(
        api.PUT('/slot-rentals/{id}/product', {
          params: { path: { id: rentalId } },
          body: { fragranceProductId },
        }),
      ),
    onSuccess: (_, { rentalId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Đặt giá mỗi lượt xịt (FR-SLT-08). */
export function useSetPricePerSpray() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rentalId, pricePerSpray }: { rentalId: string; pricePerSpray: string }) =>
      unwrap(
        api.PUT('/slot-rentals/{id}/price', {
          params: { path: { id: rentalId } },
          body: { pricePerSpray },
        }),
      ),
    onSuccess: (_, { rentalId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

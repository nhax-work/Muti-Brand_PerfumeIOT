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
export type RentalCheckoutAnnex = components['schemas']['RentalCheckoutAnnex'];
export type AgreementAcceptance = components['schemas']['AgreementAcceptance'];
export type BottleReturnMethod = components['schemas']['BottleReturnMethod'];

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
export function useCheckout(
  id: string | undefined,
  refetchInterval?: number | false | ((query: any) => number | false | undefined),
) {
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

/** Hợp đồng khung hiện hành kèm lần đồng ý của thương hiệu (FR-SLT-48, FR-SLT-49, ADR-0013). */
export function useCurrentAgreement() {
  return useQuery({
    queryKey: ['current-agreement'],
    queryFn: () => unwrap(api.GET('/agreements/current')),
    retry: false,
  });
}

/** Đồng ý phiên bản hợp đồng khung (FR-SLT-49, ADR-0013). */
export function useAcceptAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, contentHash }: { version: string; contentHash: string }) =>
      unwrap(
        api.POST('/agreements/{version}/accept', {
          params: { path: { version } },
          body: { contentHash },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['current-agreement'] });
    },
  });
}

/** Gửi lại mã xác minh email cho tài khoản đang đăng nhập (FR-USR-07, ADR-0013). */
export function useResendVerification() {
  return useMutation({
    mutationFn: () => unwrap(api.POST('/auth/verify-email/resend')),
  });
}

/** Lấy thông tin một hóa đơn/hợp đồng thuê slot (FR-SLT-15). */
export function useSlotRental(id: string | undefined) {
  return useQuery({
    queryKey: ['slot-rental', id],
    queryFn: () =>
      unwrap(
        api.GET('/slot-rentals/{id}', {
          params: { path: { id: id! } },
        }),
      ),
    enabled: Boolean(id),
  });
}

/** Lấy phụ lục của phiên thanh toán (FR-SLT-50, ADR-0013). */
export function useCheckoutAnnex(checkoutId: string | undefined) {
  return useQuery({
    queryKey: ['rental-checkout-annex', checkoutId],
    queryFn: () =>
      unwrap(
        api.GET('/rental-checkouts/{id}/annex', {
          params: { path: { id: checkoutId! } },
        }),
      ),
    enabled: Boolean(checkoutId),
    retry: false,
  });
}

/** Đồng ý phụ lục của phiên thanh toán (FR-SLT-50, ADR-0013). */
export function useAcceptCheckoutAnnex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ checkoutId, contentHash }: { checkoutId: string; contentHash: string }) =>
      unwrap(
        api.POST('/rental-checkouts/{id}/annex/accept', {
          params: { path: { id: checkoutId } },
          body: { contentHash },
        }),
      ),
    onSuccess: (_, { checkoutId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-checkout-annex', checkoutId] });
      void queryClient.invalidateQueries({ queryKey: ['rental-checkout', checkoutId] });
    },
  });
}

/** Đổi slot cho hóa đơn khi mua nhầm (FR-SLT-55, ADR-0014). */
export function useSwapSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rentalId, targetSlotId }: { rentalId: string; targetSlotId: string }) =>
      unwrap(
        api.POST('/slot-rentals/{id}/swap-slot', {
          params: { path: { id: rentalId } },
          body: { targetSlotId },
        }),
      ),
    onSuccess: (_, { rentalId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rental', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
      void queryClient.invalidateQueries({ queryKey: ['available-slots'] });
    },
  });
}

/** Báo không gia hạn, lấy hàng về (FR-EXP-23, ADR-0014). */
export function useRequestNonRenewal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      rentalId,
      returnMethod,
    }: {
      rentalId: string;
      returnMethod: BottleReturnMethod;
    }) =>
      unwrap(
        api.POST('/slot-rentals/{id}/non-renewal', {
          params: { path: { id: rentalId } },
          body: { returnMethod },
        }),
      ),
    onSuccess: (_, { rentalId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rental', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Rút lại việc báo không gia hạn (FR-EXP-24, ADR-0014). */
export function useWithdrawNonRenewal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rentalId: string) =>
      unwrap(
        api.DELETE('/slot-rentals/{id}/non-renewal', {
          params: { path: { id: rentalId } },
        }),
      ),
    onSuccess: (_, rentalId) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rental', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Gia hạn bằng mua gói mới (FR-SLT-12, FR-EXP-12). */
export function useRenewSlotRental() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      rentalId,
      rentalPackageId,
      storagePlanId,
    }: {
      rentalId: string;
      rentalPackageId: string;
      storagePlanId: string;
    }) =>
      unwrap(
        api.POST('/slot-rentals/{id}/renew', {
          params: { path: { id: rentalId } },
          body: { rentalPackageId, storagePlanId },
        }),
      ),
    onSuccess: (_, { rentalId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rental', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Ấn định ngày kết thúc ân hạn (FR-EXP-07). */
export function useSetGracePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rentalId, graceEndsAt }: { rentalId: string; graceEndsAt: string }) =>
      unwrap(
        api.PUT('/slot-rentals/{id}/grace-period', {
          params: { path: { id: rentalId } },
          body: { graceEndsAt },
        }),
      ),
    onSuccess: (_, { rentalId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rental', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Thanh lý hóa đơn thuê slot (FR-EXP-14, FR-EXP-15). */
export function useLiquidateSlotRental() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rentalId, password }: { rentalId: string; password: string }) => {
      // 1. Reauthenticate để lấy reauth token (FR-AUTH-09)
      const reauthRes = await unwrap(
        api.POST('/auth/reauth' as any, {
          body: { password },
        }),
      );
      const reauthToken = (reauthRes as { reauthToken: string }).reauthToken;

      // 2. Gọi API thanh lý kèm header X-Reauth-Token
      return unwrap(
        api.POST('/slot-rentals/{id}/liquidate' as any, {
          params: { path: { id: rentalId } },
          headers: {
            'X-Reauth-Token': reauthToken,
          },
        }),
      );
    },
    onSuccess: (_, { rentalId }) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rental', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

/** Đóng hóa đơn đã thanh lý và giải phóng slot (FR-SLT-14). */
export function useCloseSlotRental() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rentalId: string) =>
      unwrap(
        api.POST('/slot-rentals/{id}/close' as any, {
          params: { path: { id: rentalId } },
        }),
      ),
    onSuccess: (_, rentalId) => {
      void queryClient.invalidateQueries({ queryKey: ['rental-invoice', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rental', rentalId] });
      void queryClient.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

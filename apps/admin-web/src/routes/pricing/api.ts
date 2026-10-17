import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type RentalPackage = components['schemas']['RentalPackage'];
export type RentalPackageCreate = components['schemas']['RentalPackageCreate'];
export type RentalPackageUpdate = components['schemas']['RentalPackageUpdate'];
export type StoragePlan = components['schemas']['StoragePlan'];
export type StoragePlanCreate = components['schemas']['StoragePlanCreate'];
export type StoragePlanUpdate = components['schemas']['StoragePlanUpdate'];
export type MachineSlot = components['schemas']['MachineSlot'];

/** Mọi gói thuê, kể cả gói ngừng mở bán — Super Admin (FR-SLT-30). */
export function useRentalPackages() {
  return useQuery({
    queryKey: ['rental-packages'],
    queryFn: () => unwrap(api.GET('/rental-packages')),
  });
}

/** Mọi gói bảo quản, kể cả gói ngừng mở bán — Super Admin (FR-SLT-31). */
export function useStoragePlans() {
  return useQuery({
    queryKey: ['storage-plans'],
    queryFn: () => unwrap(api.GET('/storage-plans')),
  });
}

/** Máy để chọn khi đặt giá niêm yết slot (FR-SLT-32). */
export function usePricingMachines() {
  return useQuery({
    queryKey: ['machines', { page: 1, pageSize: 100 }],
    queryFn: () => unwrap(api.GET('/machines', { params: { query: { page: 1, pageSize: 100 } } })),
  });
}

export function usePricingSlots(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-slots', machineId],
    queryFn: () =>
      unwrap(api.GET('/machines/{id}/slots', { params: { path: { id: machineId! } } })),
    enabled: Boolean(machineId),
  });
}

export function useSavePackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id?: string;
      create?: RentalPackageCreate;
      update?: RentalPackageUpdate;
    }) =>
      input.id
        ? unwrap(
            api.PATCH('/rental-packages/{id}', {
              params: { path: { id: input.id } },
              body: input.update ?? {},
            }),
          )
        : unwrap(api.POST('/rental-packages', { body: input.create! })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['rental-packages'] }),
  });
}

export function useSavePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; create?: StoragePlanCreate; update?: StoragePlanUpdate }) =>
      input.id
        ? unwrap(
            api.PATCH('/storage-plans/{id}', {
              params: { path: { id: input.id } },
              body: input.update ?? {},
            }),
          )
        : unwrap(api.POST('/storage-plans', { body: input.create! })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['storage-plans'] }),
  });
}

/** Đặt giá thuê niêm yết; `null` đóng slot khỏi danh sách cho thuê (FR-SLT-32). */
export function useSetRentPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, price }: { slotId: string; price: string | null }) =>
      unwrap(
        api.PUT('/slots/{id}/rent-price', {
          params: { path: { id: slotId } },
          body: { monthlyRentPrice: price },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['machine-slots'] }),
  });
}

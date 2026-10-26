import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type BottleReturn = components['schemas']['BottleReturn'];
export type BottleReturnCreate = components['schemas']['BottleReturnCreate'];
export type BottleReturnHandover = components['schemas']['BottleReturnHandover'];
export type BottleReturnMethod = components['schemas']['BottleReturnMethod'];

export function useBottleReturns(query?: {
  page?: number;
  pageSize?: number;
  open?: boolean;
}) {
  return useQuery({
    queryKey: ['bottle-returns', query],
    queryFn: () =>
      unwrap(
        api.GET('/bottle-returns', {
          params: { query },
        }),
      ),
  });
}

export function useBottleReturn(id: string | undefined) {
  return useQuery({
    queryKey: ['bottle-return', id],
    enabled: Boolean(id),
    queryFn: () =>
      unwrap(
        api.GET('/bottle-returns/{id}', {
          params: { path: { id: id! } },
        }),
      ),
  });
}

export function useCreateBottleReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BottleReturnCreate) =>
      unwrap(api.POST('/bottle-returns', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bottle-returns'] });
      void qc.invalidateQueries({ queryKey: ['my-slots'] });
      void qc.invalidateQueries({ queryKey: ['slot-rentals'] });
    },
  });
}

export function useHandOverBottleReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BottleReturnHandover }) =>
      unwrap(
        api.POST('/bottle-returns/{id}/handover', {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['bottle-returns'] });
      void qc.invalidateQueries({ queryKey: ['bottle-return', id] });
    },
  });
}

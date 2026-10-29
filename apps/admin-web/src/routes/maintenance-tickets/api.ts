import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type MaintenanceTicket = components['schemas']['MaintenanceTicket'];
export type MaintenanceTicketCreate = components['schemas']['MaintenanceTicketCreate'];
export type MaintenanceTicketResolve = components['schemas']['MaintenanceTicketResolve'];
export type PostTestSubmit = components['schemas']['PostTestSubmit'];
export type MaintenanceActivity = components['schemas']['MaintenanceActivity'];
export type TicketStatus = components['schemas']['TicketStatus'];
export type TicketPriority = components['schemas']['TicketPriority'];
export type AlertSeverity = components['schemas']['AlertSeverity'];

export function useMaintenanceTickets(query?: {
  page?: number;
  pageSize?: number;
  machineId?: string;
  status?: TicketStatus;
  severity?: AlertSeverity;
  priority?: TicketPriority;
}) {
  return useQuery({
    queryKey: ['maintenance-tickets', query],
    queryFn: () =>
      unwrap(
        api.GET('/maintenance-tickets', {
          params: { query },
        }),
      ),
  });
}

export function useMaintenanceTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['maintenance-ticket', id],
    enabled: Boolean(id),
    queryFn: () =>
      unwrap(
        api.GET('/maintenance-tickets/{id}', {
          params: { path: { id: id! } },
        }),
      ),
  });
}

export function useMaintenanceActivities(id: string | undefined) {
  return useQuery({
    queryKey: ['maintenance-activities', id],
    enabled: Boolean(id),
    queryFn: () =>
      unwrap(
        api.GET('/maintenance-tickets/{id}/activities', {
          params: { path: { id: id! } },
        }),
      ),
  });
}

export function useCreateMaintenanceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaintenanceTicketCreate) =>
      unwrap(api.POST('/maintenance-tickets', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      void qc.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
  });
}

export function useAssignMaintenanceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedTo, notes }: { id: string; assignedTo: string; notes?: string }) =>
      unwrap(
        api.POST('/maintenance-tickets/{id}/assign', {
          params: { path: { id } },
          body: { assignedTo, notes },
        }),
      ),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      void qc.invalidateQueries({ queryKey: ['maintenance-ticket', id] });
      void qc.invalidateQueries({ queryKey: ['maintenance-activities', id] });
    },
  });
}

export function useResolveMaintenanceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MaintenanceTicketResolve }) =>
      unwrap(
        api.POST('/maintenance-tickets/{id}/resolve', {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      void qc.invalidateQueries({ queryKey: ['maintenance-ticket', id] });
      void qc.invalidateQueries({ queryKey: ['maintenance-activities', id] });
      void qc.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
  });
}

export function useSubmitPostTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PostTestSubmit }) =>
      unwrap(
        api.POST('/maintenance-tickets/{id}/post-test', {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      void qc.invalidateQueries({ queryKey: ['maintenance-ticket', id] });
      void qc.invalidateQueries({ queryKey: ['maintenance-activities', id] });
      void qc.invalidateQueries({ queryKey: ['machines'] });
      void qc.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
  });
}

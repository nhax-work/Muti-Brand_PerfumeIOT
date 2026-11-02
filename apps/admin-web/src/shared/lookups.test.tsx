import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssignableStaff, useNameLookups } from './lookups';

let mockUser: Record<string, unknown> | null = null;
const getMock = vi.fn();

vi.mock('@/shared/auth', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('@/shared/api', () => ({
  api: { GET: (path: string, init: unknown) => getMock(path, init) },
  unwrap: async (p: Promise<unknown>) => p,
}));

const RESPONSES: Record<string, unknown> = {
  '/machines': { items: [{ id: 'm-1', displayName: 'Máy Vincom' }] },
  '/machines/{id}/slots': [{ id: 's-1', machineId: 'm-1', slotNumber: 3 }],
  '/brands': { items: [{ id: 'b-1', name: 'Maison Aurore' }] },
  '/slot-rentals': { items: [{ id: 'r-1' }] },
  '/slot-rentals/{id}/invoice': {
    machineId: 'm-1',
    machineDisplayName: 'Máy Vincom',
    slotId: 's-1',
    slotNumber: 3,
  },
  '/users': { items: [{ id: 'u-2', fullName: 'Trần Vận Hành' }] },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const calledPaths = () => getMock.mock.calls.map(([path]) => path as string);

beforeEach(() => {
  getMock.mockReset();
  getMock.mockImplementation(async (path: string) => RESPONSES[path]);
});

describe('useNameLookups', () => {
  it('test_FR_AUTH_07_brand_user_names_slots_from_own_invoices_never_platform_lists', async () => {
    mockUser = { id: 'u-1', fullName: 'Brand', brandId: 'b-1', permissions: ['report.brand'] };
    const { result } = renderHook(() => useNameLookups(), { wrapper });

    await waitFor(() => expect(result.current.slotLabel('s-1')).toBe('Máy Vincom · Slot #3'));
    expect(result.current.machineName('m-1')).toBe('Máy Vincom');
    // BR-012: tài khoản thương hiệu không gọi danh sách máy, thương hiệu hay tài khoản toàn nền tảng.
    expect(calledPaths()).not.toContain('/machines');
    expect(calledPaths()).not.toContain('/brands');
    expect(calledPaths()).not.toContain('/users');
  });

  it('test_FR_MCH_09_platform_staff_names_machines_slots_and_brands', async () => {
    mockUser = { id: 'u-1', fullName: 'Ops', brandId: null, permissions: ['machine.view'] };
    const { result } = renderHook(() => useNameLookups(), { wrapper });

    await waitFor(() => expect(result.current.slotLabel('s-1')).toBe('Máy Vincom · Slot #3'));
    expect(result.current.brandName('b-1')).toBe('Maison Aurore');
    expect(calledPaths()).not.toContain('/slot-rentals');
  });

  it('test_FR_MCH_09_unknown_ids_fall_back_to_short_id_not_a_guess', () => {
    mockUser = { id: 'u-1', fullName: 'Ops', brandId: null, permissions: [] };
    const { result } = renderHook(() => useNameLookups(), { wrapper });

    expect(result.current.machineName('12345678-aaaa-bbbb-cccc-dddddddddddd')).toBe('12345678…');
    expect(result.current.userName('u-1')).toBe('Ops');
    expect(result.current.userName(null)).toBe('—');
  });
});

describe('useAssignableStaff', () => {
  it('test_FR_ALR_11_super_admin_picks_from_operations_staff', async () => {
    mockUser = { id: 'u-1', fullName: 'Admin', brandId: null, permissions: ['user.manage'] };
    const { result } = renderHook(() => useAssignableStaff(), { wrapper });

    await waitFor(() =>
      expect(result.current.options).toEqual([{ value: 'u-2', label: 'Trần Vận Hành' }]),
    );
  });

  it('test_FR_ALR_11_operations_staff_can_only_assign_to_self', () => {
    mockUser = { id: 'u-3', fullName: 'Lê Vận Hành', brandId: null, permissions: ['alert.handle'] };
    const { result } = renderHook(() => useAssignableStaff(), { wrapper });

    expect(result.current.options).toEqual([{ value: 'u-3', label: 'Lê Vận Hành' }]);
    expect(calledPaths()).not.toContain('/users');
  });
});

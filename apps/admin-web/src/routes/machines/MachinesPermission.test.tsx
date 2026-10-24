import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import MachinesPage from './MachinesPage';
import MachineDetailPage from './MachineDetailPage';
import type { Machine, Location } from './api';

let mockUser: { id: string; brandId: string | null; roles: string[] } = {
  id: 'u-ops',
  brandId: null,
  roles: ['OPERATIONS_STAFF'],
};

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
  useReauth: () => vi.fn().mockResolvedValue('fake-reauth-token'),
}));

const mockMachine: Machine = {
  id: 'm-1',
  locationId: 'loc-1',
  serialNumber: 'M001',
  displayName: 'Máy Thử Nghiệm 1',
  status: 'ONLINE',
  operatingMode: 'NORMAL',
  slotCount: 5,
  lastSeenAt: '2026-10-21T08:00:00Z',
  firmwareVersion: '1.0.0',
  configurationVersion: 1,
};

const mockLocation: Location = {
  id: 'loc-1',
  code: 'LOC-01',
  name: 'TTTM Aeon Mall',
  address: 'Hà Nội',
  timezone: 'Asia/Ho_Chi_Minh',
  status: 'ACTIVE',
};

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useMachines: () => ({
    data: {
      items: [mockMachine],
      meta: { page: 1, pageSize: 20, total: 1 },
    },
    isLoading: false,
  }),
  useMachine: () => ({
    data: mockMachine,
    isLoading: false,
  }),
  useLocations: () => ({
    data: { items: [mockLocation] },
    isLoading: false,
  }),
  useMachineSlots: () => ({
    data: [],
    isLoading: false,
  }),
  useMachineRentals: () => ({
    data: { items: [], meta: { page: 1, pageSize: 50, total: 0 } },
    isLoading: false,
  }),
  useBrands: () => ({
    data: { items: [] },
    isLoading: false,
  }),
  useProducts: () => ({
    data: { items: [] },
    isLoading: false,
  }),
  useMachineCredential: () => ({
    data: null,
  }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  mockUser = { id: 'u-ops', brandId: null, roles: ['OPERATIONS_STAFF'] };
});

describe('UI-16/10 — Phân quyền xem máy của Operations Staff & Super Admin', () => {
  it('Operations Staff xem được danh sách máy nhưng KHÔNG thấy nút Đăng ký máy', () => {
    mockUser = { id: 'u-ops', brandId: null, roles: ['OPERATIONS_STAFF'] };
    renderScreen(<MachinesPage />);

    // Thấy tiêu đề danh sách máy và máy hiển thị
    expect(screen.getByText('Máy Thử Nghiệm 1')).toBeTruthy();
    expect(screen.getByText('M001')).toBeTruthy();

    // Nút Đăng ký máy bị ẩn với Operations Staff (chỉ Super Admin có machine.manage)
    expect(screen.queryByText(/Đăng ký máy/)).toBeNull();
  });

  it('Super Admin xem được danh sách máy VÀ thấy nút Đăng ký máy', () => {
    mockUser = { id: 'u-admin', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] };
    renderScreen(<MachinesPage />);

    expect(screen.getByText('Máy Thử Nghiệm 1')).toBeTruthy();
    expect(screen.getByText(/Đăng ký máy/)).toBeTruthy();
  });

  it('Operations Staff xem được chi tiết máy nhưng KHÔNG thấy thẻ quản trị khóa MQTT', () => {
    mockUser = { id: 'u-ops', brandId: null, roles: ['OPERATIONS_STAFF'] };
    renderScreen(<MachineDetailPage />);

    // Thấy thông tin chi tiết máy
    expect(screen.getAllByText('Máy Thử Nghiệm 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('M001').length).toBeGreaterThan(0);

    // Khóa MQTT đòi hỏi quyền machine.manage và reauth, bị ẩn hoàn toàn với Operations Staff
    expect(screen.queryByText(/Khóa kết nối của máy/)).toBeNull();
    expect(screen.queryByText(/Cấp khóa/)).toBeNull();
  });

  it('Super Admin xem được chi tiết máy VÀ thấy thẻ quản trị khóa MQTT', () => {
    mockUser = { id: 'u-admin', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] };
    renderScreen(<MachineDetailPage />);

    expect(screen.getAllByText('Máy Thử Nghiệm 1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Khóa kết nối của máy/)).toBeTruthy();
  });
});

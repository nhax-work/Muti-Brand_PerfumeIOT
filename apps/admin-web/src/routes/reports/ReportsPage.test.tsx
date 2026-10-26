import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import ReportsPage from './ReportsPage';

const SUPER_ADMIN = {
  id: 'sa',
  brandId: null as string | null,
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: ['report.brand', 'revenue.manage'],
};
let mockUser = SUPER_ADMIN;
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));
vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockSales = vi.fn();
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useProductRanking: () => ({
    isLoading: false,
    data: [
      {
        fragranceProductId: 'p-1',
        productName: 'Aurore No.5',
        selectionCount: 5,
        impressionCount: 20,
        orderCount: 3,
      },
      {
        fragranceProductId: 'p-2',
        productName: 'Hương Sen',
        selectionCount: 2,
        impressionCount: 0,
      },
    ],
  }),
  useRentalSales: (filter: unknown) => {
    mockSales(filter);
    return {
      isLoading: false,
      data: {
        from: '2026-10-01T00:00:00Z',
        to: '2026-11-01T00:00:00Z',
        currency: 'VND',
        groupBy: 'PACKAGE',
        totals: {
          invoiceCount: 3,
          rentAmount: '17100000.0000',
          storageAmount: '3600000.0000',
          graceFeeAmount: '0.0000',
          totalAmount: '20700000.0000',
        },
        items: [
          {
            key: 'pkg-3',
            label: 'Gói 3 tháng',
            invoiceCount: 3,
            rentAmount: '17100000.0000',
            storageAmount: '3600000.0000',
            graceFeeAmount: '0.0000',
            totalAmount: '20700000.0000',
          },
        ],
      },
    };
  },
  useMachineOptions: () => ({ data: { items: [] } }),
  useLocationOptions: () => ({ data: { items: [] } }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockUser = SUPER_ADMIN;
});

describe('ReportsPage (FR-RPT-06, FR-SLT-47)', () => {
  it('xếp hạng theo thứ tự máy chủ trả, kèm tỷ lệ chọn', () => {
    renderScreen(<ReportsPage />);
    const rows = screen.getAllByRole('row');
    expect(rows[1]!.textContent).toContain('Aurore No.5');
    expect(rows[1]!.textContent).toContain('25%');
    expect(rows[2]!.textContent).toContain('Hương Sen');
  });

  it('Super Admin: tab doanh thu bán gói tách phí thuê, bảo quản, đổi cách nhóm', () => {
    renderScreen(<ReportsPage />);
    fireEvent.click(screen.getByText('Doanh thu bán gói'));
    expect(screen.getByText('Gói 3 tháng')).toBeTruthy();
    expect(screen.getAllByText(/20\.700\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/17\.100\.000/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('Máy').at(-1)!);
    expect(mockSales).toHaveBeenLastCalledWith(expect.objectContaining({ groupBy: 'MACHINE' }));
  });

  it('Brand Admin: không có tab doanh thu bán gói', () => {
    mockUser = { id: 'ba', brandId: 'b-1', roles: ['BRAND_ADMIN'], permissions: ['report.brand'] };
    renderScreen(<ReportsPage />);
    expect(screen.getByText('Aurore No.5')).toBeTruthy();
    expect(screen.queryByText('Doanh thu bán gói')).toBeNull();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import MySlotsPage from './MySlotsPage';
import { periodRange } from './period';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const rental = (id: string, slotId: string, extra: Record<string, unknown>) => ({
  id,
  slotId,
  machineId: 'm-1',
  brandId: 'b-1',
  status: 'ACTIVE',
  stage: 'ACTIVE',
  startsAt: '2026-09-16T00:00:00Z',
  endsAt: '2027-09-16T00:00:00Z',
  currency: 'VND',
  fragranceProductId: 'p-1',
  pricePerSpray: '35000.0000',
  ...extra,
});

const RENTALS = [
  rental('r-selling', 's-1', {}),
  rental('r-unpriced', 's-2', { pricePerSpray: null }),
  rental('r-ended', 's-3', { status: 'CLOSED', stage: 'ENDED' }),
];

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    useMyRentals: () => ({
      data: { items: RENTALS, meta: { page: 1, pageSize: 100, total: 3 } },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useInvoices: (ids: string[]) =>
      ids.map((id, i) => ({
        data: {
          rentalId: id,
          slotNumber: i + 1,
          machineDisplayName: 'Máy Vincom #1',
          locationName: 'Vincom Đồng Khởi',
        },
      })),
    useMachineMaps: () => [
      {
        data: [
          {
            slotNumber: 1,
            mine: true,
            available: true,
            slotId: 's-1',
            productName: 'Aurore Matinale',
            estimatedRemainingSprays: 412,
          },
          {
            slotNumber: 2,
            mine: true,
            available: false,
            slotId: 's-2',
            productName: 'Aurore Nocturne',
            estimatedRemainingSprays: 90,
          },
          { slotNumber: 3, mine: false, available: false },
        ],
      },
    ],
    useBrandSlotReport: () => ({
      data: [
        {
          slotRentalId: 'r-selling',
          slotId: 's-1',
          machineId: 'm-1',
          orderCount: 12,
          revenue: '420000.0000',
        },
        {
          slotRentalId: 'r-unpriced',
          slotId: 's-2',
          machineId: 'm-1',
          orderCount: 0,
          revenue: '0.0000',
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    }),
  };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter>
          <MySlotsPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('MySlotsPage — Slot của tôi', () => {
  it('chỉ liệt kê slot đang giữ, ghép số slot, trạng thái bán, lượt còn lại và doanh thu', () => {
    renderPage();
    const sellingRow = screen.getByText('Máy Vincom #1 · Slot #1').closest('tr')!;
    expect(within(sellingRow).getByText('Aurore Matinale')).toBeTruthy();
    expect(within(sellingRow).getByText('Đang bán')).toBeTruthy();
    expect(within(sellingRow).getByText('412')).toBeTruthy();
    expect(within(sellingRow).getByText('12')).toBeTruthy();
    expect(within(sellingRow).getByText(/420\.000 VND/)).toBeTruthy();

    // Slot chưa đặt giá: chưa nhận đơn (FR-SLT-29) — hiện "Chưa cấu hình", không phải "Tạm ngưng".
    const unpricedRow = screen.getByText('Máy Vincom #1 · Slot #2').closest('tr')!;
    expect(within(unpricedRow).getByText('Chưa cấu hình')).toBeTruthy();

    // Hóa đơn đã kết thúc không thuộc "slot của tôi".
    expect(screen.queryByText('Máy Vincom #1 · Slot #3')).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(3); // tiêu đề + 2 slot
  });

  it('nút Cấu hình dẫn tới hóa đơn của slot (gán sản phẩm, đặt giá)', () => {
    renderPage();
    const row = screen.getByText('Máy Vincom #1 · Slot #2').closest('tr')!;
    fireEvent.click(within(row).getByText('Cấu hình'));
    expect(mockNavigate).toHaveBeenCalledWith('/rentals/r-unpriced');
  });
});

describe('periodRange', () => {
  const now = new Date(2026, 9, 16, 14, 30); // 16/10/2026 theo giờ máy chạy test

  it('tháng này: từ đầu tháng tới đầu tháng sau', () => {
    expect(periodRange('thisMonth', now)).toEqual({
      from: new Date(2026, 9, 1).toISOString(),
      to: new Date(2026, 10, 1).toISOString(),
    });
  });

  it('tháng trước và toàn bộ', () => {
    expect(periodRange('lastMonth', now)).toEqual({
      from: new Date(2026, 8, 1).toISOString(),
      to: new Date(2026, 9, 1).toISOString(),
    });
    expect(periodRange('all', now)).toEqual({});
  });
});

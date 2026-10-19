import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import PricingPage from './PricingPage';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockSavePackage = vi.fn().mockResolvedValue({});
const mockSetRentPrice = vi.fn().mockResolvedValue({});

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    useRentalPackages: () => ({
      data: [
        {
          id: 'pkg-12',
          name: 'Gói 12 tháng',
          durationMonths: 12,
          discountPercent: 10,
          isActive: true,
        },
        { id: 'pkg-old', name: 'Gói cũ', durationMonths: 1, discountPercent: 0, isActive: false },
      ],
      isLoading: false,
    }),
    useStoragePlans: () => ({ data: [], isLoading: false }),
    useSavePackage: () => ({ mutateAsync: mockSavePackage, isPending: false }),
    useSavePlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePricingMachines: () => ({
      data: { items: [{ id: 'm-1', displayName: 'Máy Vincom #1', serialNumber: 'M001' }] },
      isLoading: false,
    }),
    usePricingSlots: () => ({
      data: [
        {
          id: 's-1',
          machineId: 'm-1',
          slotNumber: 1,
          status: 'AVAILABLE',
          monthlyRentPrice: '1500000.0000',
        },
        { id: 's-6', machineId: 'm-1', slotNumber: 6, status: 'DISABLED', monthlyRentPrice: null },
      ],
      isLoading: false,
    }),
    useSetRentPrice: () => ({ mutateAsync: mockSetRentPrice, isPending: false }),
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
  mockSavePackage.mockClear();
  mockSetRentPrice.mockClear();
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('PricingPage — bảng giá thuê slot (FR-SLT-30 ÷ 32)', () => {
  it('liệt kê cả gói ngừng mở bán và sửa ưu đãi — số tháng khóa sau khi tạo', async () => {
    renderPage();
    expect(screen.getByText('Gói cũ')).toBeTruthy();
    expect(screen.getByText('Ngừng mở bán')).toBeTruthy();

    const row = screen.getByText('Gói 12 tháng').closest('tr')!;
    fireEvent.click(within(row).getByText('Sửa'));
    const dialog = await screen.findByRole('dialog');
    const inputs = within(dialog).getAllByRole('spinbutton');
    expect((inputs[0] as HTMLInputElement).disabled).toBe(true); // số tháng

    fireEvent.change(inputs[1]!, { target: { value: '15' } });
    fireEvent.click(within(dialog).getByText('Lưu thay đổi'));
    await waitFor(() =>
      expect(mockSavePackage).toHaveBeenCalledWith({
        id: 'pkg-12',
        update: { name: 'Gói 12 tháng', discountPercent: 15, isActive: true },
      }),
    );
  });

  it('đặt giá niêm yết cho slot chưa mở cho thuê', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Giá niêm yết slot'));
    const row = (await screen.findByText('#6')).closest('tr')!;
    expect(within(row).getByText('Chưa mở cho thuê')).toBeTruthy();

    fireEvent.click(within(row).getByText('Đặt giá thuê'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '2000' } });
    fireEvent.click(within(dialog).getByText('Lưu thay đổi'));
    await waitFor(() =>
      expect(mockSetRentPrice).toHaveBeenCalledWith({ slotId: 's-6', price: '2000' }),
    );
  });
});

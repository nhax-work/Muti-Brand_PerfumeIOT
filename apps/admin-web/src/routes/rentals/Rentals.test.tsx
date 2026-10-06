import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/shared/i18n';
import RentalsPage from './RentalsPage';

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
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
});

// Mock Auth context cho BRAND_ADMIN
vi.mock('@/shared/auth', () => ({
  useAuth: () => ({
    user: {
      userId: 'user-1',
      brandId: 'brand-1',
      roles: ['BRAND_ADMIN'],
    },
    hasRole: (role: string) => role === 'BRAND_ADMIN',
    isAuthenticated: true,
  }),
  useReauth: () => ({
    withReauth: async (fn: () => Promise<unknown>) => fn(),
  }),
}));

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    useSlotRentals: () => ({
      data: {
        items: [
          {
            id: 'rental-1',
            slotId: 'slot-1',
            machineId: 'machine-1',
            brandId: 'brand-1',
            status: 'ACTIVE',
            stage: 'ACTIVE',
            startsAt: '2026-10-01T00:00:00Z',
            endsAt: '2027-01-01T00:00:00Z',
            currency: 'VND',
            totalAmount: '3300000.0000',
            invoiceNumber: 'HD-20261001-234567',
            durationMonths: 3,
            pricePerSpray: '15000.0000',
          },
        ],
        total: 1,
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
  };
});

function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe('RentalsPage Component', () => {
  it('hiển thị danh sách hóa đơn và mã HD của thương hiệu', () => {
    render(
      <TestWrapper>
        <RentalsPage />
      </TestWrapper>,
    );

    expect(screen.getByText('HD-20261001-234567')).toBeDefined();
    expect(screen.getByText(/3[.,]300[.,]000/)).toBeDefined();
    expect(screen.getByText('Đang hiệu lực')).toBeDefined();
  });
});

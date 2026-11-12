import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import RevenuePage from './RevenuePage';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useRevenueSplit: () => ({
    isLoading: false,
    data: {
      periodStart: '2026-10-01',
      periodEnd: '2026-10-21',
      currency: 'VND',
      brandRevenue: '10000000.0000',
      platformRevenue: '250000.0000',
      orderCountBrand: 400,
      orderCountPlatform: 5,
    },
  }),
  useMachineOptions: () => ({ data: { items: [] } }),
}));

beforeAll(installDomStubs);
afterEach(cleanup);

describe('RevenuePage (FR-REV-04)', () => {
  it('hiện hai nguồn doanh thu tách bạch kèm số đơn và khoảng thời gian', () => {
    renderScreen(<RevenuePage />);
    expect(screen.getByText('Doanh thu thương hiệu')).toBeTruthy();
    expect(screen.getByText('Doanh thu nền tảng')).toBeTruthy();
    expect(screen.getByText('400 đơn')).toBeTruthy();
    expect(screen.getByText('5 đơn')).toBeTruthy();
    expect(screen.getByText('Từ 2026-10-01 đến 2026-10-21')).toBeTruthy();
  });
});

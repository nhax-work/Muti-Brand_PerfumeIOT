import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import BottleReturnsPage from './BottleReturnsPage';
import type { BottleReturn } from './api';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockReturns: BottleReturn[] = [
  {
    id: 'ret-1',
    slotRentalId: 'rental-1',
    brandId: 'brand-1',
    returnMethod: 'SHIP_TO_BRAND',
    shippingAddress: '123 Đường Lê Lợi, Q1, TP.HCM',
    readyAt: '2026-10-26T08:00:00Z',
    pickupDeadline: '2026-11-09T08:00:00Z',
    handedOverAt: null,
    recipientName: null,
    trackingNumber: null,
    forfeitedAt: null,
    createdAt: '2026-10-26T08:00:00Z',
    bottles: [
      {
        id: 'bottle-1',
        brandId: 'brand-1',
        owner: 'BRAND',
        batchId: 'batch-1',
        identifier: 'BTL-001',
        status: 'RETURNED_TO_BRAND',
        initialVolumeMl: 100,
        currentEstimatedMl: 45,
      },
    ],
  },
  {
    id: 'ret-2',
    slotRentalId: 'rental-2',
    brandId: 'brand-1',
    returnMethod: 'WAREHOUSE_PICKUP',
    shippingAddress: null,
    readyAt: '2026-10-20T08:00:00Z',
    pickupDeadline: '2026-11-03T08:00:00Z',
    handedOverAt: '2026-10-22T10:00:00Z',
    recipientName: 'Nguyễn Văn Đại Diện',
    trackingNumber: null,
    forfeitedAt: null,
    createdAt: '2026-10-20T08:00:00Z',
    bottles: [
      {
        id: 'bottle-2',
        brandId: 'brand-1',
        owner: 'BRAND',
        batchId: 'batch-2',
        identifier: 'BTL-002',
        status: 'RETURNED_TO_BRAND',
        initialVolumeMl: 50,
        currentEstimatedMl: 12,
      },
    ],
  },
];

const mockMutation = () => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
});

vi.mock('./api', () => ({
  useBottleReturns: () => ({
    data: { items: mockReturns, meta: { total: 2, page: 1, pageSize: 10 } },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useBottleReturn: (id?: string) => ({
    data: mockReturns.find((r) => r.id === id),
    isLoading: false,
  }),
  useCreateBottleReturn: () => mockMutation(),
  useHandOverBottleReturn: () => mockMutation(),
}));

describe('BottleReturnsPage', () => {
  beforeAll(() => {
    installDomStubs();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders page header and list of returns correctly', () => {
    renderScreen(<BottleReturnsPage />);

    expect(screen.getByText('Quản lý phiếu trả hàng')).toBeDefined();
    expect(screen.getByText('ret-1')).toBeDefined();
    expect(screen.getByText('ret-2')).toBeDefined();
    expect(screen.getByText('Giao tận nơi')).toBeDefined();
    expect(screen.getByText('Nhận tại kho')).toBeDefined();
    expect(screen.getByText('Đã bàn giao')).toBeDefined();
    expect(screen.getByText('Chờ nhận hàng')).toBeDefined();
  });

  it('opens detail drawer when clicking details button', () => {
    renderScreen(<BottleReturnsPage />);

    const detailButtons = screen.getAllByText('Chi tiết');
    fireEvent.click(detailButtons[0]!);

    expect(screen.getByText('123 Đường Lê Lợi, Q1, TP.HCM')).toBeDefined();
    expect(screen.getByText('BTL-001')).toBeDefined();
  });

  it('opens create modal when clicking create button', () => {
    renderScreen(<BottleReturnsPage />);

    const createBtn = screen.getByText('Lập phiếu trả hàng');
    fireEvent.click(createBtn);

    expect(screen.getByText('Tháo chai & Lập phiếu trả hàng')).toBeDefined();
    expect(screen.getByText('Lưu ý tháo chai')).toBeDefined();
  });
});

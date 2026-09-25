import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/shared/i18n';
import type { Brand, MachineSlot, SlotRental } from './api';
import { SlotCard } from './components/SlotCard';

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

function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
}

describe('SlotCard Component', () => {
  const mockSlot: MachineSlot = {
    id: 's-1',
    machineId: 'm-1',
    slotNumber: 1,
    status: 'AVAILABLE',
    calibratedDosageMl: 0.12,
    lowStockThresholdMl: 5.0,
    estimatedRemainingMl: 45.0,
    estimatedRemainingSprays: 375,
    activeBottleId: 'bottle-001',
    currentRentalId: 'rental-1',
  };

  const mockBrand: Brand = {
    id: 'brand-1',
    code: 'MAISON_AURORE',
    name: 'Maison Aurore',
    logoUrl: 'https://example.com/logo.png',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
  };

  const mockRental: SlotRental = {
    id: 'rental-1',
    slotId: 's-1',
    machineId: 'm-1',
    brandId: 'brand-1',
    status: 'ACTIVE',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2026-12-31T23:59:59Z',
    pricePerSpray: '35000',
    currency: 'VND',
    revenueSharePercent: 10,
  };

  it('hiển thị đầy đủ số slot và thông tin thương hiệu đang thuê', () => {
    const onOpenConfig = vi.fn();

    render(
      <TestWrapper>
        <SlotCard
          slot={mockSlot}
          rental={mockRental}
          brand={mockBrand}
          onOpenConfig={onOpenConfig}
        />
      </TestWrapper>,
    );

    // Kiểm tra số slot
    expect(screen.getByText('Slot 1')).toBeDefined();
    // Kiểm tra tên thương hiệu
    expect(screen.getByText('Maison Aurore')).toBeDefined();
    expect(screen.getByText('MAISON_AURORE')).toBeDefined();
    // Kiểm tra dung tích còn lại
    expect(screen.getByText(/45.00 ml/)).toBeDefined();
    expect(screen.getByText(/375 lượt/)).toBeDefined();
    // Kiểm tra định lượng và ngưỡng cảnh báo
    expect(screen.getByText('0.12 ml')).toBeDefined();
    expect(screen.getByText('5 ml')).toBeDefined();
  });

  it('hiển thị nhãn slot trống khi chưa có thương hiệu nào thuê', () => {
    const vacantSlot: MachineSlot = {
      ...mockSlot,
      currentRentalId: null,
    };

    render(
      <TestWrapper>
        <SlotCard slot={vacantSlot} rental={undefined} brand={undefined} onOpenConfig={vi.fn()} />
      </TestWrapper>,
    );

    expect(screen.getByText(/Slot trống/)).toBeDefined();
    expect(screen.getByText(/Chưa có thương hiệu thuê/)).toBeDefined();
  });

  it('gọi onOpenConfig khi nhấp vào nút Cấu hình slot', () => {
    const onOpenConfig = vi.fn();

    render(
      <TestWrapper>
        <SlotCard
          slot={mockSlot}
          rental={mockRental}
          brand={mockBrand}
          onOpenConfig={onOpenConfig}
        />
      </TestWrapper>,
    );

    const configButton = screen.getByText('Cấu hình slot');
    fireEvent.click(configButton);

    expect(onOpenConfig).toHaveBeenCalledWith(mockSlot);
  });

  it('hiển thị nút Tắt slot khi slot đang khả dụng (AVAILABLE)', () => {
    render(
      <TestWrapper>
        <SlotCard slot={mockSlot} rental={mockRental} brand={mockBrand} onOpenConfig={vi.fn()} />
      </TestWrapper>,
    );

    expect(screen.getByText('Tắt slot')).toBeDefined();
  });

  it('hiển thị nút Bật slot khi slot đang tạm ngưng (UNAVAILABLE)', () => {
    const unavailableSlot: MachineSlot = {
      ...mockSlot,
      status: 'UNAVAILABLE',
    };

    render(
      <TestWrapper>
        <SlotCard
          slot={unavailableSlot}
          rental={mockRental}
          brand={mockBrand}
          onOpenConfig={vi.fn()}
        />
      </TestWrapper>,
    );

    expect(screen.getByText('Bật slot')).toBeDefined();
    expect(screen.getByText('Tạm ngưng')).toBeDefined();
  });

  it('hiển thị tên loại nước hoa và mã SKU thay vì chỉ hiển thị UUID của chai', () => {
    const mockProduct = {
      id: 'prod-001',
      name: 'Aurore Matinale',
      sku: 'MA-001',
    };

    render(
      <TestWrapper>
        <SlotCard
          slot={mockSlot}
          rental={mockRental}
          brand={mockBrand}
          product={mockProduct}
          onOpenConfig={vi.fn()}
        />
      </TestWrapper>,
    );

    // Kiểm tra tên loại nước hoa và mã SKU được hiển thị
    expect(screen.getByText('Aurore Matinale')).toBeDefined();
    expect(screen.getByText('MA-001')).toBeDefined();
    expect(screen.getByText('BTL #1')).toBeDefined();
  });
});

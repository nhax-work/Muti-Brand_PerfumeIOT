import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import ShipmentsPage from './ShipmentsPage';
import type { InventoryBatchItem, RefillSessionItem, ShipmentItem } from './api';

let mockUser: { id: string; brandId: string | null; roles: string[] } = {
  id: 'u-admin',
  brandId: null,
  roles: ['PLATFORM_SUPER_ADMIN'],
};

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));

const mockShipments: ShipmentItem[] = [
  {
    id: 'decl-0001-aaaa',
    brandId: 'brand-1',
    fragranceProductId: 'prod-perfume-01',
    declaredQuantity: 20,
    declaredBottleVolumeMl: '50',
    expectedShipDate: '2026-10-25',
    status: 'DECLARED',
    receivedQuantity: null,
    discrepancyNotes: null,
    declaredBy: 'u-brand',
    receivedBy: null,
    receivedAt: null,
    createdAt: '2026-10-21T09:00:00Z',
  },
  {
    id: 'decl-0002-bbbb',
    brandId: 'brand-1',
    fragranceProductId: 'prod-perfume-02',
    declaredQuantity: 10,
    declaredBottleVolumeMl: '50',
    expectedShipDate: '2026-10-20',
    status: 'RECEIVED',
    receivedQuantity: 10,
    discrepancyNotes: null,
    declaredBy: 'u-brand',
    receivedBy: 'u-staff',
    receivedAt: '2026-10-21T10:00:00Z',
    createdAt: '2026-10-20T09:00:00Z',
  },
];

const mockBatches: InventoryBatchItem[] = [
  {
    id: 'batch-0001',
    brandId: 'brand-1',
    fragranceProductId: 'prod-perfume-02',
    sourceDeclarationId: 'decl-0002-bbbb',
    batchNumber: 'BATCH-202610-B1-001',
    quantityReceived: 10,
    receivedAt: '2026-10-21T10:00:00Z',
    supplierInfo: {
      authenticityStatus: 'PENDING',
      documentUrl: 'https://docs.brand.com/invoice-001.pdf',
    },
    createdAt: '2026-10-21T10:00:00Z',
  },
];

const mockRefillSessions: RefillSessionItem[] = [
  {
    id: 'refill-0001',
    machineId: 'mch-01',
    slotId: 'slt-01',
    brandId: 'brand-1',
    status: 'STARTED',
    performedBy: 'u-staff',
    newBottleId: null,
    afterWeightG: null,
    checklistCompleted: false,
    notes: 'Thao tác thay chai mới',
    startedAt: '2026-10-21T11:00:00Z',
    completedAt: null,
  },
];

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useShipmentDeclarations: () => ({
    data: { items: mockShipments, meta: { total: mockShipments.length, page: 1, pageSize: 20 } },
    isLoading: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useInventoryBatches: () => ({
    data: { items: mockBatches, meta: { total: mockBatches.length, page: 1, pageSize: 20 } },
    isLoading: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useRefillSessions: () => ({
    data: { items: mockRefillSessions, meta: { total: mockRefillSessions.length, page: 1, pageSize: 20 } },
    isLoading: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useBottles: () => ({
    data: { items: [], meta: { total: 0, page: 1, pageSize: 50 } },
    isLoading: false,
  }),
  useCreateShipmentDeclaration: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReceiveShipment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitAuthenticity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveAuthenticity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectAuthenticity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOpenRefillSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCloseRefillSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('ShipmentsPage Frontend Tests', () => {
  beforeAll(() => {
    installDomStubs();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('Hiển thị danh sách khai báo gửi hàng và thông tin sản phẩm', () => {
    renderScreen(<ShipmentsPage />);

    expect(screen.getByText('Khai báo & Tồn kho')).toBeTruthy();
    expect(screen.getByText('decl-0001-aaaa')).toBeTruthy();
    expect(screen.getByText('decl-0002-bbbb')).toBeTruthy();
    expect(screen.getByText('prod-perfume-01')).toBeTruthy();
  });

  it('Hiển thị nút Tiếp nhận & Đối soát cho nhân viên khi đơn ở trạng thái DECLARED', () => {
    renderScreen(<ShipmentsPage />);

    const receiveButtons = screen.getAllByText('Tiếp nhận & Đối soát');
    expect(receiveButtons.length).toBeGreaterThan(0);
  });


  it('Chuyển qua tab Lô hàng & Giấy tờ và hiển thị trạng thái chính hãng', () => {
    renderScreen(<ShipmentsPage />);

    const batchesTab = screen.getByRole('tab', { name: /Lô hàng & Giấy tờ/i });
    fireEvent.click(batchesTab);

    expect(screen.getByText('BATCH-202610-B1-001')).toBeTruthy();
    expect(screen.getByText('Chờ duyệt')).toBeTruthy();
  });

  it('Chuyển qua tab Phiếu nạp và hiển thị các phiếu nạp đang thực hiện', () => {
    renderScreen(<ShipmentsPage />);

    const refillTab = screen.getByRole('tab', { name: /Phiếu nạp nước hoa/i });
    fireEvent.click(refillTab);

    expect(screen.getByText('refill-0001')).toBeTruthy();
    expect(screen.getByText('mch-01')).toBeTruthy();
    expect(screen.getByText('Đang thao tác')).toBeTruthy();
  });
});


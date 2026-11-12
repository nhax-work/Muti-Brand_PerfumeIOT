import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import { installDomStubs, renderScreen } from '@/test-utils';
import ShipmentsPage from './ShipmentsPage';
import type { InventoryBatch, RefillSession, ShipmentDeclaration } from './api';

interface MockUser {
  id: string;
  brandId: string | null;
  roles: string[];
  permissions: string[];
}

const INVENTORY_STAFF: MockUser = {
  id: 'u-staff',
  brandId: null,
  roles: ['INVENTORY_STAFF'],
  permissions: ['inventory.manage', 'machine.view'],
};
const BRAND_ADMIN: MockUser = {
  id: 'u-brand',
  brandId: 'brand-1',
  roles: ['BRAND_ADMIN'],
  permissions: ['inventory.declare', 'product.manage'],
};
const SUPER_ADMIN: MockUser = {
  id: 'u-admin',
  brandId: null,
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: ['inventory.verify', 'inventory.manage', 'machine.view'],
};

let mockUser: MockUser = INVENTORY_STAFF;

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));

const shipments: ShipmentDeclaration[] = [
  {
    id: 'decl-1',
    brandId: 'brand-1',
    fragranceProductId: 'prod-1',
    productName: 'Aurore Matinale',
    declaredQuantity: 20,
    declaredBottleVolumeMl: 50,
    expectedShipDate: '2026-10-25',
    status: 'DECLARED',
    receivedQuantity: null,
    discrepancyNotes: null,
    receivedBy: null,
    receivedAt: null,
    resultingBatchId: null,
    createdAt: '2026-10-21T09:00:00Z',
  },
  {
    id: 'decl-2',
    brandId: 'brand-1',
    fragranceProductId: 'prod-2',
    productName: 'Aurore Nocturne',
    declaredQuantity: 10,
    declaredBottleVolumeMl: 50,
    expectedShipDate: null,
    status: 'DISCREPANCY',
    receivedQuantity: 9,
    discrepancyNotes: 'Vỡ 1 chai',
    receivedBy: 'u-staff',
    receivedAt: '2026-10-21T10:00:00Z',
    resultingBatchId: 'batch-pending',
    createdAt: '2026-10-20T09:00:00Z',
  },
];

function batch(id: string, status: InventoryBatch['authenticityStatus']): InventoryBatch {
  return {
    id,
    brandId: 'brand-1',
    fragranceProductId: 'prod-2',
    productName: 'Aurore Nocturne',
    sourceDeclarationId: 'decl-2',
    batchNumber: `LOT-${id}`,
    receivedAt: '2026-10-21T10:00:00Z',
    expiresAt: null,
    quantityReceived: 9,
    authenticityStatus: status,
    authenticityDocumentUrl: status === 'NOT_SUBMITTED' ? null : 'https://docs.test/a.pdf',
    authenticityDocumentType: null,
    authenticitySubmittedAt: null,
    authenticityVerifiedAt: null,
    authenticityRejectionReason: status === 'REJECTED' ? 'Chứng từ mờ' : null,
  };
}

const batches = [
  batch('pending', 'PENDING'),
  batch('approved', 'APPROVED'),
  batch('rejected', 'REJECTED'),
];

const sessions: RefillSession[] = [
  {
    id: 'refill-1',
    brandId: 'brand-1',
    machineId: 'mch-1',
    slotId: 'slot-1',
    oldBottleId: null,
    newBottleId: null,
    performedBy: 'u-staff',
    status: 'STARTED',
    checklistCompleted: false,
    notes: null,
    startedAt: '2026-10-21T11:00:00Z',
    completedAt: null,
  },
  {
    id: 'refill-2',
    brandId: 'brand-1',
    machineId: 'mch-1',
    slotId: 'slot-2',
    oldBottleId: null,
    newBottleId: 'bottle-1',
    performedBy: 'u-staff',
    status: 'COMPLETED',
    checklistCompleted: true,
    notes: 'Thay chai',
    startedAt: '2026-10-20T11:00:00Z',
    completedAt: '2026-10-20T11:20:00Z',
  },
];

const list = <T,>(items: T[]) => ({
  data: { items, meta: { total: items.length, page: 1, pageSize: 200 } },
  isLoading: false,
});
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
const mockCreate = vi.fn().mockResolvedValue({ id: 'decl-new' });
const mockAddPhoto = vi.fn().mockResolvedValue({});

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useShipmentDeclarations: () => list(shipments),
  useInventoryBatches: () => list(batches),
  useRefillSessions: () => list(sessions),
  useStockBottles: () => list([]),
  useBrandProducts: () => list([{ id: 'prod-1', name: 'Aurore Matinale' }]),
  useMachinesForRefill: () =>
    list([{ id: 'mch-1', displayName: 'Kiosk Crescent', serialNumber: 'M001' }]),
  useMachineSlots: () => ({ data: [], isLoading: false }),
  useCreateShipmentDeclaration: () => ({ mutateAsync: mockCreate, isPending: false }),
  useAddShipmentPhoto: () => ({ mutateAsync: mockAddPhoto, isPending: false }),
  useDeleteShipmentPhoto: () => mutation(),
  useReceiveShipment: () => mutation(),
  useSubmitAuthenticity: () => mutation(),
  useApproveAuthenticity: () => mutation(),
  useRejectAuthenticity: () => mutation(),
  useInventoryReport: () => ({
    data: [
      {
        brandId: 'brand-1',
        fragranceProductId: 'prod-1',
        productName: 'Aurore Matinale',
        batchId: 'batch-1',
        machineId: 'mch-1',
        slotId: 'slot-1',
        estimatedRemainingMl: 35,
        estimatedRemainingSprays: 350,
        lowStock: false,
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useOpenRefillSession: () => mutation(),
  useCloseRefillSession: () => mutation(),
}));

function openTab(name: RegExp) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

/**
 * Nút mang đúng nhãn. `getAllByRole('button', { name })` phải tính accessible name cho mọi phần tử
 * của bảng antd — chậm tới hàng phút trên jsdom — nên tìm theo chữ rồi lọc phần tử nằm trong nút.
 */
function buttonsLabelled(label: string): HTMLElement[] {
  return screen.queryAllByText(label).filter((el) => el.closest('button') !== null);
}

describe('ShipmentsPage', () => {
  beforeAll(() => {
    installDomStubs();
  });

  afterEach(() => {
    cleanup();
    mockUser = INVENTORY_STAFF;
  });

  it('Inventory Staff vào được màn, tiếp nhận khai báo DECLARED, không khai báo thay thương hiệu', () => {
    renderScreen(<ShipmentsPage />);
    expect(screen.getByText('Aurore Matinale')).toBeTruthy();
    expect(screen.getByText('Vỡ 1 chai')).toBeTruthy();
    expect(screen.getAllByText('Tiếp nhận & Đối soát')).toHaveLength(1);
    expect(screen.queryByText('Khai báo gửi hàng mới')).toBeNull();
  });

  it('Brand Admin khai báo được, không thấy nút tiếp nhận', () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<ShipmentsPage />);
    expect(screen.getByText('Khai báo gửi hàng mới')).toBeTruthy();
    expect(screen.queryByText('Tiếp nhận & Đối soát')).toBeNull();
  });

  it('Brand Admin nộp giấy tờ cho lô chưa duyệt, lô đã duyệt thì không', () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<ShipmentsPage />);
    openTab(/Lô hàng & Giấy tờ/);
    expect(screen.getByText('LOT-approved')).toBeTruthy();
    expect(screen.getByText('Chứng từ mờ')).toBeTruthy();
    // Lô PENDING và REJECTED có nút nộp; lô APPROVED không.
    expect(screen.getAllByText('Nộp giấy tờ chính hãng')).toHaveLength(2);
    expect(screen.queryByText('Duyệt chính hãng')).toBeNull();
  });

  it('Super Admin chỉ duyệt/từ chối lô đang chờ duyệt', () => {
    mockUser = SUPER_ADMIN;
    renderScreen(<ShipmentsPage />);
    openTab(/Lô hàng & Giấy tờ/);
    expect(buttonsLabelled('Duyệt chính hãng')).toHaveLength(1);
    // 'Từ chối duyệt' cũng là nhãn trạng thái REJECTED — đếm nút, không đếm chữ.
    expect(buttonsLabelled('Từ chối duyệt')).toHaveLength(1);
    expect(screen.queryByText('Nộp giấy tờ chính hãng')).toBeNull();
  });

  it('Phiếu nạp hiện tên máy, chỉ phiếu đang mở mới có nút hoàn tất', () => {
    renderScreen(<ShipmentsPage />);
    openTab(/Phiếu nạp nước hoa/);
    expect(screen.getAllByText('Kiosk Crescent')).toHaveLength(2);
    expect(screen.getByText('Đang thao tác')).toBeTruthy();
    expect(screen.getByText('Hoàn tất')).toBeTruthy();
    expect(screen.getAllByText('Hoàn tất nạp')).toHaveLength(1);
    expect(screen.getByText('Mở phiếu nạp')).toBeTruthy();
  });

  it('Brand Admin xem phiếu nạp nhưng không mở hay đóng phiếu', () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<ShipmentsPage />);
    openTab(/Phiếu nạp nước hoa/);
    expect(screen.queryByText('Mở phiếu nạp')).toBeNull();
    expect(screen.queryByText('Hoàn tất nạp')).toBeNull();
  });

  it('Hiển thị tab Báo cáo tồn kho với dữ liệu tồn kho', () => {
    renderScreen(<ShipmentsPage />);
    openTab(/Báo cáo tồn kho/);
    expect(screen.getByText('Tổng số mặt hàng')).toBeTruthy();
    expect(screen.getByText('Vị trí sắp hết')).toBeTruthy();
    expect(screen.getAllByText('Aurore Matinale').length).toBeGreaterThanOrEqual(1);
  });
});

describe('ShipmentsPage — ảnh khai báo gửi hàng (FR-INV-22, ADR-0024)', () => {
  beforeAll(installDomStubs);
  afterEach(() => {
    cleanup();
    mockUser = INVENTORY_STAFF;
    mockCreate.mockClear();
    mockAddPhoto.mockClear();
  });

  function renderAt(entry: string) {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter initialEntries={[entry]}>
            <ShipmentsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );
  }

  /** Điền phần số liệu của pop-up khai báo (sản phẩm đã chọn sẵn qua `?product=`). */
  function fillNumbers(dialog: HTMLElement) {
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0]!, { target: { value: '4' } });
  }

  it('test_FR_INV_22_declare_requires_both_photo_kinds', async () => {
    mockUser = BRAND_ADMIN;
    renderAt('/shipments?declare=1&product=prod-1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ảnh lô hàng trước khi đóng gói')).toBeTruthy();
    expect(within(dialog).getByText('Ảnh kiện hàng đã đóng gói')).toBeTruthy();
    fillNumbers(dialog);
    fireEvent.click(within(dialog).getByText('Khai báo'));
    await waitFor(() => expect(within(dialog).getAllByText('Cần ít nhất 1 ảnh')).toHaveLength(2));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('test_FR_INV_22_declare_uploads_photos_after_creating_declaration', async () => {
    mockUser = BRAND_ADMIN;
    renderAt('/shipments?declare=1&product=prod-1');
    const dialog = await screen.findByRole('dialog');
    fillNumbers(dialog);
    const inputs = dialog.querySelectorAll<HTMLInputElement>('input[type=file]');
    const before = new File(['a'], 'lo-hang.jpg', { type: 'image/jpeg' });
    const packed = new File(['b'], 'kien-hang.png', { type: 'image/png' });
    fireEvent.change(inputs[0]!, { target: { files: [before] } });
    fireEvent.change(inputs[1]!, { target: { files: [packed] } });
    await waitFor(() => expect(within(dialog).getByText('lo-hang.jpg')).toBeTruthy());

    fireEvent.click(within(dialog).getByText('Khai báo'));
    await waitFor(() => expect(mockAddPhoto).toHaveBeenCalledTimes(2));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fragranceProductId: 'prod-1', declaredQuantity: 4 }),
    );
    expect(mockAddPhoto).toHaveBeenNthCalledWith(1, {
      id: 'decl-new',
      kind: 'BEFORE_PACKING',
      file: before,
    });
    expect(mockAddPhoto).toHaveBeenNthCalledWith(2, {
      id: 'decl-new',
      kind: 'PACKED',
      file: packed,
    });
  });

  it('test_FR_INV_22_declaration_missing_photos_flagged_and_warned_on_receive', async () => {
    renderScreen(<ShipmentsPage />);
    // decl-1 còn DECLARED, chưa có ảnh: gắn cờ Thiếu ảnh.
    expect(screen.getAllByText('Thiếu ảnh')).toHaveLength(1);
    fireEvent.click(buttonsLabelled('Tiếp nhận & Đối soát')[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/chưa gửi đủ ảnh lô hàng và kiện hàng/)).toBeTruthy();
  });

  it('test_FR_INV_22_brand_sees_add_photos_button_for_declared_without_photos', () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<ShipmentsPage />);
    expect(buttonsLabelled('Bổ sung ảnh')).toHaveLength(1);
  });
});

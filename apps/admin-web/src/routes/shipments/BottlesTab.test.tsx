import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { message } from 'antd';
import { ReauthCancelled } from '@/shared/auth';
import { installDomStubs, renderScreen } from '@/test-utils';
import ShipmentsPage from './ShipmentsPage';
import type { AuditLogEntry, Bottle, BottlesFilter, Brand, InventoryBatch, Product } from './api';

interface MockUser {
  id: string;
  brandId: string | null;
  roles: string[];
  permissions: string[];
}

const INVENTORY_STAFF: MockUser = {
  id: 'u-inv',
  brandId: null,
  roles: ['INVENTORY_STAFF'],
  permissions: ['inventory.manage', 'inventory.adjust', 'refill.fulfill', 'machine.view'],
};

const BRAND_ADMIN: MockUser = {
  id: 'u-brand',
  brandId: '11111111-1111-4111-8111-111111111111',
  roles: ['BRAND_ADMIN'],
  permissions: ['inventory.declare', 'product.manage'],
};

let mockUser: MockUser = INVENTORY_STAFF;

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));

const BRAND_1_ID = '11111111-1111-4111-8111-111111111111';
const BRAND_2_ID = '22222222-2222-4222-8222-222222222222';
const PRD_1_ID = '33333333-3333-4333-8333-333333333333';
const PRD_2_ID = '44444444-4444-4444-8444-444444444444';
const BATCH_1_ID = '55555555-5555-4555-8555-555555555555';
const BOTTLE_STOCK_ID = '66666666-6666-4666-8666-666666666666';
const BOTTLE_INSTALLED_ID = '77777777-7777-4777-8777-777777777777';
const SLOT_2_ID = '88888888-8888-4888-8888-888888888888';

vi.mock('@/shared/lookups', () => ({
  useNameLookups: () => ({
    machineName: (id: string | null | undefined) => (id ? 'Kiosk Vincom' : '—'),
    slotLabel: (id: string | null | undefined) =>
      id === SLOT_2_ID ? 'Kiosk Vincom · Slot #2' : (id ?? '—'),
    brandName: (id: string | null | undefined) =>
      ({ [BRAND_1_ID]: 'Maison Aurore', [BRAND_2_ID]: 'Hương Việt' })[id ?? ''] ?? '—',
    userName: (id: string | null | undefined) => (id === 'u-inv' ? 'Trần Kho' : '—'),
  }),
}));

const BRANDS: Brand[] = [
  {
    id: BRAND_1_ID,
    code: 'MAISON',
    name: 'Maison Aurore',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: BRAND_2_ID,
    code: 'HUONGVIET',
    name: 'Hương Việt',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
  },
];

const PRODUCTS: Product[] = [
  {
    id: PRD_1_ID,
    brandId: BRAND_1_ID,
    sku: 'MA-01',
    name: 'Rose Éternelle',
    defaultPrice: '25000.00',
    currency: 'VND',
    status: 'ACTIVE',
  },
  {
    id: PRD_2_ID,
    brandId: BRAND_2_ID,
    sku: 'HV-02',
    name: 'Oud Nocturne',
    defaultPrice: '30000.00',
    currency: 'VND',
    status: 'ACTIVE',
  },
];

const BATCHES: InventoryBatch[] = [
  {
    id: BATCH_1_ID,
    brandId: BRAND_1_ID,
    fragranceProductId: PRD_1_ID,
    productName: 'Rose Éternelle',
    batchNumber: 'BATCH-2026-01',
    receivedAt: '2026-10-20T09:00:00Z',
    quantityReceived: 10,
    authenticityStatus: 'APPROVED',
  },
];

const BOTTLES: Bottle[] = [
  {
    id: BOTTLE_STOCK_ID,
    brandId: BRAND_1_ID,
    owner: 'BRAND',
    batchId: BATCH_1_ID,
    fragranceProductId: PRD_1_ID,
    identifier: 'BTL-001',
    status: 'IN_STOCK',
    initialVolumeMl: 100,
    currentEstimatedMl: 100,
    installedSlotId: null,
    expiresAt: '2027-10-20T00:00:00Z',
  },
  {
    id: BOTTLE_INSTALLED_ID,
    brandId: BRAND_1_ID,
    owner: 'BRAND',
    batchId: BATCH_1_ID,
    fragranceProductId: PRD_1_ID,
    identifier: 'BTL-002',
    status: 'INSTALLED',
    initialVolumeMl: 100,
    currentEstimatedMl: 45,
    installedSlotId: SLOT_2_ID,
    expiresAt: '2027-10-20T00:00:00Z',
  },
];

const HISTORY_ITEMS: AuditLogEntry[] = [
  {
    id: '99999999-9999-4999-8999-999999999901',
    brandId: BRAND_1_ID,
    actorType: 'USER',
    actorId: 'u-inv',
    action: 'inv.inventory.adjusted',
    targetType: 'BOTTLE',
    targetId: BOTTLE_INSTALLED_ID,
    beforeData: { currentEstimatedMl: 50 },
    afterData: { currentEstimatedMl: 45, reason: 'Kiểm kê cuối ngày' },
    occurredAt: '2026-10-25T14:00:00Z',
  },
  {
    id: '99999999-9999-4999-8999-999999999902',
    brandId: BRAND_1_ID,
    actorType: 'USER',
    actorId: 'u-inv',
    action: 'inv.bottle.installed',
    targetType: 'BOTTLE',
    targetId: BOTTLE_INSTALLED_ID,
    afterData: { currentEstimatedMl: 100 },
    occurredAt: '2026-10-22T09:00:00Z',
  },
];

const mockCreateBatch = vi.fn().mockResolvedValue({});
const mockRegisterBottle = vi.fn().mockResolvedValue({});
const mockRemoveBottle = vi.fn().mockResolvedValue({});
const mockAdjustInventory = vi.fn().mockResolvedValue({});
const mockUseBottlesSpy = vi.fn();
const mockUseBottleHistorySpy = vi.fn();

const noopMutation = () => ({ mutateAsync: vi.fn(), isPending: false });

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useShipmentDeclarations: () => ({ data: { items: [] }, isLoading: false }),
  useCreateShipmentDeclaration: () => noopMutation(),
  useAddShipmentPhoto: () => noopMutation(),
  useDeleteShipmentPhoto: () => noopMutation(),
  useReceiveShipment: () => noopMutation(),
  useInventoryBatches: () => ({ data: { items: BATCHES }, isLoading: false }),
  useAllBrands: (enabled: boolean) => ({
    data: enabled ? { items: BRANDS } : undefined,
    isLoading: false,
  }),
  useBrandProducts: (enabled: boolean) => ({
    data: enabled ? { items: PRODUCTS } : undefined,
    isLoading: false,
  }),
  useCreateInventoryBatch: () => ({ mutateAsync: mockCreateBatch, isPending: false }),
  useSubmitAuthenticity: () => noopMutation(),
  useApproveAuthenticity: () => noopMutation(),
  useRejectAuthenticity: () => noopMutation(),
  useRefillSessions: () => ({ data: { items: [] }, isLoading: false }),
  useRefillWorklist: () => ({ data: { items: [] }, isLoading: false }),
  useStockBottles: () => ({ data: { items: [] }, isLoading: false }),
  useMachinesForRefill: () => ({ data: { items: [] }, isLoading: false }),
  useMachineSlots: () => ({ data: [], isLoading: false }),
  useOpenRefillSession: () => noopMutation(),
  useCloseRefillSession: () => noopMutation(),
  useCancelRefillSession: () => noopMutation(),
  useInventoryReport: () => ({ data: { items: [] }, isLoading: false }),
  useBottles: (filter: BottlesFilter) => {
    mockUseBottlesSpy(filter);
    const items = BOTTLES.filter(
      (b) =>
        (!filter.status || b.status === filter.status) &&
        (!filter.batchId || b.batchId === filter.batchId),
    );
    return {
      data: { items, meta: { page: filter.page, pageSize: filter.pageSize, total: items.length } },
      isLoading: false,
    };
  },
  useRegisterBottle: () => ({ mutateAsync: mockRegisterBottle, isPending: false }),
  useRemoveBottleFromSlot: () => ({ mutateAsync: mockRemoveBottle, isPending: false }),
  useCreateInventoryAdjustment: () => ({ mutateAsync: mockAdjustInventory, isPending: false }),
  useBottleHistory: (bottleId: string | undefined, page: number, pageSize = 20) => {
    mockUseBottleHistorySpy({ bottleId, page, pageSize });
    return {
      data: bottleId
        ? { items: HISTORY_ITEMS, meta: { page, pageSize, total: HISTORY_ITEMS.length } }
        : undefined,
      isLoading: false,
      error: null,
    };
  },
}));

/** Tránh `ByRole('button')` vì quét accessible name qua jsdom `getComputedStyle` trên nhiều tab AntD rất chậm. */
function buttonsNamed(label: string): HTMLButtonElement[] {
  return screen
    .queryAllByText(label)
    .map((el) => el.closest('button'))
    .filter((el): el is HTMLButtonElement => el !== null);
}

function buttonAt(label: string, index = 0): HTMLButtonElement {
  const btn = buttonsNamed(label)[index];
  if (!btn) throw new Error(`Button "${label}" at index ${index} not found`);
  return btn;
}

function comboboxAt(container: HTMLElement | null, index: number): HTMLElement {
  const items = container
    ? within(container).getAllByRole('combobox')
    : screen.getAllByRole('combobox');
  const item = items[index];
  if (!item) throw new Error(`Combobox at index ${index} not found`);
  return item;
}

function switchTab(tabText: string) {
  const tab = screen.getByText(tabText).closest('[role="tab"]');
  if (!tab) throw new Error(`Tab not found: ${tabText}`);
  fireEvent.click(tab);
}

async function findDialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error('Dialog not open yet');
    return dialog;
  });
}

function dialogButton(dialog: HTMLElement, label: string): HTMLButtonElement {
  const btn = within(dialog).getByText(label).closest('button');
  if (!btn) throw new Error(`Dialog button not found: ${label}`);
  return btn;
}

async function pickSelectOption(selectTrigger: HTMLElement, optionLabel: string) {
  fireEvent.mouseDown(selectTrigger);
  const option = await screen.findByText(optionLabel, {
    selector: '.ant-select-item-option-content',
  });
  fireEvent.click(option);
}

beforeAll(installDomStubs);

afterEach(() => {
  cleanup();
  mockUser = INVENTORY_STAFF;
  mockCreateBatch.mockReset().mockResolvedValue({});
  mockRegisterBottle.mockReset().mockResolvedValue({});
  mockRemoveBottle.mockReset().mockResolvedValue({});
  mockAdjustInventory.mockReset().mockResolvedValue({});
  mockUseBottlesSpy.mockClear();
  mockUseBottleHistorySpy.mockClear();
  vi.clearAllMocks();
});

describe('ShipmentsPage — Quản lý lô thủ công & Vòng đời chai (FR-INV-01, 02, 15, 16, 17)', () => {
  it('Inventory Staff tạo lô nước hoa thủ công (FR-INV-01), sản phẩm lọc theo thương hiệu', async () => {
    renderScreen(<ShipmentsPage />);
    switchTab('Lô hàng & Giấy tờ');

    fireEvent.click(buttonAt('Tạo lô thủ công'));
    const dialog = await findDialog();

    await pickSelectOption(comboboxAt(dialog, 0), 'Maison Aurore');

    await waitFor(() => expect((comboboxAt(dialog, 1) as HTMLInputElement).disabled).toBe(false));
    fireEvent.mouseDown(comboboxAt(dialog, 1));
    expect(
      await screen.findByText('Rose Éternelle', { selector: '.ant-select-item-option-content' }),
    ).toBeTruthy();
    expect(
      screen.queryByText('Oud Nocturne', { selector: '.ant-select-item-option-content' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByText('Rose Éternelle', { selector: '.ant-select-item-option-content' }),
    );

    fireEvent.change(within(dialog).getByLabelText(/Số hiệu lô/), {
      target: { value: 'BATCH-MANUAL-01' },
    });
    fireEvent.change(within(dialog).getByLabelText(/SL thực nhận/), {
      target: { value: '12' },
    });

    fireEvent.click(dialogButton(dialog, 'Tạo lô'));

    await waitFor(() =>
      expect(mockCreateBatch).toHaveBeenCalledWith({
        brandId: BRAND_1_ID,
        fragranceProductId: PRD_1_ID,
        batchNumber: 'BATCH-MANUAL-01',
        quantityReceived: 12,
        receivedAt: expect.any(String),
      }),
    );
    await waitFor(() => expect(message.success).toHaveBeenCalled());
  });

  it('Brand Admin không thấy nút Tạo lô thủ công và các nút thao tác kho ở tab Quản lý chai', async () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<ShipmentsPage />);

    switchTab('Lô hàng & Giấy tờ');
    expect(buttonsNamed('Tạo lô thủ công')).toHaveLength(0);

    switchTab('Quản lý chai');
    expect(await screen.findByText('BTL-001')).toBeTruthy();
    expect(buttonsNamed('Đăng ký chai')).toHaveLength(0);
    expect(buttonsNamed('Điều chỉnh tồn kho')).toHaveLength(0);
    expect(buttonsNamed('Tháo về kho')).toHaveLength(0);
    expect(buttonsNamed('Lịch sử').length).toBeGreaterThan(0);
  });

  it('Tab Quản lý chai hiển thị tên sản phẩm/lô/slot không rò UUID và lọc theo trạng thái', async () => {
    renderScreen(<ShipmentsPage />);
    switchTab('Quản lý chai');

    expect(await screen.findByText('BTL-001')).toBeTruthy();
    expect(screen.getByText('BTL-002')).toBeTruthy();
    expect(screen.getByText('Kiosk Vincom · Slot #2')).toBeTruthy();
    expect(screen.getAllByText('Trong kho').length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toContain(BRAND_1_ID);
    expect(document.body.textContent).not.toContain(SLOT_2_ID);

    await pickSelectOption(comboboxAt(null, 0), 'Đang lắp');

    await waitFor(() =>
      expect(mockUseBottlesSpy).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        status: 'INSTALLED',
        batchId: undefined,
      }),
    );
    expect(screen.queryByText('BTL-001')).toBeNull();
    expect(screen.getByText('BTL-002')).toBeTruthy();

    fireEvent.click(buttonAt('Bỏ lọc'));
    await waitFor(() =>
      expect(mockUseBottlesSpy).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        status: undefined,
        batchId: undefined,
      }),
    );
  });

  it('Inventory Staff đăng ký chai mới từ lô đã có (FR-INV-02)', async () => {
    renderScreen(<ShipmentsPage />);
    switchTab('Quản lý chai');

    fireEvent.click(buttonAt('Đăng ký chai'));
    const dialog = await findDialog();

    const batchSelect = within(dialog).getByRole('combobox');
    await pickSelectOption(batchSelect, 'BATCH-2026-01 — Rose Éternelle');

    fireEvent.change(within(dialog).getByLabelText(/Mã định danh chai/), {
      target: { value: 'BTL-NEW-99' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Dung tích ban đầu/), {
      target: { value: '100' },
    });

    fireEvent.click(dialogButton(dialog, 'OK'));

    await waitFor(() =>
      expect(mockRegisterBottle).toHaveBeenCalledWith({
        batchId: BATCH_1_ID,
        identifier: 'BTL-NEW-99',
        initialVolumeMl: 100,
      }),
    );
    await waitFor(() => expect(message.success).toHaveBeenCalled());
  });

  it('Inventory Staff tháo chai đang gắn khỏi slot về kho (FR-INV-15)', async () => {
    renderScreen(<ShipmentsPage />);
    switchTab('Quản lý chai');
    expect(await screen.findByText('BTL-002')).toBeTruthy();

    expect(buttonsNamed('Tháo về kho')).toHaveLength(1);
    fireEvent.click(buttonAt('Tháo về kho'));

    const dialog = await findDialog();
    expect(within(dialog).getByText(/Lượng nước hoa còn lại \(45 ml\)/)).toBeTruthy();
    expect(within(dialog).getByText(/Phiếu trả hàng/)).toBeTruthy();

    fireEvent.change(within(dialog).getByPlaceholderText(/Lý do hoặc tình trạng/), {
      target: { value: 'Tháo để bảo trì vòi' },
    });
    fireEvent.click(dialogButton(dialog, 'OK'));

    await waitFor(() =>
      expect(mockRemoveBottle).toHaveBeenCalledWith({
        slotId: SLOT_2_ID,
        notes: 'Tháo để bảo trì vòi',
      }),
    );
    await waitFor(() => expect(message.success).toHaveBeenCalled());
  });

  it('Inventory Staff điều chỉnh tồn kho kèm lý do bắt buộc & reauth, bỏ qua ReauthCancelled (FR-INV-16)', async () => {
    renderScreen(<ShipmentsPage />);
    switchTab('Quản lý chai');
    expect(await screen.findByText('BTL-001')).toBeTruthy();

    fireEvent.click(buttonAt('Điều chỉnh tồn kho'));

    const dialog = await findDialog();
    expect(within(dialog).getByText(/yêu cầu nhập lại mật khẩu/)).toBeTruthy();

    fireEvent.click(dialogButton(dialog, 'OK'));
    expect(await within(dialog).findByText('Bắt buộc nhập lý do điều chỉnh tồn kho')).toBeTruthy();
    expect(mockAdjustInventory).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/Số lượng thực tế mới/), {
      target: { value: '80' },
    });
    expect(await within(dialog).findByText('Chênh lệch dự kiến: -20 ml')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/Lý do điều chỉnh/), {
      target: { value: 'Kiểm kê thực tế' },
    });

    mockAdjustInventory.mockRejectedValueOnce(new ReauthCancelled());
    fireEvent.click(dialogButton(dialog, 'OK'));

    await waitFor(() => expect(mockAdjustInventory).toHaveBeenCalledTimes(1));
    expect(message.error).not.toHaveBeenCalled();

    mockAdjustInventory.mockResolvedValueOnce({});
    fireEvent.click(dialogButton(dialog, 'OK'));

    await waitFor(() =>
      expect(mockAdjustInventory).toHaveBeenLastCalledWith({
        bottleId: BOTTLE_STOCK_ID,
        afterQuantityMl: 80,
        reason: 'Kiểm kê thực tế',
      }),
    );
    await waitFor(() => expect(message.success).toHaveBeenCalled());
  });

  it('Mở Drawer lịch sử vòng đời chai hiển thị timeline hành động, diễn giải ml và lý do (FR-INV-17)', async () => {
    renderScreen(<ShipmentsPage />);
    switchTab('Quản lý chai');
    expect(await screen.findByText('BTL-002')).toBeTruthy();

    fireEvent.click(buttonAt('Lịch sử', 1));

    await waitFor(() =>
      expect(mockUseBottleHistorySpy).toHaveBeenCalledWith({
        bottleId: BOTTLE_INSTALLED_ID,
        page: 1,
        pageSize: 20,
      }),
    );

    const drawer = await findDialog();
    expect(await within(drawer).findByText('Lịch sử chai BTL-002')).toBeTruthy();
    expect(within(drawer).getByText('Điều chỉnh tồn kho')).toBeTruthy();
    expect(within(drawer).getByText('Lắp chai lên slot')).toBeTruthy();
    expect(within(drawer).getByText('Dung tích: 50 ml → 45 ml')).toBeTruthy();
    expect(within(drawer).getByText('Lý do: Kiểm kê cuối ngày')).toBeTruthy();
  });
});

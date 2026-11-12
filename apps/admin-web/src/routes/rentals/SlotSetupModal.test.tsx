import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InventoryBatch, ShipmentDeclaration } from '@/routes/shipments/api';
import { installDomStubs, renderScreen } from '@/test-utils';
import type { Product, SlotRental } from './api';
import { SlotSetupModal } from './SlotSetupModal';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mockNavigate,
}));

const product = (id: string, name: string, extra: Partial<Product> = {}): Product => ({
  id,
  brandId: 'b-1',
  sku: `SKU-${id}`,
  name,
  defaultPrice: '30000.0000',
  currency: 'VND',
  status: 'ACTIVE',
  ...extra,
});

let mockProducts: Product[] = [];
let mockShipments: Partial<ShipmentDeclaration>[] = [];
let mockBatches: Partial<InventoryBatch>[] = [];
const mockAssign = vi.fn().mockResolvedValue({});
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useBrandProducts: () => ({ data: { items: mockProducts }, isLoading: false }),
  useAssignProduct: () => ({ mutateAsync: mockAssign, isPending: false }),
}));
vi.mock('@/routes/shipments/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/routes/shipments/api')>()),
  useShipmentDeclarations: () => ({ data: { items: mockShipments } }),
  useInventoryBatches: () => ({ data: { items: mockBatches } }),
}));

const baseRental: SlotRental = {
  id: 'r-1',
  slotId: 's-1',
  brandId: 'b-1',
  status: 'DRAFT',
  stage: 'AWAITING_STOCK',
  startsAt: '2026-11-11T00:00:00Z',
  endsAt: '2027-02-11T00:00:00Z',
  currency: 'VND',
  fragranceProductId: null,
  pricePerSpray: null,
};

beforeAll(installDomStubs);

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
  mockAssign.mockClear();
  mockProducts = [];
  mockShipments = [];
  mockBatches = [];
});

function renderModal(
  rental: SlotRental = baseRental,
  extra: { onClose?: () => void; initialProductId?: string } = {},
) {
  renderScreen(
    <SlotSetupModal
      open
      rental={rental}
      slotLabel="Máy Landmark 81 #1 · Slot #1"
      locationName="Vincom Landmark 81"
      onClose={extra.onClose ?? vi.fn()}
      initialProductId={extra.initialProductId}
    />,
  );
  return screen.findByRole('dialog');
}

/** Đường dẫn mà nút đã điều hướng tới, tách thành pathname + tham số để so cho dễ. */
function navigatedTo(): URL {
  return new URL(mockNavigate.mock.calls.at(-1)![0] as string, 'http://x');
}

describe('SlotSetupModal — cấu hình slot (FR-SLT-27, ADR-0023)', () => {
  it('chưa có sản phẩm: giải thích, nút Tạo sản phẩm dẫn sang trang Sản phẩm kèm đường quay lại', async () => {
    const dialog = await renderModal();
    expect(within(dialog).getByText(/chưa có sản phẩm nào/)).toBeTruthy();
    fireEvent.click(within(dialog).getAllByText('Tạo sản phẩm').at(-1)!);
    const url = navigatedTo();
    expect(url.pathname).toBe('/products');
    expect(url.searchParams.get('new')).toBe('1');
    expect(url.searchParams.get('returnTo')).toBe('/?configure=r-1');
  });

  it('nút Tạo sản phẩm luôn có trong khối sản phẩm, kể cả khi đã có sản phẩm', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale')];
    const dialog = await renderModal();
    fireEvent.click(within(dialog).getByText('Tạo sản phẩm'));
    expect(navigatedTo().pathname).toBe('/products');
  });

  it('giá đi theo sản phẩm: hiện giá của sản phẩm đã chọn, không có ô nhập giá', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale', { defaultPrice: '25000.0000' })];
    const dialog = await renderModal({ ...baseRental, fragranceProductId: 'p-1' });
    expect(within(dialog).getByText('Giá mỗi lượt xịt: 25.000 VND')).toBeTruthy();
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    // Chưa đổi gì thì không có gì để lưu.
    expect(within(dialog).getByText('Lưu cấu hình').closest('button')!.disabled).toBe(true);
  });

  it('sản phẩm vừa tạo được chọn sẵn; Lưu chỉ gọi API gán sản phẩm', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale'), product('p-new', 'Aurore Soir')];
    const onClose = vi.fn();
    const dialog = await renderModal(
      { ...baseRental, fragranceProductId: 'p-1' },
      { onClose, initialProductId: 'p-new' },
    );
    expect(within(dialog).getByText('Aurore Soir')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Lưu cấu hình'));
    await waitFor(() =>
      expect(mockAssign).toHaveBeenCalledWith({ rentalId: 'r-1', fragranceProductId: 'p-new' }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('chưa khai báo gửi hàng: bước Gửi hàng có nút khai báo, chọn sẵn sản phẩm và quay lại slot', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale')];
    const dialog = await renderModal({ ...baseRental, fragranceProductId: 'p-1' });
    fireEvent.click(within(dialog).getByText('Khai báo gửi hàng'));
    const url = navigatedTo();
    expect(url.pathname).toBe('/shipments');
    expect(url.searchParams.get('declare')).toBe('1');
    expect(url.searchParams.get('product')).toBe('p-1');
    expect(url.searchParams.get('returnTo')).toBe('/?configure=r-1');
  });

  it('đã khai báo thì chờ kho; kho nhận rồi mà lô chưa có giấy tờ thì có nút nộp giấy tờ', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale')];
    mockShipments = [{ id: 'd-1', fragranceProductId: 'p-1', status: 'DECLARED' }];
    const first = await renderModal({ ...baseRental, fragranceProductId: 'p-1' });
    const declaredNote = within(first).getByText('Đã khai báo, chờ kho nhận hàng.');
    // Thương hiệu đã làm xong phần mình ở bước Gửi hàng: bước được đánh dấu xong, không còn đang làm.
    expect(declaredNote.closest('.ant-steps-item')?.className).toContain('ant-steps-item-finish');
    cleanup();

    mockShipments = [{ id: 'd-1', fragranceProductId: 'p-1', status: 'RECEIVED' }];
    mockBatches = [{ id: 'b-1', fragranceProductId: 'p-1', authenticityStatus: 'NOT_SUBMITTED' }];
    const dialog = await renderModal({ ...baseRental, fragranceProductId: 'p-1' });
    expect(within(dialog).getByText('Kho đã nhận hàng.')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Nộp giấy tờ'));
    const url = navigatedTo();
    expect(url.pathname).toBe('/shipments');
    expect(url.searchParams.get('tab')).toBe('batches');
  });

  it('giấy tờ đã duyệt thì chỉ còn chờ nhân viên lắp chai', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale')];
    mockShipments = [{ id: 'd-1', fragranceProductId: 'p-1', status: 'RECEIVED' }];
    mockBatches = [{ id: 'b-1', fragranceProductId: 'p-1', authenticityStatus: 'APPROVED' }];
    const dialog = await renderModal({ ...baseRental, fragranceProductId: 'p-1' });
    expect(within(dialog).getByText('Giấy tờ đã được duyệt.')).toBeTruthy();
    expect(within(dialog).getByText(/Nhân viên nền tảng lắp chai/)).toBeTruthy();
  });
});

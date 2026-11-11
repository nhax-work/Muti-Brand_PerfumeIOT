import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
const mockAssign = vi.fn().mockResolvedValue({});
const mockSetPrice = vi.fn().mockResolvedValue({});
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useBrandProducts: () => ({ data: { items: mockProducts }, isLoading: false }),
  useAssignProduct: () => ({ mutateAsync: mockAssign, isPending: false }),
  useSetPricePerSpray: () => ({ mutateAsync: mockSetPrice, isPending: false }),
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
  mockSetPrice.mockClear();
  mockProducts = [];
});

function renderModal(rental: SlotRental = baseRental, onClose = vi.fn()) {
  renderScreen(
    <SlotSetupModal
      open
      rental={rental}
      slotLabel="Máy Landmark 81 #1 · Slot #1"
      locationName="Vincom Landmark 81"
      onClose={onClose}
    />,
  );
  return screen.findByRole('dialog');
}

describe('SlotSetupModal — cấu hình slot (FR-SLT-27, FR-SLT-08)', () => {
  it('thương hiệu chưa có sản phẩm: giải thích và dẫn sang tạo sản phẩm, không để Select rỗng', async () => {
    const dialog = await renderModal();
    expect(within(dialog).getByText(/chưa có sản phẩm nào/)).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Tạo sản phẩm'));
    expect(mockNavigate).toHaveBeenCalledWith('/products?new=1');
    expect(within(dialog).getByText('Lưu cấu hình').closest('button')!.disabled).toBe(true);
  });

  it('hiện thanh bước theo dữ liệu máy chủ và câu cho biết slot còn thiếu gì', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale')];
    const dialog = await renderModal();
    expect(within(dialog).getByText('Chọn sản phẩm')).toBeTruthy();
    expect(within(dialog).getByText('Đặt giá')).toBeTruthy();
    expect(within(dialog).getByText('Nhân viên nền tảng sẽ lắp chai')).toBeTruthy();
    expect(within(dialog).getByText(/Kiosk chỉ bán slot đã có đủ/)).toBeTruthy();
  });

  it('điền sẵn sản phẩm và giá đang dùng; chỉ đổi giá thì chỉ gọi API đặt giá', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale')];
    const onClose = vi.fn();
    const dialog = await renderModal(
      { ...baseRental, fragranceProductId: 'p-1', pricePerSpray: '35000.0000' },
      onClose,
    );
    expect(within(dialog).getByText('Aurore Matinale')).toBeTruthy();
    const price = within(dialog).getByRole('spinbutton');
    expect((price as HTMLInputElement).value).toBe('35.000');

    fireEvent.change(price, { target: { value: '40000' } });
    fireEvent.click(within(dialog).getByText('Lưu cấu hình'));

    await waitFor(() =>
      expect(mockSetPrice).toHaveBeenCalledWith({ rentalId: 'r-1', pricePerSpray: '40000' }),
    );
    expect(mockAssign).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('gợi ý giá mặc định của sản phẩm và điền vào ô giá khi bấm Dùng giá gợi ý', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale', { defaultPrice: '25000.0000' })];
    const dialog = await renderModal({ ...baseRental, fragranceProductId: 'p-1' });
    expect(within(dialog).getByText(/Giá gợi ý của sản phẩm: 25\.000 VND/)).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Dùng giá gợi ý'));
    await waitFor(() =>
      expect((within(dialog).getByRole('spinbutton') as HTMLInputElement).value).toBe('25.000'),
    );
  });

  it('không lưu khi chưa chọn sản phẩm', async () => {
    mockProducts = [product('p-1', 'Aurore Matinale')];
    const dialog = await renderModal();
    fireEvent.click(within(dialog).getByText('Lưu cấu hình'));
    await waitFor(() => expect(within(dialog).getAllByText('Bắt buộc nhập').length).toBe(2));
    expect(mockAssign).not.toHaveBeenCalled();
    expect(mockSetPrice).not.toHaveBeenCalled();
  });
});

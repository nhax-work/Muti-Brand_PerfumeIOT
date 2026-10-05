import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKioskCatalog } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import CheckoutScreen from './CheckoutScreen';

const mockNavigate = vi.fn();
let mockParams = { slotNumber: '1' };

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    useKioskCatalog: vi.fn(),
  };
});

const mockCatalogData = {
  machineSerial: 'SS-HCM-001',
  machineStatus: 'ONLINE' as const,
  operatingMode: 'NORMAL' as const,
  items: [
    {
      slotId: 'slot-1',
      slotNumber: 1,
      available: true,
      brandName: 'Chanel',
      product: {
        id: 'prod-1',
        name: 'Chanel No 5',
        description: 'Hương thơm quyến rũ vượt thời gian',
        imageUrl: 'https://example.com/no5.png',
      },
      pricePerSpray: '35000',
      currency: 'VND' as const,
    },
  ],
};

function renderCheckout() {
  return render(
    <I18nProvider>
      <CheckoutScreen />
    </I18nProvider>,
  );
}

describe('CheckoutScreen Payment Flow (Stitch Screens 4, 5, 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { slotNumber: '1' };
    vi.mocked(useKioskCatalog).mockReturnValue({
      data: mockCatalogData,
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useKioskCatalog>);
  });

  afterEach(() => {
    cleanup();
  });

  it('mặc định hiển thị popup chọn phương thức thanh toán với thông tin sản phẩm', () => {
    renderCheckout();

    expect(screen.getByText(/CHỌN PHƯƠNG THỨC THANH TOÁN/i)).toBeTruthy();
    expect(screen.getByText('Chanel No 5')).toBeTruthy();
    expect(screen.getByText(/35\.000 VND/i)).toBeTruthy();
    expect(screen.getByText(/Thẻ Visa \/ Mastercard \/ Thẻ Quốc Tế/i)).toBeTruthy();
    expect(screen.getByText(/Quét Mã QR/i)).toBeTruthy();
  });

  it('chọn VietQR và bấm tiếp tục hiển thị màn hình quét mã QR', () => {
    renderCheckout();

    const qrRadio = screen.getByDisplayValue('qr');
    fireEvent.click(qrRadio);

    const proceedBtn = screen.getByRole('button', { name: /Tiếp tục thanh toán/i });
    fireEvent.click(proceedBtn);

    expect(screen.getByText(/QUÉT MÃ QR ĐỂ THANH TOÁN/i)).toBeTruthy();
    expect(screen.getByText(/Thời gian hiệu lực/i)).toBeTruthy();
    expect(screen.getAllByText(/VIETQR/i).length).toBeGreaterThan(0);
  });

  it('chọn POS/NFC và bấm tiếp tục hiển thị màn hình chạm thẻ và 3 bước hướng dẫn', () => {
    renderCheckout();

    const cardRadio = screen.getByDisplayValue('card');
    fireEvent.click(cardRadio);

    const proceedBtn = screen.getByRole('button', { name: /Tiếp tục thanh toán/i });
    fireEvent.click(proceedBtn);

    expect(screen.getByText(/THANH TOÁN THẺ QUỐC TẾ \/ NFC/i)).toBeTruthy();
    expect(screen.getByText(/ĐANG CHỜ CHẠM THẺ HOẶC CẮM CHIP/i)).toBeTruthy();
    expect(screen.getByText('Chạm thẻ')).toBeTruthy();
    expect(screen.getByText(/Nhập mã PIN/i)).toBeTruthy();
  });

  it('bấm hủy giao dịch chuyển hướng về /catalog', () => {
    renderCheckout();

    const cancelBtn = screen.getByRole('button', { name: /Quay lại danh mục/i });
    fireEvent.click(cancelBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/catalog');
  });
});

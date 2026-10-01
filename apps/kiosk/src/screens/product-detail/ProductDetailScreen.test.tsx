import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKioskCatalog } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import ProductDetailScreen from './ProductDetailScreen';

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
        fragranceNotes: {
          top: ['Aldehydes', 'Ylang-Ylang'],
          heart: ['Rose', 'Jasmine'],
          base: ['Vanilla', 'Sandalwood'],
        },
      },
      pricePerSpray: '35000',
      currency: 'VND' as const,
    },
    {
      slotId: 'slot-3',
      slotNumber: 3,
      available: false,
      brandName: null,
      product: null,
      pricePerSpray: null,
      currency: 'VND' as const,
    },
  ],
};

function renderDetail() {
  return render(
    <I18nProvider>
      <ProductDetailScreen />
    </I18nProvider>,
  );
}

describe('ProductDetailScreen (FR-ORD-02)', () => {
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

  it('test_FR_ORD_02_kiosk_display_product_details — hiển thị đầy đủ tên, thương hiệu, mô tả, tầng hương và giá', () => {
    renderDetail();

    // Tên và thương hiệu
    expect(screen.getByText('Chanel')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Chanel No 5' })).toBeTruthy();

    // Vị trí ngăn
    expect(screen.getByText('Ngăn 1')).toBeTruthy();

    // Mô tả
    expect(screen.getByText('Hương thơm quyến rũ vượt thời gian')).toBeTruthy();

    // Giá tiền một lượt xịt
    expect(screen.getByText(/35\.000 VND \/ lượt xịt/i)).toBeTruthy();

    // Tầng hương
    expect(screen.getByText('Các tầng hương')).toBeTruthy();
    expect(screen.getByText('Hương đầu')).toBeTruthy();
    expect(screen.getByText('Aldehydes')).toBeTruthy();
    expect(screen.getByText('Ylang-Ylang')).toBeTruthy();
    expect(screen.getByText('Hương giữa')).toBeTruthy();
    expect(screen.getByText('Rose')).toBeTruthy();
    expect(screen.getByText('Jasmine')).toBeTruthy();
    expect(screen.getByText('Hương cuối')).toBeTruthy();
    expect(screen.getByText('Vanilla')).toBeTruthy();
    expect(screen.getByText('Sandalwood')).toBeTruthy();

    // Nút xịt thử
    expect(screen.getByRole('button', { name: /Trải nghiệm xịt ngay/i })).toBeTruthy();
  });

  it('bấm nút quay lại danh mục điều hướng sang /catalog', () => {
    renderDetail();

    const backBtn = screen.getByRole('button', { name: /Quay lại danh mục/i });
    fireEvent.click(backBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/catalog');
  });

  it('bấm nút trải nghiệm xịt ngay điều hướng sang checkout của slot đó', () => {
    renderDetail();

    const sprayBtn = screen.getByRole('button', { name: /Trải nghiệm xịt ngay/i });
    fireEvent.click(sprayBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/checkout/1');
  });

  it('khi slot không tồn tại hoặc không khả dụng thì hiện thông báo không tìm thấy', () => {
    mockParams = { slotNumber: '3' }; // slot 3 available = false
    renderDetail();

    expect(screen.getByText('Không tìm thấy sản phẩm')).toBeTruthy();
    expect(screen.getByText('Mùi hương này hiện tạm thời không khả dụng')).toBeTruthy();
  });
});

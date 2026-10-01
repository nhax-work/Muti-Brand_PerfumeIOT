import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordKioskInteraction, useKioskCatalog } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import { KioskSessionProvider } from '@/shared/session';
import CatalogScreen from './CatalogScreen';

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    useKioskCatalog: vi.fn(),
    recordKioskInteraction: vi.fn(),
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
      slotId: 'slot-2',
      slotNumber: 2,
      available: true,
      brandName: 'Dior',
      product: {
        id: 'prod-2',
        name: 'Sauvage',
        description: 'Mạnh mẽ và tươi mát',
        imageUrl: 'https://example.com/sauvage.png',
        fragranceNotes: {
          top: ['Bergamot', 'Pepper'],
          heart: ['Lavender', 'Sichuan Pepper'],
          base: ['Ambroxan', 'Cedar'],
        },
      },
      pricePerSpray: '40000',
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

function renderCatalog() {
  return render(
    <I18nProvider>
      <KioskSessionProvider>
        <CatalogScreen />
      </KioskSessionProvider>
    </I18nProvider>,
  );
}

describe('CatalogScreen (FR-ORD-01, FR-ORD-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('test_FR_ORD_01_kiosk_display_available_products — hiển thị sản phẩm khả dụng kèm thương hiệu và làm mờ slot hết hàng', () => {
    renderCatalog();

    // Slot 1 & 2 hiển thị
    expect(screen.getByRole('heading', { level: 2, name: 'Chanel' })).toBeTruthy();
    expect(screen.getByText('Chanel No 5')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Dior' })).toBeTruthy();
    expect(screen.getByText('Sauvage')).toBeTruthy();

    // Slot 3 không khả dụng hiển thị "Tạm hết"
    const outOfStockBadges = screen.getAllByText('Tạm hết');
    expect(outOfStockBadges.length).toBeGreaterThan(0);
  });

  it('test_FR_ORD_01_unavailable_slot_cannot_be_selected — slot không khả dụng không chuyển trang khi bấm', () => {
    renderCatalog();

    const unavailableCards = screen.getAllByRole('button', { hidden: true }).filter((el) => {
      return el.getAttribute('aria-disabled') === 'true';
    });

    const target = unavailableCards[0];
    expect(target).toBeDefined();
    fireEvent.click(target!);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('test_FR_ORD_03_kiosk_filter_by_brand — lọc danh mục theo thương hiệu và trở lại Tất cả', () => {
    renderCatalog();

    // Ban đầu thấy cả hai sản phẩm
    expect(screen.getByText('Chanel No 5')).toBeTruthy();
    expect(screen.getByText('Sauvage')).toBeTruthy();

    // Bấm vào chip lọc "Chanel"
    const chanelChip = screen.getByRole('button', { name: 'Chanel' });
    fireEvent.click(chanelChip);

    // Chỉ còn Chanel No 5, không còn Sauvage
    expect(screen.getByText('Chanel No 5')).toBeTruthy();
    expect(screen.queryByText('Sauvage')).toBeNull();

    // Bấm vào chip "Tất cả"
    const allChip = screen.getByRole('button', { name: 'Tất cả' });
    fireEvent.click(allChip);

    // Cả hai sản phẩm xuất hiện trở lại
    expect(screen.getByText('Chanel No 5')).toBeTruthy();
    expect(screen.getByText('Sauvage')).toBeTruthy();
  });

  it('test_FR_RPT_06_record_interactions — ghi nhận impression và chuyển hướng khi chọn sản phẩm khả dụng', () => {
    renderCatalog();

    // Kiểm tra impression được ghi cho các slot khả dụng
    expect(recordKioskInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PRODUCT_IMPRESSION',
        slotId: 'slot-1',
      }),
    );
    expect(recordKioskInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PRODUCT_IMPRESSION',
        slotId: 'slot-2',
      }),
    );

    // Bấm vào thẻ sản phẩm slot 1
    const chanelCard = screen.getByText('Chanel No 5').closest('article');
    expect(chanelCard).not.toBeNull();
    fireEvent.click(chanelCard!);

    // Ghi nhận PRODUCT_SELECTED và điều hướng sang /products/1
    expect(recordKioskInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PRODUCT_SELECTED',
        slotId: 'slot-1',
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/products/1');
  });

  it('bấm nút Quay về trang chủ điều hướng sang /', () => {
    renderCatalog();

    const homeBtn = screen.getByRole('button', { name: /Trang chủ/i });
    fireEvent.click(homeBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKioskCatalog } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import AttractScreen from './AttractScreen';

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({ useNavigate: () => mockNavigate }));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, useKioskCatalog: vi.fn() };
});

const item = (slotNumber: number, available: boolean, imageUrl: string | null) => ({
  slotId: `slot-${slotNumber}`,
  slotNumber,
  available,
  brandName: available ? 'Maison' : null,
  product: available
    ? { id: `p${slotNumber}`, name: `Hương ${slotNumber}`, description: null, imageUrl }
    : null,
  pricePerSpray: available ? '35000' : null,
  currency: 'VND',
});

describe('AttractScreen — màn chờ (NFR-USA-02)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('chỉ chiếu ảnh thật của sản phẩm đang bán; chạm bất kỳ đâu thì vào danh mục', () => {
    vi.mocked(useKioskCatalog).mockReturnValue({
      data: {
        machineSerial: 'M001',
        machineStatus: 'ONLINE',
        operatingMode: 'NORMAL',
        items: [
          item(2, true, 'https://example.com/b.png'),
          item(1, true, 'https://example.com/a.png'),
          item(3, false, null),
          item(4, true, null),
        ],
      },
    } as unknown as ReturnType<typeof useKioskCatalog>);
    const { container } = render(
      <I18nProvider>
        <AttractScreen />
      </I18nProvider>,
    );

    const images = Array.from(container.querySelectorAll('img')).map((i) => i.src);
    expect(images).toEqual(['https://example.com/a.png', 'https://example.com/b.png']);

    fireEvent.click(screen.getByRole('button', { name: /Chạm để bắt đầu/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/catalog');
  });
});

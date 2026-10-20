import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import ProductsPage from './ProductsPage';

let mockUser: { id: string; brandId: string | null; roles: string[] } = {
  id: 'u-1',
  brandId: 'b-1',
  roles: ['BRAND_ADMIN'],
};
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));
vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockSave = vi.fn().mockResolvedValue({});
const mockDiscontinue = vi.fn().mockResolvedValue({});
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useProducts: () => ({
    data: {
      items: [
        {
          id: 'p-1',
          brandId: 'b-1',
          sku: 'MA-001',
          name: 'Aurore Matinale',
          defaultPrice: '35000.0000',
          currency: 'VND',
          fullBottleRetailPrice: '2400000.0000',
          fullBottleVolumeMl: 50,
          status: 'ACTIVE',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    },
    isLoading: false,
  }),
  useSaveProduct: () => ({ mutateAsync: mockSave, isPending: false }),
  useDiscontinueProduct: () => ({ mutateAsync: mockDiscontinue, isPending: false }),
}));

beforeAll(() => {
  installDomStubs();
  const dummyMessage = Object.assign(Promise.resolve(true), () => {}) as any;
  vi.spyOn(message, 'success').mockReturnValue(dummyMessage);
  vi.spyOn(message, 'error').mockReturnValue(dummyMessage);
});

afterEach(() => {
  cleanup();
  message.destroy();
  mockSave.mockClear();
  mockUser = { id: 'u-1', brandId: 'b-1', roles: ['BRAND_ADMIN'] };
});

describe('ProductsPage (FR-PRD-01 ÷ 03)', () => {
  it('Brand Admin tạo sản phẩm — giá gửi dạng chuỗi tiền (NFR-DAT-02)', async () => {
    renderScreen(<ProductsPage />);
    fireEvent.click(screen.getByText('Thêm sản phẩm'));
    const dialog = await screen.findByRole('dialog');
    const [sku, name] = within(dialog).getAllByRole('textbox');
    fireEvent.change(sku!, { target: { value: 'MA-003' } });
    fireEvent.change(name!, { target: { value: 'Aurore Soir' } });
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0]!, { target: { value: '40000' } });
    fireEvent.click(within(dialog).getByText('Lưu thay đổi'));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        id: undefined,
        body: expect.objectContaining({
          sku: 'MA-003',
          name: 'Aurore Soir',
          defaultPrice: '40000',
          currency: 'VND',
        }),
      }),
    );
  });

  it('sửa thì không đổi được SKU', async () => {
    renderScreen(<ProductsPage />);
    fireEvent.click(screen.getByText('Sửa'));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getAllByRole('textbox')[0] as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByText('Hủy'));
  });

  it('Super Admin chỉ xem — không có nút thêm, sửa, ngừng kinh doanh', () => {
    mockUser = { id: 'sa', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] };
    renderScreen(<ProductsPage />);
    expect(screen.getByText('Aurore Matinale')).toBeTruthy();
    expect(screen.queryByText('Thêm sản phẩm')).toBeNull();
    expect(screen.queryByText('Sửa')).toBeNull();
  });
});

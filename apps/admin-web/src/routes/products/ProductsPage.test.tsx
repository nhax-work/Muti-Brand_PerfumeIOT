import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
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
const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockSave = vi.fn().mockResolvedValue({ id: 'p-new', imageUrl: null });
const mockUpload = vi.fn().mockResolvedValue({});
const mockDeleteImage = vi.fn().mockResolvedValue({});
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
          fullBottleVolumeMl: 500,
          imageUrl: 'https://pub-test.r2.dev/products/p-1-abc.webp',
          status: 'ACTIVE',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    },
    isLoading: false,
  }),
  useSaveProduct: () => ({ mutateAsync: mockSave, isPending: false }),
  useDiscontinueProduct: () => ({ mutateAsync: mockDiscontinue, isPending: false }),
  useUploadProductImage: () => ({ mutateAsync: mockUpload, isPending: false }),
  useDeleteProductImage: () => ({ mutateAsync: mockDeleteImage, isPending: false }),
}));

beforeAll(() => {
  installDomStubs();
  // jsdom không có URL.createObjectURL — ô xem trước ảnh cần nó.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  // Mock message tĩnh để antd không dựng root React riêng cho hộp thông báo. Root đó không bao giờ
  // unmount và cập nhật trễ qua Promise: khi runner CI chậm, nhịp render rơi sau lúc jsdom bị gỡ
  // → "window is not defined" ngoài test, vitest báo unhandled error và thoát mã 1.
  // Vì thế cũng KHÔNG gọi message.destroy() — chính lời gọi đó dựng root kia.
  const dummyMessage = Object.assign(Promise.resolve(true), () => {}) as unknown as ReturnType<
    typeof message.success
  >;
  vi.spyOn(message, 'success').mockReturnValue(dummyMessage);
  vi.spyOn(message, 'error').mockReturnValue(dummyMessage);
});

afterEach(() => {
  cleanup();
  mockSave.mockClear();
  mockUpload.mockClear();
  mockDeleteImage.mockClear();
  mockUser = { id: 'u-1', brandId: 'b-1', roles: ['BRAND_ADMIN'] };
});

describe('ProductsPage (FR-PRD-01 ÷ 03)', () => {
  it('chặn lưu sản phẩm có dung tích dưới 500 ml', async () => {
    renderScreen(<ProductsPage />);
    fireEvent.click(screen.getByText('Sửa'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Dung tích chai'), { target: { value: '499' } });
    fireEvent.click(within(dialog).getByText('Lưu thay đổi'));
    await waitFor(() =>
      expect(within(dialog).getAllByText('Dung tích sản phẩm phải tối thiểu 500 ml')).toHaveLength(
        2,
      ),
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('Brand Admin tạo sản phẩm — giá gửi dạng chuỗi tiền (NFR-DAT-02)', async () => {
    renderScreen(<ProductsPage />);
    fireEvent.click(screen.getByText('Thêm sản phẩm'));
    const dialog = await screen.findByRole('dialog');
    const [sku, name] = within(dialog).getAllByRole('textbox');
    fireEvent.change(sku!, { target: { value: 'MA-003' } });
    fireEvent.change(name!, { target: { value: 'Aurore Soir' } });
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0]!, { target: { value: '40000' } });
    fireEvent.change(within(dialog).getByLabelText('Dung tích chai'), { target: { value: '500' } });
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

  it('test_FR_PRD_01_new_product_uploads_chosen_image_after_create', async () => {
    renderScreen(<ProductsPage />);
    fireEvent.click(screen.getByText('Thêm sản phẩm'));
    const dialog = await screen.findByRole('dialog');
    const [sku, name] = within(dialog).getAllByRole('textbox');
    fireEvent.change(sku!, { target: { value: 'MA-004' } });
    fireEvent.change(name!, { target: { value: 'Aurore Nuit' } });
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0]!, { target: { value: '45000' } });
    fireEvent.change(within(dialog).getByLabelText('Dung tích chai'), { target: { value: '500' } });
    const file = new File(['x'], 'bottle.jpg', { type: 'image/jpeg' });
    fireEvent.change(within(dialog).getByTestId('product-image-input'), {
      target: { files: [file] },
    });
    expect(within(dialog).getByAltText('Ảnh sản phẩm').getAttribute('src')).toBe('blob:preview');
    fireEvent.click(within(dialog).getByText('Lưu thay đổi'));
    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith({ id: 'p-new', file }));
    // Ảnh không đi kèm thân tạo sản phẩm — chỉ qua endpoint upload.
    expect(mockSave.mock.calls[0]![0].body).not.toHaveProperty('imageUrl');
  });

  it('test_FR_PRD_01_rejects_wrong_type_and_oversized_file_before_upload', async () => {
    renderScreen(<ProductsPage />);
    fireEvent.click(screen.getByText('Thêm sản phẩm'));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByTestId('product-image-input');
    fireEvent.change(input, {
      target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] },
    });
    expect(within(dialog).getByText('Chỉ nhận ảnh JPEG, PNG hoặc WebP')).toBeTruthy();
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(within(dialog).getByText('Ảnh vượt quá 5 MB')).toBeTruthy();
    expect(within(dialog).queryByAltText('Ảnh sản phẩm')).toBeNull();
  });

  it('test_FR_PRD_01_remove_existing_image_calls_delete', async () => {
    mockSave.mockResolvedValueOnce({ id: 'p-1', imageUrl: null });
    renderScreen(<ProductsPage />);
    fireEvent.click(screen.getByText('Sửa'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByAltText('Ảnh sản phẩm').getAttribute('src')).toContain('r2.dev');
    fireEvent.click(within(dialog).getByText('Xóa ảnh'));
    fireEvent.click(within(dialog).getByText('Lưu thay đổi'));
    await waitFor(() => expect(mockDeleteImage).toHaveBeenCalledWith('p-1'));
    expect(mockUpload).not.toHaveBeenCalled();
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

  it('mở từ nút Tạo sản phẩm của modal cấu hình slot (?new=1) thì pop-up tạo sản phẩm mở sẵn', async () => {
    renderAt('/products?new=1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Thêm sản phẩm')).toBeTruthy();
  });

  it('tạo xong thì quay về đúng slot đang cấu hình, chọn sẵn sản phẩm vừa tạo', async () => {
    renderAt(`/products?new=1&returnTo=${encodeURIComponent('/my-slots?configure=r-1')}`);
    expect(screen.getByText('Tạo sản phẩm xong sẽ tự quay lại cấu hình slot.')).toBeTruthy();
    const dialog = await screen.findByRole('dialog');
    const [sku, name] = within(dialog).getAllByRole('textbox');
    fireEvent.change(sku!, { target: { value: 'MA-009' } });
    fireEvent.change(name!, { target: { value: 'Aurore Nuit' } });
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[0]!, { target: { value: '30000' } });
    fireEvent.change(within(dialog).getByLabelText('Dung tích chai'), { target: { value: '500' } });
    fireEvent.click(within(dialog).getByText('Lưu thay đổi'));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/my-slots?configure=r-1&product=p-new'),
    );
  });

  it('bỏ qua returnTo trỏ ra ngoài trang web (chống chuyển hướng mở)', async () => {
    renderAt(`/products?new=1&returnTo=${encodeURIComponent('//evil.example/x')}`);
    await screen.findByRole('dialog');
    expect(screen.queryByText('Quay lại cấu hình slot')).toBeNull();
  });
});

function renderAt(entry: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[entry]}>
          <ProductsPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

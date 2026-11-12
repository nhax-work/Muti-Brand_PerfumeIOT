import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import BrandProfilePage from './BrandProfilePage';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockUpdate = vi.fn().mockResolvedValue({});
const mockUpdateLegal = vi.fn().mockResolvedValue({});
const mockUploadLogo = vi.fn().mockResolvedValue({});
const mockDeleteLogo = vi.fn().mockResolvedValue({});
let mockLogoUrl: string | null = null;
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useMyBrand: () => ({
    data: {
      id: 'b-1',
      code: 'MAISON_AURORE',
      name: 'Maison Aurore',
      logoUrl: mockLogoUrl,
      status: 'ACTIVE',
      contactInfo: { email: 'hello@aurore.vn', website: 'aurore.vn' },
      taxCode: '0123456789',
      businessLicenseNumber: 'GP-123456',
      payoutAccountMasked: {
        bankCode: 'VCB',
        maskedAccountNumber: '****9999',
        accountHolder: 'CONG TY MAISON',
      },
      legalVerifiedAt: null,
      createdAt: '2026-09-14T00:00:00Z',
    },
    isLoading: false,
  }),
  useUpdateMyBrand: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useUpdateMyBrandLegalProfile: () => ({ mutateAsync: mockUpdateLegal, isPending: false }),
  useUploadMyBrandLogo: () => ({ mutateAsync: mockUploadLogo, isPending: false }),
  useDeleteMyBrandLogo: () => ({ mutateAsync: mockDeleteLogo, isPending: false }),
}));

beforeAll(() => {
  installDomStubs();
  // jsdom không có URL.createObjectURL — ô xem trước logo cần nó.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  mockUpdate.mockClear();
  mockUploadLogo.mockClear();
  mockDeleteLogo.mockClear();
  mockLogoUrl = null;
});

describe('BrandProfilePage (FR-BND-06, FR-BND-09)', () => {
  it('mã thương hiệu chỉ đọc; lưu giữ lại khóa liên hệ màn hình không quản lý', async () => {
    renderScreen(<BrandProfilePage />);
    expect(screen.getByText('MAISON_AURORE')).toBeTruthy();
    expect(screen.queryByDisplayValue('MAISON_AURORE')).toBeNull();

    fireEvent.change(await screen.findByDisplayValue('Maison Aurore'), {
      target: { value: 'Maison Aurore Paris' },
    });
    // First 'Lưu thay đổi' button is for profile
    const saveButtons = screen.getAllByText('Lưu thay đổi');
    fireEvent.click(saveButtons[0]!);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Maison Aurore Paris',
          contactInfo: expect.objectContaining({ email: 'hello@aurore.vn', website: 'aurore.vn' }),
        }),
      ),
    );
  });

  it('FR-BND-09: hiển thị tài khoản nhận tiền dạng che và cho phép lưu hồ sơ pháp nhân', async () => {
    renderScreen(<BrandProfilePage />);
    // Masked payout account is displayed
    expect(screen.getByText(/VCB · \*\*\*\*9999/)).toBeTruthy();

    // Tax code is pre-filled
    expect(screen.getByDisplayValue('0123456789')).toBeTruthy();

    // Change tax code
    fireEvent.change(screen.getByDisplayValue('0123456789'), {
      target: { value: '9876543210' },
    });

    // Fill account number because all fields are required
    const accountNumberInput = screen.getByPlaceholderText('Nhập số tài khoản');
    fireEvent.change(accountNumberInput, {
      target: { value: '0071000123456' },
    });

    // Second 'Lưu thay đổi' button is for legal profile
    const saveButtons = screen.getAllByText('Lưu thay đổi');
    fireEvent.click(saveButtons[1]!);

    await waitFor(() =>
      expect(mockUpdateLegal).toHaveBeenCalledWith(
        expect.objectContaining({
          taxCode: '9876543210',
        }),
      ),
    );
  });
});

describe('BrandProfilePage — logo thương hiệu (FR-BND-06, ADR-0022)', () => {
  it('test_FR_BND_06_logo_is_chosen_as_image_not_url_and_uploaded_after_profile_save', async () => {
    renderScreen(<BrandProfilePage />);
    expect(screen.queryByPlaceholderText('https://')).toBeNull();
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('brand-logo-input'), { target: { files: [file] } });
    expect(screen.getByAltText('Logo').getAttribute('src')).toBe('blob:preview');

    fireEvent.click(screen.getAllByText('Lưu thay đổi')[0]!);
    await waitFor(() => expect(mockUploadLogo).toHaveBeenCalledWith(file));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ logoUrl: expect.anything() }),
    );
    expect(mockUpdate.mock.invocationCallOrder[0]!).toBeLessThan(
      mockUploadLogo.mock.invocationCallOrder[0]!,
    );
  });

  it('test_FR_BND_06_logo_rejects_non_image_in_browser', () => {
    renderScreen(<BrandProfilePage />);
    const file = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    fireEvent.change(screen.getByTestId('brand-logo-input'), { target: { files: [file] } });
    expect(screen.getByText('Chỉ nhận ảnh JPEG, PNG hoặc WebP')).toBeTruthy();
  });

  it('test_FR_BND_06_remove_existing_logo_calls_delete', async () => {
    mockLogoUrl = 'https://pub-test.r2.dev/brands/b-1-abc.webp';
    renderScreen(<BrandProfilePage />);
    fireEvent.click(screen.getByText('Xóa ảnh'));
    fireEvent.click(screen.getAllByText('Lưu thay đổi')[0]!);
    await waitFor(() => expect(mockDeleteLogo).toHaveBeenCalled());
    expect(mockUploadLogo).not.toHaveBeenCalled();
  });
});

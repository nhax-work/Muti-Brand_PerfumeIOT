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
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useMyBrand: () => ({
    data: {
      id: 'b-1',
      code: 'MAISON_AURORE',
      name: 'Maison Aurore',
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
}));

beforeAll(installDomStubs);
afterEach(cleanup);

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

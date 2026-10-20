import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import BrandsPage from './BrandsPage';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockSetStatus = vi.fn().mockResolvedValue({});
const mockSave = vi.fn().mockResolvedValue({});
const mockVerifyLegal = vi.fn().mockResolvedValue({});
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useBrands: () => ({
    data: {
      items: [
        {
          id: 'b-1',
          code: 'MAISON_AURORE',
          name: 'Maison Aurore',
          status: 'ACTIVE',
          taxCode: '0123456789',
          businessLicenseNumber: 'GP-999',
          payoutAccountMasked: {
            bankCode: 'VCB',
            maskedAccountNumber: '****8888',
            accountHolder: 'CONG TY MAISON',
          },
          legalVerifiedAt: null,
          contactInfo: { email: 'hello@aurore.vn', phone: '0901234567', website: 'aurore.vn' },
          createdAt: '2026-09-14T00:00:00Z',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    },
    isLoading: false,
  }),
  useSaveBrand: () => ({ mutateAsync: mockSave, isPending: false }),
  useSetBrandStatus: () => ({ mutateAsync: mockSetStatus, isPending: false }),
  useVerifyBrandLegal: () => ({ mutateAsync: mockVerifyLegal, isPending: false }),
}));

beforeAll(installDomStubs);
afterEach(cleanup);

describe('BrandsPage (FR-BND-01 ÷ 03, 07, FR-BND-10)', () => {
  it('đình chỉ thương hiệu đang hoạt động sau khi xác nhận (FR-BND-03, 04)', async () => {
    renderScreen(<BrandsPage />);
    const row = screen.getByText('Maison Aurore').closest('tr')!;
    expect(within(row).getByText('hello@aurore.vn · 0901234567')).toBeTruthy();
    fireEvent.click(within(row).getByText('Đình chỉ'));
    fireEvent.click(await screen.findByText('Xác nhận'));
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith({ id: 'b-1', status: 'SUSPENDED' }),
    );
  });

  it('sửa thương hiệu điền sẵn liên hệ từ contactInfo', async () => {
    renderScreen(<BrandsPage />);
    fireEvent.click(screen.getByText('Sửa'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('hello@aurore.vn')).toBeTruthy();
    expect(within(dialog).getByDisplayValue('MAISON_AURORE')).toBeTruthy();
  });

  it('FR-BND-10: Super Admin mở modal xác minh pháp nhân, thấy tài khoản che và xác nhận', async () => {
    renderScreen(<BrandsPage />);
    fireEvent.click(screen.getByText('Xác minh pháp nhân'));
    const dialog = await screen.findByRole('dialog');
    // Modal shows tax code, license number, and masked payout account
    expect(within(dialog).getByText('0123456789')).toBeTruthy();
    expect(within(dialog).getByText('GP-999')).toBeTruthy();
    expect(within(dialog).getByText(/VCB · \*\*\*\*8888/)).toBeTruthy();

    // Confirm verification button in modal footer
    const confirmBtn = within(dialog).getByRole('button', { name: 'Xác minh pháp nhân' });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockVerifyLegal).toHaveBeenCalledWith('b-1'));
  });
});


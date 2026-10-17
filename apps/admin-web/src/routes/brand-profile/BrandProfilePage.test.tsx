import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import BrandProfilePage from './BrandProfilePage';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockUpdate = vi.fn().mockResolvedValue({});
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useMyBrand: () => ({
    data: {
      id: 'b-1',
      code: 'MAISON_AURORE',
      name: 'Maison Aurore',
      status: 'ACTIVE',
      contactInfo: { email: 'hello@aurore.vn', website: 'aurore.vn' },
      createdAt: '2026-09-14T00:00:00Z',
    },
    isLoading: false,
  }),
  useUpdateMyBrand: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

beforeAll(installDomStubs);
afterEach(cleanup);

describe('BrandProfilePage (FR-BND-06)', () => {
  it('mã thương hiệu chỉ đọc; lưu giữ lại khóa liên hệ màn hình không quản lý', async () => {
    renderScreen(<BrandProfilePage />);
    expect(screen.getByText('MAISON_AURORE')).toBeTruthy();
    expect(screen.queryByDisplayValue('MAISON_AURORE')).toBeNull();

    fireEvent.change(await screen.findByDisplayValue('Maison Aurore'), {
      target: { value: 'Maison Aurore Paris' },
    });
    fireEvent.click(screen.getByText('Lưu thay đổi'));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Maison Aurore Paris',
          contactInfo: expect.objectContaining({ email: 'hello@aurore.vn', website: 'aurore.vn' }),
        }),
      ),
    );
  });
});

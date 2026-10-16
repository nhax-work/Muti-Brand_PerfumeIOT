import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import UsersPage from './UsersPage';

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: { id: 'sa-1', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] } }),
}));
vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const user = (id: string, extra: Record<string, unknown>) => ({
  id,
  email: `${id}@x.local`,
  fullName: id,
  status: 'ACTIVE',
  roles: ['OPERATIONS_STAFF'],
  brandId: null,
  createdAt: '2026-10-01T00:00:00Z',
  ...extra,
});

const mockCreate = vi.fn().mockResolvedValue({
  ...user('new-admin', { roles: ['BRAND_ADMIN'] }),
  temporaryPassword: 'Tmp-Secret-123456',
});
const mockReset = vi.fn().mockResolvedValue({ temporaryPassword: 'Reset-999999999' });

vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useUsers: () => ({
    data: {
      items: [
        user('sa-1', { roles: ['PLATFORM_SUPER_ADMIN'], fullName: 'Tôi' }),
        user('ops-1', { fullName: 'Nhân viên A' }),
      ],
      meta: { page: 1, pageSize: 20, total: 2 },
    },
    isLoading: false,
  }),
  useBrandOptions: () => ({ data: { items: [{ id: 'b-1', name: 'Maison Aurore' }] } }),
  useCreateUser: () => ({ mutateAsync: mockCreate, isPending: false }),
  useDisableUser: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
  useResetPassword: () => ({ mutateAsync: mockReset }),
}));

beforeAll(installDomStubs);
afterEach(cleanup);

describe('UsersPage (FR-USR-01 ÷ 05)', () => {
  it('tạo Brand Admin bắt buộc chọn thương hiệu, rồi hiện mật khẩu tạm đúng một lần', async () => {
    renderScreen(<UsersPage />);
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    const dialog = await screen.findByRole('dialog');
    const [fullName, email] = within(dialog).getAllByRole('textbox');
    fireEvent.change(fullName!, { target: { value: 'Quản trị B' } });
    fireEvent.change(email!, { target: { value: 'b@x.local' } });

    // Chưa chọn thương hiệu → không gửi.
    fireEvent.click(within(dialog).getByText('Tạo tài khoản'));
    expect(await within(dialog).findByText('Bắt buộc nhập')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();

    fireEvent.mouseDown(within(dialog).getAllByRole('combobox')[1]!);
    fireEvent.click(await screen.findByTitle('Maison Aurore'));
    fireEvent.click(within(dialog).getByText('Tạo tài khoản'));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        email: 'b@x.local',
        fullName: 'Quản trị B',
        role: 'BRAND_ADMIN',
        brandId: 'b-1',
      }),
    );
    expect(await screen.findByText('Tmp-Secret-123456')).toBeTruthy();
  });

  it('không có thao tác trên chính tài khoản đang đăng nhập', () => {
    renderScreen(<UsersPage />);
    const myRow = screen.getByText('Tôi').closest('tr')!;
    expect(within(myRow).queryByText('Vô hiệu hóa')).toBeNull();
    const otherRow = screen.getByText('Nhân viên A').closest('tr')!;
    expect(within(otherRow).getByText('Vô hiệu hóa')).toBeTruthy();
  });
});

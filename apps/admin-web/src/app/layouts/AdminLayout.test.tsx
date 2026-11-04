import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import { AdminLayout } from './AdminLayout';

const SUPER_ADMIN = {
  id: 'admin-1',
  fullName: 'Nguyen Quan Tri',
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: [],
};
const BRAND_ADMIN = {
  id: 'brand-admin-1',
  email: 'aurore@brand.local',
  fullName: 'Pham Aurore',
  roles: ['BRAND_ADMIN'],
  permissions: [],
  emailVerificationPending: false,
};
let mockUser: typeof SUPER_ADMIN & { email?: string; emailVerificationPending?: boolean } =
  SUPER_ADMIN;
const mockReloadUser = vi.fn().mockResolvedValue(undefined);
const mockResend = vi.fn().mockResolvedValue(undefined);
let mockAcceptance: { id: string } | null = null;

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser, logout: vi.fn(), reloadUser: mockReloadUser }),
  useResendVerification: () => ({ mutateAsync: mockResend, isPending: false }),
}));

vi.mock('@/shared/agreement/api', () => ({
  useCurrentAgreement: ({ enabled = true }: { enabled?: boolean } = {}) => ({
    data: enabled
      ? {
          agreement: {
            id: 'agreement-1',
            version: '1.0',
            title: 'Hop dong khung',
            content: 'Noi dung hop dong khung',
            contentHash: 'a'.repeat(64),
          },
          acceptance: mockAcceptance,
        }
      : undefined,
  }),
  useAcceptAgreement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const COLLAPSE = /Thu gọn menu|Collapse menu/;
const EXPAND = /Mở rộng menu|Expand menu/;
const WELCOME = /Chào mừng tới ScentStation|Welcome to ScentStation/;
const HELP = /Xem hướng dẫn|Show guide/;
const ONBOARDING_DONE_KEY = `scentstation.admin.onboardingDone.${BRAND_ADMIN.id}`;

/** Bấm Tiếp tới bước cuối rồi bấm Hoàn thành. */
function clickThroughTour() {
  for (;;) {
    const next = screen.queryByRole('button', { name: /^(Tiếp|Next)$/ });
    if (!next) break;
    fireEvent.click(next);
  }
  fireEvent.click(screen.getByRole('button', { name: /^(Hoàn thành|Finish)$/ }));
}

beforeAll(installDomStubs);
beforeEach(() => {
  window.localStorage.clear();
  mockUser = SUPER_ADMIN;
  mockAcceptance = null;
  mockReloadUser.mockClear();
  mockResend.mockClear();
});
afterEach(cleanup);

describe('AdminLayout', () => {
  it('nút cạnh ảnh đại diện thu gọn rồi mở lại menu và nhớ lựa chọn', () => {
    renderScreen(<AdminLayout />);
    const sider = document.querySelector('.admin-sider');
    expect(sider?.classList.contains('ant-layout-sider-collapsed')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: COLLAPSE }));
    expect(sider?.classList.contains('ant-layout-sider-collapsed')).toBe(true);
    expect(window.localStorage.getItem('scentstation.admin.siderCollapsed')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: EXPAND }));
    expect(sider?.classList.contains('ant-layout-sider-collapsed')).toBe(false);
    expect(window.localStorage.getItem('scentstation.admin.siderCollapsed')).toBe('0');
  });

  it('mở lại trang thì giữ menu đã thu gọn lần trước', () => {
    window.localStorage.setItem('scentstation.admin.siderCollapsed', '1');
    renderScreen(<AdminLayout />);
    expect(
      document.querySelector('.admin-sider')?.classList.contains('ant-layout-sider-collapsed'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: EXPAND })).toBeTruthy();
  });

  it('menu cấp đầu hiện tên nhóm thay cho từng màn hình', () => {
    renderScreen(<AdminLayout />);
    expect(screen.getByText(/Vận hành máy|Machine Operations/)).toBeTruthy();
    expect(screen.getByText(/Tài chính|Finance/)).toBeTruthy();
    // Màn hình trong nhóm đang đóng không hiện ra cho tới khi mở nhóm.
    expect(screen.queryByText(/Nhật ký kiểm toán|Audit Log/)).toBeNull();
  });

  it('Super Admin không có hướng dẫn thương hiệu', () => {
    renderScreen(<AdminLayout />);
    expect(screen.queryByText(WELCOME)).toBeNull();
    expect(screen.queryByRole('button', { name: HELP })).toBeNull();
  });
});

describe('AdminLayout — hướng dẫn cho Brand Admin', () => {
  beforeEach(() => {
    mockUser = BRAND_ADMIN;
  });

  it('lần đầu đăng nhập tự bật hướng dẫn và mở rộng menu dù trước đó đã thu gọn', () => {
    window.localStorage.setItem('scentstation.admin.siderCollapsed', '1');
    renderScreen(<AdminLayout />);
    expect(screen.getByText(WELCOME)).toBeTruthy();
    expect(
      document.querySelector('.admin-sider')?.classList.contains('ant-layout-sider-collapsed'),
    ).toBe(false);
  });

  it('đã xem rồi thì không tự bật nữa, nút xem lại mở lại hướng dẫn', () => {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    renderScreen(<AdminLayout />);
    expect(screen.queryByText(WELCOME)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: HELP }));
    expect(screen.getByText(WELCOME)).toBeTruthy();
  });

  it('hoàn thành hướng dẫn thì ghi nhớ và mời đồng ý hợp đồng khung', () => {
    renderScreen(<AdminLayout />);
    clickThroughTour();

    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
    expect(screen.getByText('Noi dung hop dong khung')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Để sau|Later/ })).toBeTruthy();
  });

  it('đã đồng ý hợp đồng khung thì hoàn thành hướng dẫn không mở hợp đồng', () => {
    mockAcceptance = { id: 'acceptance-1' };
    renderScreen(<AdminLayout />);
    clickThroughTour();

    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
    expect(screen.queryByText('Noi dung hop dong khung')).toBeNull();
  });
});

describe('AdminLayout — nhắc xác minh email (ADR-0021)', () => {
  const BANNER = /chưa được xác minh|is not verified yet/;
  const RESEND = /Gửi lại email xác minh|Resend verification email/;

  beforeEach(() => {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
  });

  it('tài khoản chưa xác minh thấy thanh nhắc kèm email và gửi lại được', () => {
    mockUser = { ...BRAND_ADMIN, emailVerificationPending: true };
    renderScreen(<AdminLayout />);
    expect(screen.getByText(BANNER).textContent).toContain('aurore@brand.local');

    fireEvent.click(screen.getByRole('button', { name: RESEND }));
    expect(mockResend).toHaveBeenCalledTimes(1);
  });

  it('quay lại tab thì hỏi lại máy chủ để biết đã xác minh chưa', () => {
    mockUser = { ...BRAND_ADMIN, emailVerificationPending: true };
    renderScreen(<AdminLayout />);
    fireEvent.focus(window);
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
  });

  it('đã xác minh hoặc không cần xác minh thì không có thanh nhắc, không hỏi lại', () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<AdminLayout />);
    expect(screen.queryByText(BANNER)).toBeNull();
    fireEvent.focus(window);
    expect(mockReloadUser).not.toHaveBeenCalled();
  });

  it('hướng dẫn có thêm bước xác minh email khi thanh nhắc đang hiện', () => {
    window.localStorage.removeItem(ONBOARDING_DONE_KEY);
    mockUser = { ...BRAND_ADMIN, emailVerificationPending: true };
    renderScreen(<AdminLayout />);
    fireEvent.click(screen.getByRole('button', { name: /^(Tiếp|Next)$/ }));
    expect(screen.getByText(/Trước tiên – Xác minh email|First – Verify your email/)).toBeTruthy();
  });
});

import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import { RequireRole } from './RequireRole';

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: { id: 'brand-1', roles: ['BRAND_ADMIN'], permissions: [] } }),
}));

beforeAll(installDomStubs);
afterEach(cleanup);

describe('RequireRole', () => {
  it('test_FR_AUTH_06_require_role_shows_404_page_for_whole_screen_by_default', () => {
    renderScreen(
      <RequireRole allow={['INVENTORY_STAFF']}>
        <span>secret screen</span>
      </RequireRole>,
    );

    expect(screen.queryByText('secret screen')).toBeNull();
    expect(screen.getByText('404')).toBeTruthy();
  });

  it('test_FR_AUTH_06_require_role_hides_button_without_404_when_fallback_null', () => {
    // Màn Bottle Returns bọc nút "Tạo phiếu" bằng RequireRole: Brand Admin từng thấy hình 404 giữa trang.
    renderScreen(
      <div>
        <span>page content</span>
        <RequireRole allow={['INVENTORY_STAFF']} fallback={null}>
          <button type="button">create</button>
        </RequireRole>
      </div>,
    );

    expect(screen.getByText('page content')).toBeTruthy();
    expect(screen.queryByText('create')).toBeNull();
    expect(screen.queryByText('404')).toBeNull();
  });

  it('test_FR_AUTH_06_require_role_renders_children_for_allowed_role', () => {
    renderScreen(
      <RequireRole allow={['BRAND_ADMIN']} fallback={null}>
        <button type="button">create</button>
      </RequireRole>,
    );

    expect(screen.getByText('create')).toBeTruthy();
  });
});

import { ArrowLeftOutlined } from '@ant-design/icons';
import { ConfigProvider } from 'antd';
import { Link, Outlet, useLocation } from 'react-router';
import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { AUTH_THEME } from '../theme';

/**
 * Các trang thuộc nhánh "Đăng nhập" (quên/đặt lại mật khẩu là bước con của nó). Thanh tab giữ nguyên
 * trên mọi trang này để chuyển qua lại không làm nội dung nhảy chỗ.
 */
const LOGIN_PATHS = ['/login', '/forgot-password', '/reset-password'];
const REGISTER_PATHS = ['/register'];

/**
 * Khung chung cho các trang xác thực: cột trái là ảnh và lời giới thiệu (ẩn trên màn hẹp), cột phải
 * chứa biểu mẫu. Theo thiết kế "ScentStation Minimalist Auth Portal".
 */
export function AuthLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const onLogin = LOGIN_PATHS.includes(pathname);
  const onRegister = REGISTER_PATHS.includes(pathname);
  const showTabs = onLogin || onRegister;

  return (
    <ConfigProvider theme={AUTH_THEME}>
      <div className="auth-layout">
        <aside className="auth-hero" aria-hidden="true">
          <div className="auth-hero-image" />
          <div className="auth-hero-scrim" />
          <div className="auth-hero-mark">
            <span className="auth-hero-mark-dot" />
            ScentStation
          </div>
          <div className="auth-hero-body">
            <div className="auth-hero-eyebrow">
              <span className="auth-hero-eyebrow-line" />
              {t('ui.authHeroEyebrow')}
            </div>
            <p className="auth-hero-title">{t('ui.authHeroTitle')}</p>
            <p className="auth-hero-desc">{t('ui.authHeroDesc')}</p>
          </div>
        </aside>

        <main className="auth-panel">
          <header className="auth-panel-head">
            {config.landingUrl && (
              <a
                href={config.landingUrl}
                className="auth-back"
                aria-label={t('ui.authBackHome')}
                title={t('ui.authBackHome')}
              >
                <ArrowLeftOutlined />
                <span className="auth-back-text">{t('ui.authBackHome')}</span>
              </a>
            )}
            <div className="auth-panel-brand">ScentStation</div>
          </header>
          <div className="auth-panel-body">
            {showTabs && (
              <nav className="auth-tabs" aria-label={t('ui.authTabsLabel')}>
                <Link
                  to="/login"
                  className={onLogin ? 'auth-tab active' : 'auth-tab'}
                  aria-current={pathname === '/login' ? 'page' : undefined}
                >
                  {t('ui.authTabLogin')}
                </Link>
                <Link
                  to="/register"
                  className={onRegister ? 'auth-tab active' : 'auth-tab'}
                  aria-current={onRegister ? 'page' : undefined}
                >
                  {t('ui.authTabRegister')}
                </Link>
              </nav>
            )}
            <Outlet />
          </div>
          <footer className="auth-panel-footer">
            {t('ui.authFooter', { year: new Date().getFullYear() })}
          </footer>
        </main>
      </div>
    </ConfigProvider>
  );
}

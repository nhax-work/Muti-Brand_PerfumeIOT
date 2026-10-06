import { DEFAULT_LOCALE, LOCALES } from '@scentstation/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import OutOfServiceScreen from '@/screens/out-of-service/OutOfServiceScreen';
import { config } from '@/shared/config';
import { useIdleReset } from '@/shared/hooks/useIdleReset';
import { useOutOfService } from '@/shared/hooks/useOutOfService';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import type { KioskRouteHandle } from './route-handle';
import styles from './KioskShell.module.css';

const LANGUAGE_LABELS: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh',
};

function getLanguageLabel(l: string): string {
  return LANGUAGE_LABELS[l] ?? l;
}

/**
 * Khung bao mọi màn hình kiosk:
 * - Header tối giản cao cấp thương hiệu SCENTATION PARIS (Haute Parfumerie).
 * - Điều hướng linh hoạt (Trang chủ / Quay lại danh mục).
 * - Dropdown chuyển đổi ngôn ngữ tương tác mượt mà.
 * - Footer thông tin hỗ trợ sommelier và chuẩn giao diện haptic touch.
 * - Cơ chế tự động reset phiên khi rảnh (NFR-USA-02) và màn hình bảo trì (FR-IOT-13).
 */
export function KioskShell() {
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const matches = useMatches();
  const outOfService = useOutOfService();
  const { startNewSession } = useKioskSession();

  const [isLangOpen, setIsLangOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  const keepAwake = matches.some((m) => (m.handle as KioskRouteHandle | undefined)?.keepAwake);

  const resetSession = useCallback(() => {
    setLocale(DEFAULT_LOCALE);
    startNewSession();
    setIsLangOpen(false);
    void navigate('/', { replace: true });
  }, [navigate, setLocale, startNewSession]);

  useIdleReset(resetSession, config.idleTimeoutMs, !keepAwake);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
    }
    if (isLangOpen) {
      document.addEventListener('pointerdown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isLangOpen]);

  if (outOfService) return <OutOfServiceScreen />;

  const isCatalog = location.pathname === '/catalog';
  const isProductDetail = location.pathname.startsWith('/products/');
  const isCheckout = location.pathname.startsWith('/checkout/');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.navLeft}>
          {isCatalog && (
            <button
              type="button"
              className={styles.backButton}
              onClick={() => void navigate('/')}
              aria-label={t('kiosk.backToHome')}
            >
              ← {t('kiosk.backToHome')}
            </button>
          )}
          {(isProductDetail || isCheckout) && (
            <button
              type="button"
              className={styles.backButton}
              onClick={() => void navigate('/catalog')}
              aria-label={t('kiosk.backToCatalog')}
            >
              ← {t('kiosk.backToCatalog')}
            </button>
          )}
          {!isCatalog && !isProductDetail && !isCheckout && (
            <span className={styles.srOnly}>ScentStation Kiosk</span>
          )}
        </div>

        <div className={styles.brandCenter}>
          <span className={styles.brandTitle}>SCENTATION</span>
        </div>

        <div className={styles.navRight} ref={langDropdownRef}>
          <button
            type="button"
            className={`${styles.langDropdownTrigger} ${isLangOpen ? styles.langDropdownTriggerOpen : ''}`}
            onClick={() => setIsLangOpen((prev) => !prev)}
            aria-expanded={isLangOpen}
            aria-haspopup="listbox"
            aria-label="Chọn ngôn ngữ"
          >
            <span className={styles.langGlobe}>🌐</span>
            <span>{getLanguageLabel(locale)}</span>
            <span className={styles.langChevron}>{isLangOpen ? '▲' : '▼'}</span>
          </button>

          {isLangOpen && (
            <div className={styles.langMenu} role="listbox">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`${styles.langOption} ${l === locale ? styles.langOptionActive : ''}`}
                  onClick={() => {
                    setLocale(l);
                    setIsLangOpen(false);
                  }}
                  role="option"
                  aria-selected={l === locale}
                >
                  <span>{getLanguageLabel(l)}</span>
                  {l === locale && <span className={styles.checkIcon}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}

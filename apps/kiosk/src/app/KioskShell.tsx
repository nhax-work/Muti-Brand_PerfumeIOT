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
 * Khung bao mọi màn hình kiosk: Header chứa điều hướng (Trang chủ / Quay lại)
 * cùng hàng với Dropdown chọn ngôn ngữ thu gọn, tự về trang chủ khi rảnh (NFR-USA-02),
 * và thay toàn bộ nội dung bằng màn hình tạm ngưng khi mất liên lạc (FR-IOT-13).
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

  // Đóng dropdown khi click ngoài
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
          {isProductDetail && (
            <button
              type="button"
              className={styles.backButton}
              onClick={() => void navigate('/catalog')}
              aria-label={t('kiosk.backToCatalog')}
            >
              ← {t('kiosk.backToCatalog')}
            </button>
          )}
          {!isCatalog && !isProductDetail && (
            <div className={styles.brandTitle}>
              <span className={styles.brandIcon}>✦</span> ScentStation
            </div>
          )}
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
            <span className={styles.langName}>{getLanguageLabel(locale)}</span>
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

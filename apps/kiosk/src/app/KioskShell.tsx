import { DEFAULT_LOCALE, LOCALES } from '@scentstation/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import OutOfServiceScreen from '@/screens/out-of-service/OutOfServiceScreen';
import { config } from '@/shared/config';
import { useIdleReset } from '@/shared/hooks/useIdleReset';
import { useOutOfService } from '@/shared/hooks/useOutOfService';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import { LanguageFlag } from './LanguageFlag';
import type { KioskRouteHandle } from './route-handle';
import styles from './KioskShell.module.css';

// Tên ngôn ngữ viết bằng chính ngôn ngữ đó (endonym) để khách nhận ra dù đang ở ngôn ngữ nào —
// cố ý không đi qua i18n.
const LANGUAGE_LABELS: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
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
  const { startNewSession, activeOrder } = useKioskSession();

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

  // Khách đang có đơn chưa kết thúc (có thể đã trả tiền, đèn đang sáng) thì không thay cả màn hình:
  // giữ màn thanh toán để khách còn thấy mã và đếm ngược, chỉ báo mất kết nối (FR-IOT-13, FR-ORD-21).

  const isCatalog = location.pathname === '/catalog';
  const isProductDetail = location.pathname.startsWith('/products/');
  const isCheckout = location.pathname.startsWith('/checkout/');

  // Giữ nguyên màn giao dịch để khách còn thấy mã và trạng thái khi máy/mạng gặp sự cố.
  if (outOfService && !isCheckout && !activeOrder) return <OutOfServiceScreen />;

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
          {/* Đang có đơn thì CheckoutScreen tự lo điều hướng — lỡ chạm là mất màn đếm ngược. */}
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
            <LanguageFlag locale={locale} />
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
                  <span className={styles.langOptionLabel}>
                    <LanguageFlag locale={l} />
                    <span>{getLanguageLabel(l)}</span>
                  </span>
                  {l === locale && <span className={styles.checkIcon}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {outOfService && (
        <p className={styles.connectionBanner} role="alert">
          {t('kiosk.connectionLost')}
        </p>
      )}

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}

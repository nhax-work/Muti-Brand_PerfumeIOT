import { DEFAULT_LOCALE, LOCALES } from '@scentstation/i18n';
import { useCallback } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import OutOfServiceScreen from '@/screens/out-of-service/OutOfServiceScreen';
import { cancelKioskOrder } from '@/shared/api';
import { config } from '@/shared/config';
import { useIdleReset } from '@/shared/hooks/useIdleReset';
import { useOutOfService } from '@/shared/hooks/useOutOfService';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import { Icon } from '@/shared/ui/Icon';
import type { KioskRouteHandle } from './route-handle';
import styles from './KioskShell.module.css';

// Tên ngôn ngữ viết bằng chính ngôn ngữ đó (endonym) để khách nhận ra dù đang ở ngôn ngữ nào —
// cố ý không đi qua i18n. Nút gạt hiện mã ngôn ngữ, tên đầy đủ dành cho trình đọc màn hình.
const LANGUAGE_LABELS: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};

/**
 * Khung bao mọi màn hình kiosk: header (nút quay lại, wordmark, nút gạt ngôn ngữ), tự về trang chủ
 * khi không thao tác (NFR-USA-02) và màn tạm ngưng phục vụ (FR-IOT-13).
 */
export function KioskShell() {
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const matches = useMatches();
  const outOfService = useOutOfService();
  const { startNewSession, activeOrder } = useKioskSession();

  const keepAwake = matches.some((m) => (m.handle as KioskRouteHandle | undefined)?.keepAwake);

  const resetSession = useCallback(() => {
    if (activeOrder?.id) {
      void cancelKioskOrder(activeOrder.id).catch(() => {});
    }
    setLocale(DEFAULT_LOCALE);
    startNewSession();
    void navigate('/', { replace: true });
  }, [navigate, setLocale, startNewSession, activeOrder]);

  useIdleReset(resetSession, config.idleTimeoutMs, !keepAwake);

  const isCatalog = location.pathname === '/catalog';
  const isCheckout = location.pathname.startsWith('/checkout/');

  // Khách đang có đơn chưa kết thúc (có thể đã trả tiền, đèn đang sáng) thì không thay cả màn hình:
  // giữ màn thanh toán để khách còn thấy mã và đếm ngược, chỉ báo mất kết nối (FR-IOT-13, FR-ORD-21).
  if (outOfService && !isCheckout && !activeOrder) return <OutOfServiceScreen />;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.navLeft}>
          {isCatalog && (
            <button type="button" className={styles.backButton} onClick={() => void navigate('/')}>
              <Icon name="arrowLeft" size={20} />
              <span>{t('kiosk.backToHome')}</span>
            </button>
          )}
          {/* Trang chi tiết tự có nút quay lại (bỏ đơn đúng đường đóng); đang thanh toán thì
              CatalogScreen tự lo điều hướng — lỡ chạm là mất màn đếm ngược. */}
        </div>

        <span className={styles.wordmark}>ScentStation</span>

        <div className={styles.navRight}>
          <div className={styles.langToggle} role="group" aria-label={t('kiosk.language')}>
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                className={styles.langOption}
                aria-pressed={l === locale}
                aria-label={LANGUAGE_LABELS[l] ?? l}
                onClick={() => setLocale(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
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

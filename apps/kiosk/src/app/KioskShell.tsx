import { DEFAULT_LOCALE, LOCALES, translate } from '@scentstation/i18n';
import { useCallback } from 'react';
import { Outlet, useMatches, useNavigate } from 'react-router';
import OutOfServiceScreen from '@/screens/out-of-service/OutOfServiceScreen';
import { config } from '@/shared/config';
import { useIdleReset } from '@/shared/hooks/useIdleReset';
import { useOutOfService } from '@/shared/hooks/useOutOfService';
import { useI18n } from '@/shared/i18n';
import type { KioskRouteHandle } from './route-handle';
import styles from './KioskShell.module.css';

/**
 * Khung bao mọi màn hình kiosk: nút đổi ngôn ngữ, tự về trang chủ khi rảnh (NFR-USA-02), và thay
 * toàn bộ nội dung bằng màn hình tạm ngưng khi mất liên lạc (FR-IOT-13).
 */
export function KioskShell() {
  const { locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const matches = useMatches();
  const outOfService = useOutOfService();

  const keepAwake = matches.some((m) => (m.handle as KioskRouteHandle | undefined)?.keepAwake);

  const resetSession = useCallback(() => {
    setLocale(DEFAULT_LOCALE);
    void navigate('/', { replace: true });
  }, [navigate, setLocale]);

  useIdleReset(resetSession, config.idleTimeoutMs, !keepAwake);

  if (outOfService) return <OutOfServiceScreen />;

  return (
    <div className={styles.shell}>
      <nav className={styles.languages}>
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            className={styles.language}
            aria-pressed={l === locale}
            onClick={() => setLocale(l)}
          >
            {translate(l, 'ui.localeName')}
          </button>
        ))}
      </nav>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}

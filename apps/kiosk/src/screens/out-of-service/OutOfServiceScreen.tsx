import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { Icon } from '@/shared/ui/Icon';
import styles from './OutOfServiceScreen.module.css';

/**
 * Màn hình bảo trì / tạm ngưng phục vụ Kiosk ScentStation Paris (FR-IOT-13).
 */
export default function OutOfServiceScreen() {
  const { t } = useI18n();

  return (
    <section className={styles.screen} role="alert">
      <div className={styles.card}>
        <span className={styles.brandTag}>ScentStation PARIS • KIOSK SALON</span>

        <div className={styles.iconWrapper}>
          <Icon name="tool" size={32} />
        </div>

        <h1 className={styles.title}>{t('kiosk.outOfServiceTitle')}</h1>
        <p className={styles.hint}>{t('kiosk.outOfServiceHint')}</p>

        {/* Máy chạy không có nhân viên (BR-001): chỉ hiện kênh hỗ trợ khi đã cấu hình. */}
        {config.supportContact && (
          <>
            <div className={styles.divider} />
            <span className={styles.supportNote}>
              {t('kiosk.outOfServiceContact', { contact: config.supportContact })}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

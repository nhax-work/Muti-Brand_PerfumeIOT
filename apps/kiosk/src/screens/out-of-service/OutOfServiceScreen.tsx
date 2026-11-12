import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import styles from './OutOfServiceScreen.module.css';

/**
 * Màn tạm ngưng phục vụ (FR-IOT-13): lịch sự, không lộ chi tiết kỹ thuật (mất mạng, chế độ máy,
 * mã lỗi) — khách chỉ cần biết quay lại sau, và kênh hỗ trợ nếu đã cấu hình (BR-001).
 */
export default function OutOfServiceScreen() {
  const { t } = useI18n();

  return (
    <section className={styles.screen} role="alert">
      <span className={styles.wordmark}>ScentStation</span>
      <h1 className={styles.title}>{t('kiosk.outOfServiceTitle')}</h1>
      <p className={styles.hint}>{t('kiosk.outOfServiceHint')}</p>
      {config.supportContact && (
        <p className={styles.contact}>
          {t('kiosk.outOfServiceContact', { contact: config.supportContact })}
        </p>
      )}
    </section>
  );
}

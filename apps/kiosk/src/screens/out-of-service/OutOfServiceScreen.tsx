import { useI18n } from '@/shared/i18n';
import styles from './OutOfServiceScreen.module.css';

/**
 * Màn hình bảo trì / tạm ngưng phục vụ Kiosk Scentation Paris (FR-IOT-13).
 */
export default function OutOfServiceScreen() {
  const { t } = useI18n();

  return (
    <section className={styles.screen} role="alert">
      <div className={styles.card}>
        <span className={styles.brandTag}>SCENTATION PARIS • KIOSK SALON</span>

        <div className={styles.iconWrapper}>
          <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
            build_circle
          </span>
        </div>

        <h1 className={styles.title}>{t('kiosk.outOfServiceTitle')}</h1>
        <p className={styles.hint}>{t('kiosk.outOfServiceHint')}</p>

        <div className={styles.divider} />

        <span className={styles.supportNote}>
          Vui lòng chạm nút gọi Sommelier hoặc liên hệ quản trị viên quầy
        </span>
      </div>
    </section>
  );
}

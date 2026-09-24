import { useI18n } from '@/shared/i18n';
import styles from './OutOfServiceScreen.module.css';

/** FR-IOT-13. Câu chữ theo NFR-USA-03: ngôn ngữ thông thường, kèm việc khách nên làm tiếp. */
export default function OutOfServiceScreen() {
  const { t } = useI18n();

  return (
    <section className={styles.screen} role="alert">
      <h1 className={styles.title}>{t('kiosk.outOfServiceTitle')}</h1>
      <p className={styles.hint}>{t('kiosk.outOfServiceHint')}</p>
    </section>
  );
}

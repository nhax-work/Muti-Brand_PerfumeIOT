import { useI18n } from '@/shared/i18n';
import styles from './HomeScreen.module.css';

/** Màn hình chờ. Nút bắt đầu sẽ dẫn sang `screens/catalog/` khi màn hình đó được làm. */
export default function HomeScreen() {
  const { t } = useI18n();

  return (
    <section className={styles.home}>
      <h1 className={styles.title}>{t('kiosk.welcome')}</h1>
      <button type="button" className={styles.start}>
        {t('kiosk.tapToStart')}
      </button>
    </section>
  );
}

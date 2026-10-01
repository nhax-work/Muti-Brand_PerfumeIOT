import { useNavigate } from 'react-router';
import { useI18n } from '@/shared/i18n';
import styles from './HomeScreen.module.css';

/** Màn hình chờ. Nút bắt đầu dẫn sang `screens/catalog/`. */
export default function HomeScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <section className={styles.home}>
      <h1 className={styles.title}>{t('kiosk.welcome')}</h1>
      <button
        id="kiosk-start-button"
        type="button"
        className={styles.start}
        onClick={() => navigate('/catalog')}
      >
        {t('kiosk.tapToStart')}
      </button>
    </section>
  );
}

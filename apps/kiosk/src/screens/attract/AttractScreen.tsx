import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useKioskCatalog } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import styles from './AttractScreen.module.css';

/** Mỗi ảnh đứng yên chừng này rồi mới mờ dần sang ảnh kế — chậm, không giành sự chú ý. */
const SLIDE_MS = 6000;

/**
 * Màn chờ khi không ai dùng (NFR-USA-02): kiosk tự về đây sau KIOSK_IDLE_TIMEOUT_SEC. Ảnh sản phẩm
 * đang bán chuyển chậm; chạm bất kỳ đâu để vào danh mục. Chỉ dùng ảnh máy chủ trả — slot không khả
 * dụng hay sản phẩm chưa có ảnh thì bỏ qua, không hiện ảnh thay.
 */
export default function AttractScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const catalog = useKioskCatalog();

  const slides = useMemo(
    () =>
      (catalog.data?.items ?? [])
        .filter((i) => i.available && i.product?.imageUrl)
        .sort((a, b) => a.slotNumber - b.slotNumber)
        .map((i) => ({ key: i.slotId, src: i.product?.imageUrl ?? '', name: i.product?.name })),
    [catalog.data?.items],
  );

  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  const current = slides.length > 0 ? index % slides.length : -1;

  return (
    <button type="button" className={styles.screen} onClick={() => void navigate('/catalog')}>
      <div className={styles.stage} aria-hidden="true">
        {slides.map((s, i) => (
          <img
            key={s.key}
            src={s.src}
            alt=""
            draggable={false}
            className={`${styles.slide} ${i === current ? styles.slideOn : ''}`}
          />
        ))}
      </div>
      <span className={styles.copy}>
        <span className={styles.cta}>{t('kiosk.tapToStart')}</span>
        <span className={styles.steps}>
          {t('kiosk.introChoose')} · {t('kiosk.introScan')} · {t('kiosk.introPress')}
        </span>
      </span>
    </button>
  );
}

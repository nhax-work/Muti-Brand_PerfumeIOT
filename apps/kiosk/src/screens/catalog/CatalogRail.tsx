import { useEffect, useMemo, useRef, useState } from 'react';
import type { components } from '@scentstation/contracts';
import { formatPrice } from '@/shared/format/price';
import { useI18n } from '@/shared/i18n';
import { Icon } from '@/shared/ui/Icon';
import { ProductImage } from '@/shared/ui/ProductImage';
import styles from './CatalogRail.module.css';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

/**
 * Dải danh mục vuốt ngang (FR-ORD-01). Thẻ xếp theo số slot — cũng là số nút có đèn trên máy
 * (ADR-0007), nên thứ tự trên màn hình trùng thứ tự nút từ trái sang phải. Chỉ hiện đúng dữ liệu
 * máy chủ trả: slot không khả dụng không có thương hiệu hay sản phẩm (BR-012, FR-RPT-12).
 */
export function CatalogRail({
  items,
  onSelect,
}: {
  items: readonly KioskCatalogItem[];
  onSelect: (item: KioskCatalogItem) => void;
}) {
  const { t, locale } = useI18n();
  const trackRef = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const sorted = useMemo(() => [...items].sort((a, b) => a.slotNumber - b.slotNumber), [items]);

  const updateEdge = () => {
    const el = trackRef.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  };

  // Đo lại khi danh mục đổi hay màn hình đổi cỡ — ít thẻ thì cả hai mũi tên đều tắt.
  useEffect(() => {
    updateEdge();
    window.addEventListener('resize', updateEdge);
    return () => window.removeEventListener('resize', updateEdge);
  }, [sorted]);

  // Mỗi lần chạm mũi tên trượt đúng một thẻ; vuốt tay vẫn là cách chính.
  const step = (direction: 1 | -1) => {
    const el = trackRef.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy?.({ left: direction * (card.offsetWidth + gap), behavior: 'smooth' });
  };

  return (
    <div className={styles.rail}>
      <div className={styles.topRow}>
        <ol className={styles.intro}>
          <li>{t('kiosk.introChoose')}</li>
          <li>{t('kiosk.introScan')}</li>
          <li>{t('kiosk.introPress')}</li>
        </ol>
        <div className={styles.arrows}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => step(-1)}
            disabled={edge.start}
            aria-label={t('kiosk.scrollLeft')}
          >
            <Icon name="arrowLeft" size={20} />
          </button>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => step(1)}
            disabled={edge.end}
            aria-label={t('kiosk.scrollRight')}
          >
            <Icon name="arrowRight" size={20} />
          </button>
        </div>
      </div>

      <ul ref={trackRef} className={styles.track} onScroll={updateEdge}>
        {sorted.map((item) => {
          const name = item.product?.name;
          const price = formatPrice(item.pricePerSpray, item.currency, locale);
          return (
            <li key={item.slotId} className={styles.slot}>
              <button
                type="button"
                className={styles.card}
                disabled={!item.available}
                onClick={() => onSelect(item)}
              >
                <div className={styles.media}>
                  <ProductImage
                    src={item.available ? item.product?.imageUrl : null}
                    alt={name ?? t('kiosk.productImageAlt')}
                  />
                  {/* Số trên thẻ = số nút trên máy — nhãn duy nhất được dùng màu đèn nút. */}
                  <span
                    className={styles.buttonNo}
                    aria-label={t('kiosk.buttonNumber', { slot: item.slotNumber })}
                  >
                    {item.slotNumber}
                  </span>
                </div>
                {item.available ? (
                  <>
                    {item.brandName && <p className={`caps ${styles.brand}`}>{item.brandName}</p>}
                    <h2 className={styles.name}>{name}</h2>
                    {price && (
                      <p className={styles.price}>
                        {price} <span className={styles.perSpray}>{t('kiosk.perSpray')}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className={`caps ${styles.brand}`}>{t('kiosk.slotUnavailable')}</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

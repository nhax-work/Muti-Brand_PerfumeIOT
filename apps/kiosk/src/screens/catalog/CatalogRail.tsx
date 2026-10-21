import { useEffect, useMemo, useRef, useState } from 'react';
import type { components } from '@scentstation/contracts';
import { formatPrice } from '@/shared/format/price';
import { useI18n } from '@/shared/i18n';
import { Icon } from '@/shared/ui/Icon';
import { ProductImage } from '@/shared/ui/ProductImage';
import styles from './CatalogRail.module.css';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

/** Tốc độ trôi của băng chuyền — chậm đủ để đọc tên khi thẻ đi qua. */
const DRIFT_PX_PER_SEC = 30;
/** Khách chạm/kéo thì dừng trôi, chừng này sau lần chạm cuối mới trôi tiếp. */
const RESUME_AFTER_MS = 3000;
/** Kéo quá chừng này mới tính là vuốt — chạm hơi trượt tay vẫn là chọn thẻ. */
const DRAG_THRESHOLD_PX = 6;
/** Ba bộ thẻ nối nhau: luôn có thẻ phủ kín hai bên khi quấn vòng. */
const COPIES = 3;
const STEPPING = styles.stepping;

function shouldDrift(): boolean {
  if (import.meta.env.MODE === 'test') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Băng chuyền danh mục trôi chậm từ trái sang phải, lặp vô tận; khách vuốt tay hay chạm mũi tên
 * để xem nhanh (FR-ORD-01). Thẻ xếp theo số slot — cũng là số nút có đèn trên máy (ADR-0007). Chỉ
 * hiện đúng dữ liệu máy chủ trả: slot không khả dụng không có thương hiệu hay sản phẩm (BR-012).
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
  const offset = useRef(0);
  const cycle = useRef(0);
  const pausedUntil = useRef(0);
  const drag = useRef<{ startX: number; startOffset: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const sorted = useMemo(() => [...items].sort((a, b) => a.slotNumber - b.slotNumber), [items]);
  // Đọc một lần lúc dựng màn — đổi chế độ giảm chuyển động giữa chừng thì lần sau mới áp dụng.
  const [drift] = useState(shouldDrift);
  const copies = drift && sorted.length > 0 ? COPIES : 1;

  const apply = () => {
    const track = trackRef.current;
    if (!track) return;
    // Giữ offset trong bộ giữa để hai bên luôn có thẻ.
    if (cycle.current > 0) {
      while (offset.current > 0) offset.current -= cycle.current;
      while (offset.current <= -2 * cycle.current) offset.current += cycle.current;
    }
    track.style.transform = `translate3d(${offset.current}px, 0, 0)`;
  };

  const pause = () => {
    pausedUntil.current = performance.now() + RESUME_AFTER_MS;
  };

  // Đo độ dài một bộ thẻ; đo lại khi đổi cỡ màn hình.
  useEffect(() => {
    if (copies === 1) return;
    const measure = () => {
      const track = trackRef.current;
      const first = track?.children[0] as HTMLElement | undefined;
      const next = track?.children[sorted.length] as HTMLElement | undefined;
      if (!first || !next) return;
      const width = next.offsetLeft - first.offsetLeft;
      if (width <= 0) return;
      if (cycle.current === 0) offset.current = -width;
      cycle.current = width;
      apply();
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [copies, sorted.length]);

  // Trôi theo thời gian thật giữa hai khung hình — tốc độ đều dù máy chậm hay nhanh.
  useEffect(() => {
    if (copies === 1) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!drag.current && now >= pausedUntil.current && cycle.current > 0) {
        // Trượt bằng mũi tên đã xong từ lâu — gỡ chuyển động để vòng trôi không bị trễ theo.
        if (STEPPING) trackRef.current?.classList.remove(STEPPING);
        offset.current += (DRIFT_PX_PER_SEC * dt) / 1000;
        apply();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [copies]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (copies === 1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (STEPPING) trackRef.current?.classList.remove(STEPPING);
    drag.current = { startX: e.clientX, startOffset: offset.current, moved: false };
    pause();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    offset.current = d.startOffset + dx;
    apply();
  };

  const endDrag = () => {
    suppressClick.current = drag.current?.moved ?? false;
    drag.current = null;
    pause();
  };

  // Mỗi lần chạm mũi tên trượt đúng một thẻ, có chuyển động ngắn.
  const step = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return;
    pause();
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    if (copies === 1) {
      track.parentElement?.scrollBy?.({
        left: direction * (card.offsetWidth + gap),
        behavior: 'smooth',
      });
      return;
    }
    offset.current -= direction * (card.offsetWidth + gap);
    if (STEPPING) track.classList.add(STEPPING);
    apply();
  };

  const loop = Array.from({ length: copies }, (_, copy) =>
    sorted.map((item) => ({ item, copy, clone: copy !== Math.floor(copies / 2) })),
  ).flat();

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
            aria-label={t('kiosk.scrollLeft')}
          >
            <Icon name="arrowLeft" size={20} />
          </button>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => step(1)}
            aria-label={t('kiosk.scrollRight')}
          >
            <Icon name="arrowRight" size={20} />
          </button>
        </div>
      </div>

      <div
        className={copies === 1 ? styles.viewportStatic : styles.viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          // Vừa vuốt xong thì nhả tay không tính là chạm chọn thẻ.
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
          }
        }}
      >
        <ul ref={trackRef} className={styles.track}>
          {loop.map(({ item, copy, clone }) => {
            const name = item.product?.name;
            const price = formatPrice(item.pricePerSpray, item.currency, locale);
            return (
              <li key={`${item.slotId}-${copy}`} className={styles.slot} aria-hidden={clone}>
                <button
                  type="button"
                  className={styles.card}
                  disabled={!item.available}
                  tabIndex={clone ? -1 : undefined}
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
    </div>
  );
}

import { useMemo } from 'react';
import type { components } from '@scentstation/contracts';
import { config } from '@/shared/config';
import { formatPrice } from '@/shared/format/price';
import { useI18n } from '@/shared/i18n';
import { Icon } from '@/shared/ui/Icon';
import { ProductImage } from '@/shared/ui/ProductImage';
import styles from './ProductDetailPage.module.css';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

function parseNoteValues(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    return val
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(val)];
}

/**
 * Trang chi tiết toàn màn (FR-ORD-02, FR-ORD-25): ảnh tràn nửa trái; nửa phải là thương hiệu, tên,
 * mô tả, tầng hương, giá rồi khối chỉ dẫn nút bấm ngay trên nút thanh toán — khách đọc điều khoản
 * trước khi có mã QR. Tên, mô tả, tầng hương giữ nguyên như thương hiệu nhập (NFR-USA-07); không có
 * thì không hiện, không bịa thay.
 */
export function ProductDetailPage({
  item,
  onPay,
  onBack,
}: {
  item: KioskCatalogItem;
  onPay: () => void;
  onBack: () => void;
}) {
  const { t, locale } = useI18n();
  const product = item.product;
  const price = formatPrice(item.pricePerSpray, item.currency, locale);

  const notes = useMemo(() => {
    const raw = product?.fragranceNotes;
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as Record<string, unknown>;
    return [
      { label: t('kiosk.topNotes'), values: parseNoteValues(r.top ?? r.Top ?? r.huongDau) },
      {
        label: t('kiosk.heartNotes'),
        values: parseNoteValues(r.heart ?? r.Heart ?? r.middle ?? r.Middle ?? r.huongGiua),
      },
      { label: t('kiosk.baseNotes'), values: parseNoteValues(r.base ?? r.Base ?? r.huongCuoi) },
    ].filter((n) => n.values.length > 0);
  }, [product?.fragranceNotes, t]);

  return (
    <article className={styles.page} aria-labelledby="product-detail-name">
      <ProductImage
        src={product?.imageUrl}
        alt={product?.name ?? t('kiosk.productImageAlt')}
        className={styles.image}
      />

      <div className={styles.info}>
        <button type="button" className={styles.back} onClick={onBack}>
          <Icon name="arrowLeft" size={20} />
          <span>{t('kiosk.backToCatalog')}</span>
        </button>

        <div className={styles.scroll}>
          {item.brandName && <p className={`caps ${styles.brand}`}>{item.brandName}</p>}
          <h1 id="product-detail-name" className={styles.name}>
            {product?.name}
          </h1>
          {product?.description && <p className={styles.desc}>{product.description}</p>}
          {notes.length > 0 && (
            <dl className={styles.notes} aria-label={t('kiosk.fragranceNotes')}>
              {notes.map((n) => (
                <div key={n.label} className={styles.noteRow}>
                  <dt>{n.label}</dt>
                  <dd>{n.values.join(', ')}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {price && (
          <p className={styles.price}>
            {price} <span className={styles.perSpray}>{t('kiosk.perSpray')}</span>
          </p>
        )}

        {/* FR-ORD-25: số nút và số giây (DISPENSE_PRESS_WINDOW_SEC) hiện TRƯỚC khi có mã QR. */}
        <div className={styles.guide}>
          <span className={styles.buttonNo} aria-hidden="true">
            {item.slotNumber}
          </span>
          <div>
            <p className={styles.guideText}>
              {t('kiosk.pressGuide', { slot: item.slotNumber, seconds: config.pressWindowSec })}
            </p>
            <p className={styles.guideNote}>{t('kiosk.pressNoRefund')}</p>
          </div>
        </div>

        <button type="button" className={styles.pay} onClick={onPay}>
          {t('kiosk.payAmount', { price })}
        </button>
      </div>
    </article>
  );
}

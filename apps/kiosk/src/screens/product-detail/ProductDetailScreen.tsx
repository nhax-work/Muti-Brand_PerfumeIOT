import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useKioskCatalog } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import styles from './ProductDetailScreen.module.css';

function formatPrice(amount: string | null | undefined, currency: string): string {
  if (!amount) return '';
  const num = Number(amount);
  if (Number.isNaN(num)) return `${amount} ${currency}`;
  return `${new Intl.NumberFormat('vi-VN').format(num)} ${currency}`;
}

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
 * Màn hình chi tiết sản phẩm khi chọn slot trên kiosk (FR-ORD-02).
 *
 * Hiển thị đầy đủ: tên nước hoa, thương hiệu, hình ảnh chất lượng cao,
 * mô tả mùi hương, các tầng nốt hương, và giá tiền một lượt xịt kể cả khi
 * sản phẩm đã bán hết (hiển thị nhãn Bán hết góc trái).
 */
export default function ProductDetailScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { slotNumber } = useParams<{ slotNumber: string }>();
  const catalog = useKioskCatalog();

  const item = useMemo(() => {
    const items = catalog.data?.items ?? [];
    return items.find((i) => String(i.slotNumber) === slotNumber);
  }, [catalog.data?.items, slotNumber]);

  const product = item?.product;
  const isAvailable = Boolean(item?.available);

  // Phân tích các tầng hương (top, heart/middle, base)
  const notes = useMemo(() => {
    if (!product?.fragranceNotes || typeof product.fragranceNotes !== 'object') {
      return null;
    }
    const raw = product.fragranceNotes as Record<string, unknown>;

    const top = parseNoteValues(raw.top ?? raw.Top ?? raw.huongDau);
    const heart = parseNoteValues(raw.heart ?? raw.Heart ?? raw.middle ?? raw.Middle ?? raw.huongGiua);
    const base = parseNoteValues(raw.base ?? raw.Base ?? raw.huongCuoi);

    const standardKeys = new Set([
      'top',
      'Top',
      'huongDau',
      'heart',
      'Heart',
      'middle',
      'Middle',
      'huongGiua',
      'base',
      'Base',
      'huongCuoi',
    ]);
    const others = Object.entries(raw)
      .filter(([key]) => !standardKeys.has(key))
      .map(([key, val]) => ({
        label: key,
        values: parseNoteValues(val),
      }))
      .filter((entry) => entry.values.length > 0);

    const hasAny = top.length > 0 || heart.length > 0 || base.length > 0 || others.length > 0;
    if (!hasAny) return null;

    return { top, heart, base, others };
  }, [product?.fragranceNotes]);

  // Chỉ hiển thị not found khi slotNumber hoàn toàn không tồn tại hoặc không có thông tin sản phẩm
  if (!item || !product) {
    return (
      <section className={styles.detail}>
        <div className={styles.emptyState}>
          <h1 className={styles.emptyTitle}>{t('kiosk.productNotFound')}</h1>
          <p className={styles.emptySubtitle}>{t('kiosk.productUnavailable')}</p>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => void navigate('/catalog')}
          >
            {t('kiosk.backToCatalog')}
          </button>
        </div>
      </section>
    );
  }

  const priceText = formatPrice(item.pricePerSpray, item.currency);

  return (
    <section className={styles.detail} aria-label={product.name}>
      <div className={styles.content}>
        <div className={styles.imageColumn}>
          <div className={styles.imageWrapper}>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className={styles.productImage} />
            ) : (
              <div className={styles.placeholderImage}>
                <span className={styles.placeholderIcon} aria-hidden="true">
                  ✨
                </span>
                <span>ScentStation</span>
              </div>
            )}
            {!isAvailable && (
              <span className={styles.soldOutBadge}>{t('kiosk.outOfStock')}</span>
            )}
          </div>
        </div>

        <div className={styles.infoColumn}>
          <div className={styles.headerSection}>
            {item.brandName && <span className={styles.brandName}>{item.brandName}</span>}
            <h1 className={styles.productName}>{product.name}</h1>
          </div>

          <div className={styles.priceBox}>
            <span className={styles.priceLabel}>{t('kiosk.priceLabel')}</span>
            <span className={styles.priceAmount}>
              {priceText ? t('kiosk.pricePerSpray', { price: priceText }) : ''}
            </span>
          </div>

          {product.description && (
            <div className={styles.descriptionSection}>
              <p className={styles.descriptionText}>{product.description}</p>
            </div>
          )}

          {notes && (
            <div className={styles.notesSection}>
              <h2 className={styles.notesTitle}>
                <span aria-hidden="true">🌿</span>
                <span>{t('kiosk.fragranceNotes')}</span>
              </h2>
              <div className={styles.notesList}>
                {notes.top.length > 0 && (
                  <div className={styles.noteItem}>
                    <span className={styles.noteLevel}>🍋 {t('kiosk.topNotes')}</span>
                    <div className={styles.noteChips}>
                      {notes.top.map((n) => (
                        <span key={n} className={styles.noteChip}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {notes.heart.length > 0 && (
                  <div className={styles.noteItem}>
                    <span className={styles.noteLevel}>🌹 {t('kiosk.heartNotes')}</span>
                    <div className={styles.noteChips}>
                      {notes.heart.map((n) => (
                        <span key={n} className={styles.noteChip}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {notes.base.length > 0 && (
                  <div className={styles.noteItem}>
                    <span className={styles.noteLevel}>🪵 {t('kiosk.baseNotes')}</span>
                    <div className={styles.noteChips}>
                      {notes.base.map((n) => (
                        <span key={n} className={styles.noteChip}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {notes.others.map((entry) => (
                  <div key={entry.label} className={styles.noteItem}>
                    <span className={styles.noteLevel}>{entry.label}</span>
                    <div className={styles.noteChips}>
                      {entry.values.map((v) => (
                        <span key={v} className={styles.noteChip}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button
              id="kiosk-spray-button"
              type="button"
              className={`${styles.actionButton} ${!isAvailable ? styles.actionButtonDisabled : ''}`}
              onClick={() => {
                if (isAvailable) {
                  void navigate(`/checkout/${item.slotNumber}`);
                }
              }}
              disabled={!isAvailable}
            >
              <span>{isAvailable ? t('kiosk.sprayExperience') : t('kiosk.outOfStock')}</span>
              {isAvailable && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

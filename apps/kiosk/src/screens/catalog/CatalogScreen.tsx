import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { components } from '@scentstation/contracts';
import { recordKioskInteraction, useKioskCatalog } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import styles from './CatalogScreen.module.css';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

function formatPrice(amount: string | null | undefined, currency: string): string {
  if (!amount) return '';
  const num = Number(amount);
  if (Number.isNaN(num)) return `${amount} ${currency}`;
  return `${new Intl.NumberFormat('vi-VN').format(num)} ${currency}`;
}

/**
 * Màn hình danh mục sản phẩm kiosk đa thương hiệu (FR-ORD-01, FR-ORD-03).
 *
 * Hiển thị mọi slot khả dụng kèm thương hiệu và cho phép lọc theo thương hiệu.
 * Slot không khả dụng hiển thị mờ kèm nhãn Tạm hết (FR-ORD-01 AC2).
 */
export default function CatalogScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const catalog = useKioskCatalog();
  const { kioskSessionId } = useKioskSession();
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  const reportedImpressionsRef = useRef<Set<string>>(new Set());

  const items = useMemo(() => catalog.data?.items ?? [], [catalog.data?.items]);

  // Ghi nhận lượt xem sản phẩm (FR-RPT-06, BR-007)
  useEffect(() => {
    if (items.length === 0) return;
    for (const item of items) {
      if (item.available && !reportedImpressionsRef.current.has(item.slotId)) {
        reportedImpressionsRef.current.add(item.slotId);
        recordKioskInteraction({
          eventType: 'PRODUCT_IMPRESSION',
          slotId: item.slotId,
          kioskSessionId,
        });
      }
    }
  }, [items, kioskSessionId]);

  // Danh sách các thương hiệu có trên máy
  const brandNames = useMemo(() => {
    const brands = new Set<string>();
    for (const item of items) {
      if (item.brandName) {
        brands.add(item.brandName);
      }
    }
    return Array.from(brands).sort();
  }, [items]);

  // Danh sách hiển thị theo bộ lọc thương hiệu
  const displayedItems = useMemo(() => {
    if (!selectedBrand) return items;
    return items.filter((item) => item.brandName === selectedBrand);
  }, [items, selectedBrand]);

  const handleSelectItem = (item: KioskCatalogItem) => {
    if (!item.available) return;
    recordKioskInteraction({
      eventType: 'PRODUCT_SELECTED',
      slotId: item.slotId,
      kioskSessionId,
    });
    void navigate(`/products/${item.slotNumber}`);
  };

  return (
    <section className={styles.catalog} aria-label={t('kiosk.catalogTitle')}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.homeButton}
          onClick={() => void navigate('/')}
          aria-label={t('kiosk.backToHome')}
        >
          ← {t('kiosk.backToHome')}
        </button>
      </div>

      <div className={styles.headerText}>
        <h1 className={styles.title}>{t('kiosk.catalogTitle')}</h1>
        <p className={styles.subtitle}>{t('kiosk.catalogSubtitle')}</p>
      </div>

      {brandNames.length > 0 && (
        <nav className={styles.filterBar} aria-label={t('kiosk.brandLabel')}>
          <button
            type="button"
            className={`${styles.brandChip} ${selectedBrand === null ? styles.brandChipActive : ''}`}
            onClick={() => setSelectedBrand(null)}
            aria-pressed={selectedBrand === null}
          >
            {t('kiosk.allBrands')}
          </button>
          {brandNames.map((brand) => (
            <button
              key={brand}
              type="button"
              className={`${styles.brandChip} ${selectedBrand === brand ? styles.brandChipActive : ''}`}
              onClick={() => setSelectedBrand(brand)}
              aria-pressed={selectedBrand === brand}
            >
              {brand}
            </button>
          ))}
        </nav>
      )}

      {displayedItems.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{t('kiosk.emptyCatalog')}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {displayedItems.map((item) => {
            const isAvailable = item.available;
            const priceText = formatPrice(item.pricePerSpray, item.currency);

            return (
              <article
                key={item.slotId}
                className={`${styles.card} ${isAvailable ? styles.cardAvailable : styles.cardUnavailable}`}
                onClick={() => handleSelectItem(item)}
                aria-disabled={!isAvailable}
                tabIndex={isAvailable ? 0 : -1}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectItem(item);
                  }
                }}
              >
                <div className={styles.imageContainer}>
                  {item.product?.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className={styles.productImage}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.placeholderImage}>
                      <span className={styles.placeholderIcon} aria-hidden="true">
                        ✨
                      </span>
                      <span>ScentStation</span>
                    </div>
                  )}

                  <span className={styles.slotBadge}>
                    {t('kiosk.slotNumber', { slot: item.slotNumber })}
                  </span>

                  {!isAvailable && (
                    <span className={styles.outOfStockBadge}>{t('kiosk.outOfStock')}</span>
                  )}
                </div>

                <div className={styles.cardContent}>
                  {item.brandName && <h2 className={styles.brandName}>{item.brandName}</h2>}
                  <h3 className={styles.productName}>
                    {item.product?.name ?? t('kiosk.outOfStock')}
                  </h3>

                  <div className={styles.cardFooter}>
                    <span className={styles.priceTag}>
                      {isAvailable && priceText
                        ? t('kiosk.pricePerSpray', { price: priceText })
                        : t('kiosk.outOfStock')}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

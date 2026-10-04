import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useKioskCatalog } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import styles from './HomeScreen.module.css';

interface CarouselProduct {
  slotNumber: number;
  available: boolean;
  brandName: string;
  name: string;
  imageUrl?: string | null;
  priceText: string;
}

function formatPrice(amount: string | null | undefined, currency = 'VND'): string {
  if (!amount) return '';
  const num = Number(amount);
  if (Number.isNaN(num)) return `${amount} ${currency}`;
  return `${new Intl.NumberFormat('vi-VN').format(num)} ${currency}`;
}

const FALLBACK_PRODUCTS: CarouselProduct[] = [
  {
    slotNumber: 1,
    available: false,
    brandName: 'Maison Aurore',
    name: 'Aurore Matinale',
    priceText: '35.000 VND',
  },
  {
    slotNumber: 2,
    available: true,
    brandName: 'Maison Aurore',
    name: 'Aurore Nocturne',
    priceText: '42.000 VND',
  },
  {
    slotNumber: 3,
    available: true,
    brandName: 'Nhà Hương Việt',
    name: 'Hương Sen Đồng Tháp',
    priceText: '28.000 VND',
  },
  {
    slotNumber: 4,
    available: true,
    brandName: 'Nhà Hương Việt',
    name: 'Hương Quế Trà Bồng',
    priceText: '50.000 VND',
  },
  {
    slotNumber: 5,
    available: true,
    brandName: 'Nhà Hương Việt',
    name: 'Trầm Hương Khánh Hòa',
    priceText: '55.000 VND',
  },
];

/**
 * Màn hình chờ Kiosk / Tablet cảm ứng (Attract Screen).
 *
 * Tính năng nổi bật:
 * - Băng chuyền 5 slot nước hoa chuyển động mượt mà tuần hoàn vô tận từ phải sang trái.
 * - Hỗ trợ chạm & vuốt cảm ứng đa điểm (Touch / Swipe): vuốt từ trái sang phải hoặc từ phải sang trái tự do.
 * - Phân biệt thông minh giữa thao tác vuốt (xem sản phẩm) và chạm (chuyển sang /catalog).
 */
export default function HomeScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const catalog = useKioskCatalog();

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const offsetRef = useRef<number>(0);
  const cycleWidthRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const hasSwipedRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);

  const products = useMemo<CarouselProduct[]>(() => {
    const rawItems = catalog.data?.items ?? [];
    const validItems = rawItems
      .filter((item) => item.product?.name)
      .slice(0, 5)
      .map((item) => ({
        slotNumber: item.slotNumber,
        available: item.available,
        brandName: item.brandName ?? 'ScentStation',
        name: item.product?.name ?? '',
        imageUrl: item.product?.imageUrl,
        priceText: formatPrice(item.pricePerSpray, item.currency),
      }));

    if (validItems.length >= 1) {
      while (validItems.length < 5) {
        validItems.push(...validItems.slice(0, 5 - validItems.length));
      }
      return validItems.slice(0, 5);
    }
    return FALLBACK_PRODUCTS;
  }, [catalog.data?.items]);

  // Nhân 3 danh sách để vuốt sang trái hay sang phải đều tuần hoàn liền mạch không khuyết thẻ
  const loopProducts = useMemo(() => [...products, ...products, ...products], [products]);

  // Đo chiều rộng 1 chu kỳ 5 sản phẩm
  useEffect(() => {
    function measureCycle() {
      if (trackRef.current) {
        cycleWidthRef.current = trackRef.current.scrollWidth / 3;
      }
    }
    measureCycle();
    window.addEventListener('resize', measureCycle);
    return () => window.removeEventListener('resize', measureCycle);
  }, [loopProducts]);

  // Animation tự động trôi từ phải sang trái (60fps)
  useEffect(() => {
    let animId: number;
    const speed = 0.75; // pixel mỗi frame

    function animate() {
      if (!isDraggingRef.current && !isPausedRef.current && trackRef.current) {
        offsetRef.current += speed;
        const cycle = cycleWidthRef.current;
        if (cycle > 0) {
          if (offsetRef.current >= cycle * 2) {
            offsetRef.current -= cycle;
          } else if (offsetRef.current < cycle) {
            offsetRef.current += cycle;
          }
        }
        trackRef.current.style.transform = `translate3d(-${offsetRef.current}px, 0, 0)`;
      }
      animId = requestAnimationFrame(animate);
    }

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    hasSwipedRef.current = false;
    startXRef.current = e.clientX;
    startOffsetRef.current = offsetRef.current;
    isPausedRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !trackRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    if (Math.abs(deltaX) > 8) {
      hasSwipedRef.current = true;
    }

    let newOffset = startOffsetRef.current - deltaX;
    const cycle = cycleWidthRef.current;
    if (cycle > 0) {
      while (newOffset >= cycle * 2) newOffset -= cycle;
      while (newOffset < cycle) newOffset += cycle;
    }

    offsetRef.current = newOffset;
    trackRef.current.style.transform = `translate3d(-${newOffset}px, 0, 0)`;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Bỏ qua nếu pointer capture đã giải phóng
    }

    // Nếu người dùng chỉ chạm nhẹ mà không vuốt -> điều hướng vào danh mục
    if (!hasSwipedRef.current) {
      void navigate('/catalog');
      return;
    }

    // Nếu là thao tác vuốt: cho dừng lại 1 giây rồi tiếp tục trôi tự động
    setTimeout(() => {
      isPausedRef.current = false;
    }, 1000);
  };

  const handlePointerCancel = () => {
    isDraggingRef.current = false;
    isPausedRef.current = false;
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    // Nếu click vào các nút tương tác riêng hoặc thanh header thì không làm gì
    if (containerRef.current?.contains(e.target as Node)) {
      return;
    }
    void navigate('/catalog');
  };

  return (
    <section
      className={styles.home}
      aria-label="ScentStation Kiosk Attract Screen"
      onClick={handleBackgroundClick}
      role="region"
    >
      <header className={styles.brandHeader}>
        <h2 className={styles.brandLogo}>SCENTSTATION</h2>
        <p className={styles.brandTagline}>SMART PERFUME EXPERIENCE</p>
      </header>

      <div className={styles.introSection}>
        <h1 className={styles.title}>{t('kiosk.welcome')}</h1>
        <p className={styles.subtitle}>{t('kiosk.homeSubtitle')}</p>
      </div>

      {/* Băng chuyền cảm ứng: Vuốt trái / phải hoặc chạm để chọn */}
      <div
        ref={containerRef}
        className={styles.carouselContainer}
        aria-label="Dải 5 sản phẩm nước hoa vuốt cảm ứng"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div ref={trackRef} className={styles.carouselTrack}>
          {loopProducts.map((p, idx) => (
            <article
              key={`${p.slotNumber}-${idx}`}
              className={`${styles.perfumeCard} ${!p.available ? styles.perfumeCardSoldOut : ''}`}
            >
              <div className={styles.cardGlow} />
              <div className={styles.cardImageContainer}>
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className={styles.productImage}
                    draggable={false}
                  />
                ) : (
                  <div className={styles.imagePlaceholder}>
                    <span className={styles.sparkleIcon}>✨</span>
                    <span className={styles.bottleIcon}>🌸</span>
                  </div>
                )}
                {!p.available && (
                  <span className={styles.soldOutBadge}>{t('kiosk.outOfStock')}</span>
                )}
              </div>

              <div className={styles.cardInfo}>
                <span className={styles.cardBrand}>{p.brandName}</span>
                <h3 className={styles.cardName}>{p.name}</h3>
                {p.priceText && (
                  <div className={styles.cardPriceRow}>
                    <span className={styles.cardPrice}>{p.priceText}</span>
                    <span className={styles.sprayUnit}>/ lượt xịt</span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.actionSection}>
        <button
          type="button"
          className={styles.startBadge}
          onClick={(e) => {
            e.stopPropagation();
            void navigate('/catalog');
          }}
          aria-label={t('kiosk.tapToStart')}
        >
          <span className={styles.pulseDot} />
          <span>{t('kiosk.tapToStart')}</span>
          <span className={styles.startIcon} aria-hidden="true">
            ✨
          </span>
        </button>
        <p className={styles.touchHint}>
          👈 Vuốt sang trái / phải để xem hoặc chạm bất kỳ đâu để trải nghiệm 👉
        </p>
      </div>

      <footer className={styles.featuresFooter}>
        <div className={styles.featureItem}>
          <span className={styles.featureDot}>✦</span>
          <span>{t('kiosk.featureAuthentic')}</span>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.featureDot}>✦</span>
          <span>{t('kiosk.featureFineMist')}</span>
        </div>
        <div className={styles.featureItem}>
          <span className={styles.featureDot}>✦</span>
          <span>{t('kiosk.featureQrPay')}</span>
        </div>
      </footer>
    </section>
  );
}

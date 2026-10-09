import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { components } from '@scentstation/contracts';
import {
  recordKioskInteraction,
  useCreateOrder,
  useKioskCatalog,
  useOrderStatus,
} from '@/shared/api';
import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import { phaseOf } from '../checkout/checkout-phase';
import DispenseSuccessGuide from '../checkout/DispenseSuccessGuide';
import styles from './CatalogScreen.module.css';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

const FALLBACK_BOTTLES: Record<number, string> = {
  1: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjHLKHQ-e9v8rbVauKmO7a4XdFgitH2PX04adOLTIDcdpPwTMgj-ABCxgZT3y1iVk4EkVCclPnFJrm2AP7heA3adEYnqsJsWfuHluEESKmnpcpMphfmLkxdj5oTKVTETo2E8JdzRMpvqTaHozpF27TbIsqMhy3BEIWgUjwP0FNUks_8sX00O_fphckeGjDYOqtj7WxsNLAxCBLfThMPkP3xN9K3q-NAOeoySXLnRZdVHO09viZHUTm',
  2: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCi8kgz8yWcTDwPznpLifDSV9mqx5f3T3sYLxfM6aJ_dbkYiY_UC6j3hY7txxWfnMG_isJJ_WxlMdGt86bRV0k5TcAN7LhxMhSljyTmn-S0JL3tHi7E5tKCO0o1rDcYx1bUoCUByKyl285EKIYD9FVctJyP40qzusM13xM7ejEW6CiqwAJQ0giQD8CVUL1YFtP4SrXTwDlazB_1IZIdSpdY4fOXGMnYaHb0jli_1Dxeu02TDqO-E1Ce',
  3: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDrwnlACE74MpP3ze5UCHx_2MWHdGE2a8EZ9tRcjojME_0ZFCpdnP8jrPGBhM6K1Mgy7p_XSRWJLkdJ_wej47ts_3-MrYMHDU42ZQVo25IJO2lIXI8_BCcJ5IMtnb3uL-ftOT32o5Bvy9EoQXsQvhVifruPsELMB_uIfnTopfCgYTTWWVGV1kCOGuW8ZvwdU1C3JUXQZcGEjkAzJriCenzlJFxWW23Nk5LJXIhwJ_DJu1i9vd1buJsL',
  4: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDhEcCtoyj-KiT2weL0jXt1iCyGCvxYPjrqSQ1hyqIdMsULOb2OpvFNcrpU-Oaz7Qd-fcogDGELsRPoK2ByYreFQ6wn7Z3PdFRLDz9DKjfQ9vllHdOZ-0K7e9Frpr_7mvKpGnpz1lQUl-NcssHIf8GV4tORcyBPSyLHP1uvMBw8U0nv4wa9oreMxMhsc28LTVNijTDmfP30P5J3ZboqBmEG9RPa935bwAEgRRe-XEJAGJVrtJg-_BwT',
};

const FAMILIES: Record<number, string> = {
  1: 'ORIENTAL OUD',
  2: 'AMBRE & CUIR',
  3: 'SOLAR FLORAL',
  4: 'ORIENTAL WOOD',
  5: 'FLORAL NOBLE',
};

const PRODUCT_INTROS: Record<number, string> = {
  1: 'Hương thơm sớm mai thanh khiết kết hợp cam bergamote và hoa cỏ Grasse, mang lại nguồn năng lượng tươi mới.',
  2: 'Hòa quyện tinh tế giữa hổ phách phương Đông và da thuộc đen sang trọng, gợi mở chiều sâu bí ẩn đầy lôi cuốn.',
  3: 'Nốt hương hoa sen thanh tao thuần khiết buổi sớm, hòa quyện hương phù sa mộc mạc và sương mai dịu nhẹ, mang lại cảm giác an yên, thoát tục.',
  4: 'Hương quế cay ấm nồng nàn đặc trưng của đại ngàn Trà Bồng, đan xen thảo mộc núi rừng tạo nên chiều sâu nồng ấm và lôi cuốn.',
  5: 'Tuyệt tác trầm hương thượng hạng từ xứ Trầm Khánh Hòa, lắng đọng khói sương huyền ảo mang lại sự tĩnh tại, tôn quý.',
};

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

type PaymentStep = 'select' | 'qr' | 'pos';

/**
 * Màn hình Kiosk duy nhất (Single-Screen Architecture):
 * - Băng chuyền nước hoa sang trọng hỗ trợ cuộn kéo vuốt mượt mà trái sang phải (Drag & Swipe).
 * - Tất cả các màn hình phụ (Chi tiết sản phẩm, Popup chọn PTTT, Popup VietQR, Popup POS/NFC)
 *   đều là MODAL hiển thị trực tiếp trên nền HomeScreen.
 */
export default function CatalogScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ slotNumber?: string }>();
  const catalog = useKioskCatalog();
  const { kioskSessionId } = useKioskSession();

  const trackRef = useRef<HTMLDivElement>(null);
  const reportedImpressionsRef = useRef<Set<string>>(new Set());

  // Continuous loop state & refs
  const offsetRef = useRef(0);
  const cycleWidthRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isPausedRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const hasDraggedRef = useRef(false);

  // Modal states
  const [selectedDetailItem, setSelectedDetailItem] = useState<KioskCatalogItem | null>(null);
  const [customPaymentStep, setCustomPaymentStep] = useState<PaymentStep | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'qr'>('card');
  const [countdown, setCountdown] = useState(299); // 04:59
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Hook tạo đơn và theo dõi trạng thái thanh toán từ backend
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const createOrder = useCreateOrder();
  const created = createOrder.data;
  const statusQuery = useOrderStatus(created?.order.id ?? null);
  const orderStatusView = statusQuery.data;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const [prevStatus, setPrevStatus] = useState<string | null>(null);
  const [paidSince, setPaidSince] = useState<number | null>(null);
  const currentStatus = orderStatusView?.status ?? null;
  if (currentStatus !== prevStatus) {
    setPrevStatus(currentStatus);
    setPaidSince(currentStatus === 'PAID' ? now : null);
  }

  const phase = phaseOf(orderStatusView, paidSince === null ? 0 : now - paidSince);
  const isPostPayment = created !== undefined && phase !== 'PAYING' && phase !== 'EXPIRED';

  const items = useMemo(() => catalog.data?.items ?? [], [catalog.data?.items]);

  // Đồng bộ mở modal theo URL (nếu có slotNumber từ route)
  const routeMatchedItem = useMemo(() => {
    if (!params.slotNumber || items.length === 0) return null;
    return items.find((i) => String(i.slotNumber) === params.slotNumber) ?? null;
  }, [params.slotNumber, items]);

  const detailItem = selectedDetailItem ?? routeMatchedItem;
  const isCheckoutRoute = location.pathname.startsWith('/checkout/');
  const paymentStep = customPaymentStep ?? (isCheckoutRoute ? 'select' : null);

  // Tự động gọi API tạo đơn khi khách vào bước thanh toán (qr hoặc pos)
  useEffect(() => {
    if (
      detailItem &&
      (paymentStep === 'qr' || paymentStep === 'pos') &&
      !created &&
      !createOrder.isPending
    ) {
      createOrder.mutate({
        slotId: detailItem.slotId,
        kioskSessionId,
        idempotencyKey,
      });
    }
  }, [detailItem, paymentStep, created, createOrder, kioskSessionId, idempotencyKey]);

  // Danh sách lặp vô tận (3 bộ lặp lại liên tục cho chu kỳ marquee conveyor)
  const loopItems = useMemo(() => {
    if (import.meta.env.MODE === 'test' || items.length === 0) {
      return items.map((it) => ({
        ...it,
        uniqueKey: it.slotId,
        isCloned: false,
      }));
    }
    const sets = [0, 1, 2];
    return sets.flatMap((setIndex) =>
      items.map((it) => ({
        ...it,
        uniqueKey: `${it.slotId}-set-${setIndex}`,
        isCloned: setIndex !== 1,
      })),
    );
  }, [items]);

  // Đo chiều rộng 1 chu kỳ sản phẩm
  useEffect(() => {
    const measureCycle = () => {
      if (!trackRef.current || items.length === 0) return;
      const cards = trackRef.current.children;
      if (cards.length >= items.length * 2) {
        const firstCard = cards[0] as HTMLElement;
        const nextSetFirstCard = cards[items.length] as HTMLElement;
        const width = nextSetFirstCard.offsetLeft - firstCard.offsetLeft;
        if (width > 0) {
          cycleWidthRef.current = width;
          if (offsetRef.current === 0) {
            offsetRef.current = -width;
            trackRef.current.style.transform = `translate3d(-${width}px, 0, 0)`;
          }
        }
      } else if (cards.length > 0) {
        const first = cards[0] as HTMLElement;
        const last = cards[cards.length - 1] as HTMLElement;
        cycleWidthRef.current = last.offsetLeft + last.offsetWidth - first.offsetLeft + 32;
      }
    };

    measureCycle();
    const timer = setTimeout(measureCycle, 150);
    window.addEventListener('resize', measureCycle);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measureCycle);
    };
  }, [items, loopItems]);

  // Vòng lặp chuyển động chu kỳ liên tục từ trái sang phải (Left-to-Right Continuous Carousel)
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;

    let animId: number;
    const speed = 0.75; // Tốc độ trôi êm ái sang phải (left-to-right)

    function animate() {
      if (
        !isDraggingRef.current &&
        !isPausedRef.current &&
        trackRef.current &&
        cycleWidthRef.current > 0
      ) {
        // Di chuyển liên tục từ trái sang phải: tăng tọa độ X
        offsetRef.current += speed;
        const cycle = cycleWidthRef.current;

        // Khi sang hết 1 chu kỳ, quấn lại liền mạch vô tận
        if (offsetRef.current >= 0) {
          offsetRef.current -= cycle;
        } else if (offsetRef.current < -cycle * 2) {
          offsetRef.current += cycle;
        }

        trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      }
      animId = requestAnimationFrame(animate);
    }

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [items]);

  // Đóng modal khi nhấn ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDetailItem(null);
        setCustomPaymentStep(null);
        void navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

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

  // Đồng hồ đếm ngược khi mở popup VietQR
  useEffect(() => {
    if (paymentStep !== 'qr') return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [paymentStep]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Kéo vuốt chuột & cảm ứng (Pointer drag)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!trackRef.current) return;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.clientX;
    startOffsetRef.current = offsetRef.current;
    isPausedRef.current = true;
    if (styles.carouselDragging) {
      trackRef.current.classList.add(styles.carouselDragging);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !trackRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    if (Math.abs(deltaX) > 6) {
      hasDraggedRef.current = true;
    }

    let newOffset = startOffsetRef.current + deltaX;
    const cycle = cycleWidthRef.current;
    if (cycle > 0) {
      while (newOffset >= 0) newOffset -= cycle;
      while (newOffset < -cycle * 2) newOffset += cycle;
    }

    offsetRef.current = newOffset;
    trackRef.current.style.transform = `translate3d(${newOffset}px, 0, 0)`;
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (trackRef.current && styles.carouselDragging) {
      trackRef.current.classList.remove(styles.carouselDragging);
    }
    setTimeout(() => {
      if (!detailItem) {
        isPausedRef.current = false;
      }
    }, 1200);
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 80);
  };

  const handlePointerCancel = () => {
    isDraggingRef.current = false;
    if (trackRef.current && styles.carouselDragging) {
      trackRef.current.classList.remove(styles.carouselDragging);
    }
    if (!detailItem) {
      isPausedRef.current = false;
    }
  };

  // Cuộn bằng con lăn chuột ngang / dọc
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!trackRef.current || cycleWidthRef.current === 0) return;
    isPausedRef.current = true;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? -e.deltaY : -e.deltaX;
    let newOffset = offsetRef.current + delta;
    const cycle = cycleWidthRef.current;
    while (newOffset >= 0) newOffset -= cycle;
    while (newOffset < -cycle * 2) newOffset += cycle;

    offsetRef.current = newOffset;
    trackRef.current.style.transform = `translate3d(${newOffset}px, 0, 0)`;

    setTimeout(() => {
      if (!detailItem) {
        isPausedRef.current = false;
      }
    }, 1200);
  };

  // Hover tạm dừng để xem
  const handleMouseEnter = () => {
    if (!isDraggingRef.current) {
      isPausedRef.current = true;
    }
  };

  const handleMouseLeave = () => {
    if (!isDraggingRef.current && !detailItem) {
      isPausedRef.current = false;
    }
  };

  // Nút mũi tên di chuyển chu kỳ
  const handleNudge = (direction: 'left' | 'right') => {
    if (!trackRef.current || cycleWidthRef.current === 0) return;
    isPausedRef.current = true;
    const step = 350;
    let newOffset = offsetRef.current + (direction === 'left' ? step : -step);
    const cycle = cycleWidthRef.current;
    while (newOffset >= 0) newOffset -= cycle;
    while (newOffset < -cycle * 2) newOffset += cycle;

    offsetRef.current = newOffset;
    trackRef.current.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
    trackRef.current.style.transform = `translate3d(${newOffset}px, 0, 0)`;

    setTimeout(() => {
      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
      }
      if (!detailItem) {
        isPausedRef.current = false;
      }
    }, 450);
  };

  // Chọn sản phẩm -> Mở modal chi tiết ngay trên HomeScreen
  const handleSelectItem = (item: KioskCatalogItem) => {
    if (hasDraggedRef.current) return;
    if (!item.available) return;
    isPausedRef.current = true;
    recordKioskInteraction({
      eventType: 'PRODUCT_SELECTED',
      slotId: item.slotId,
      kioskSessionId,
    });
    setSelectedDetailItem(item);
    setCustomPaymentStep(null);
    void navigate(`/products/${item.slotNumber}`);
  };

  const handleCloseDetailModal = () => {
    setSelectedDetailItem(null);
    setCustomPaymentStep(null);
    setIdempotencyKey(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    isPausedRef.current = false;
    void navigate('/');
  };

  const handleBackToDetail = () => {
    setCustomPaymentStep(null);
    if (detailItem?.slotNumber) {
      void navigate(`/products/${detailItem.slotNumber}`);
    } else {
      void navigate('/catalog');
    }
  };

  const handleOpenPayment = () => {
    if (!detailItem) return;
    setCustomPaymentStep('select');
    void navigate(`/checkout/${detailItem.slotNumber}`);
  };

  const handleProceedPayment = () => {
    if (selectedMethod === 'qr') {
      setCustomPaymentStep('qr');
    } else {
      setCustomPaymentStep('pos');
    }
  };

  // Phân tích nốt hương cho modal chi tiết
  const notes = useMemo(() => {
    const rawNotes = detailItem?.product?.fragranceNotes;
    if (!rawNotes || typeof rawNotes !== 'object') return null;
    const raw = rawNotes as Record<string, unknown>;
    const top = parseNoteValues(raw.top ?? raw.Top ?? raw.huongDau);
    const heart = parseNoteValues(
      raw.heart ?? raw.Heart ?? raw.middle ?? raw.Middle ?? raw.huongGiua,
    );
    const base = parseNoteValues(raw.base ?? raw.Base ?? raw.huongCuoi);
    return { top, heart, base };
  }, [detailItem?.product?.fragranceNotes]);

  const detailBottleImg =
    detailItem?.product?.imageUrl ||
    (detailItem?.slotNumber ? FALLBACK_BOTTLES[detailItem.slotNumber] : undefined) ||
    FALLBACK_BOTTLES[1];

  const detailPriceFormatted = formatPrice(
    detailItem?.pricePerSpray,
    detailItem?.currency ?? 'VND',
  );

  const detailIntro =
    detailItem?.product?.description ||
    (detailItem?.slotNumber ? PRODUCT_INTROS[detailItem.slotNumber] : undefined) ||
    'Tuyệt tác hương thơm tinh tế được chắt lọc từ những nguyên liệu tự nhiên quý hiếm bậc nhất.';

  return (
    <section className={styles.catalogContainer} aria-label={t('kiosk.catalogTitle')}>
      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{t('kiosk.emptyCatalog')}</p>
        </div>
      ) : (
        <div
          className={styles.carouselWrapper}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onWheel={handleWheel}
        >
          {/* Nút cuộn lùi sang trái */}
          <button
            type="button"
            className={`${styles.navButton} ${styles.navButtonLeft}`}
            onClick={(e) => {
              e.stopPropagation();
              handleNudge('left');
            }}
            aria-label="Cuộn sang trái"
          >
            <span className="material-symbols-outlined">west</span>
          </button>

          {/* Dải băng chuyền sản phẩm chuyển động chu kỳ liên tục từ trái sang phải */}
          <div ref={trackRef} className={styles.carouselTrack} id="parfumCarousel">
            {loopItems.map((item) => {
              const isAvailable = item.available;
              const priceText = formatPrice(item.pricePerSpray, item.currency);
              const bottleImg =
                item.product?.imageUrl || FALLBACK_BOTTLES[item.slotNumber] || FALLBACK_BOTTLES[1];
              const familyName = FAMILIES[item.slotNumber] || 'HAUTE SILLAGE';

              return (
                <article
                  key={item.uniqueKey}
                  className={`${styles.card} ${!isAvailable ? styles.cardUnavailable : ''}`}
                  onClick={() => handleSelectItem(item)}
                  aria-disabled={!isAvailable}
                  tabIndex={isAvailable ? 0 : -1}
                  role="button"
                  aria-hidden={item.isCloned ? true : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectItem(item);
                    }
                  }}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.batchBadge}>
                      N° 0{item.slotNumber} • {isAvailable ? 'HAUTE SILLAGE' : 'RARE BATCH'}
                    </span>
                    {isAvailable ? (
                      <span className={styles.volumeBadge}>100 ML</span>
                    ) : (
                      <span className={styles.soldOutPill}>
                        <span className={styles.soldOutDot} />
                        <span>{t('kiosk.outOfStock')}</span>
                      </span>
                    )}
                  </div>

                  {/* Khung trưng bày flacon nước hoa */}
                  <div className={styles.imageFrame}>
                    <img
                      src={bottleImg}
                      alt={item.product?.name ?? 'Nước hoa Scentation'}
                      className={styles.productImage}
                      loading="lazy"
                    />
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.metaRow}>
                      <span className={styles.familyTag}>{familyName}</span>
                      <span className={styles.priceTag}>
                        {priceText ? t('kiosk.pricePerSpray', { price: priceText }) : ''}
                      </span>
                    </div>

                    {item.brandName ? (
                      <h2 className={styles.brandHeading}>{item.brandName}</h2>
                    ) : (
                      <span className={styles.brandHeading}>SCENTATION PARIS</span>
                    )}

                    <h3 className={styles.productName}>
                      {item.product?.name ?? t('kiosk.outOfStock')}
                    </h3>

                    <div className={styles.cardAction}>
                      {isAvailable ? (
                        <>
                          <span style={{ display: 'flex', alignItems: 'center' }}>
                            <span className={styles.actionDot} />
                            CHẠM ĐỂ THỬ HƯƠNG &amp; CHI TIẾT
                          </span>
                          <span className={`material-symbols-outlined ${styles.actionArrow}`}>
                            east
                          </span>
                        </>
                      ) : (
                        <>
                          <span>TẠM HẾT HÀNG • XEM THÔNG TIN</span>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                            info
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Nút cuộn tiến sang phải */}
          <button
            type="button"
            className={`${styles.navButton} ${styles.navButtonRight}`}
            onClick={(e) => {
              e.stopPropagation();
              handleNudge('right');
            }}
            aria-label="Cuộn sang phải"
          >
            <span className="material-symbols-outlined">east</span>
          </button>
        </div>
      )}

      {/* ========================================================
          1. MODAL CHI TIẾT SẢN PHẨM & QUICK VIEW (Stitch Screen 2)
          ======================================================== */}
      {detailItem && !paymentStep && (
        <div
          className={styles.modalBackdrop}
          onClick={handleCloseDetailModal}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.productDetailBox} onClick={(e) => e.stopPropagation()}>
            {/* Nút đóng */}
            <button
              type="button"
              className={styles.closeModalBtn}
              onClick={handleCloseDetailModal}
              aria-label="Đóng"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                close
              </span>
            </button>

            {/* Cột trái: Flacon Grasse */}
            <div className={styles.modalBottleColumn}>
              <div className={styles.modalBatchBadge}>
                N° 0{detailItem.slotNumber} • HAUTE SILLAGE
              </div>
              <div className={styles.modalImageFrame}>
                <img
                  src={detailBottleImg}
                  alt={detailItem.product?.name ?? 'Flacon'}
                  className={styles.modalProductImage}
                />
              </div>
            </div>

            {/* Cột phải: Thông tin hương thơm & hành động */}
            <div className={styles.modalInfoColumn}>
              <div>
                <div className={styles.modalTopBar}>
                  <span className={styles.modalFamilyTag}>
                    {FAMILIES[detailItem.slotNumber] || 'ORIENTAL SILLAGE'}
                  </span>
                </div>

                <h2 className={styles.modalProductName}>
                  {detailItem.product?.name ?? "Nuit d'Or"}
                </h2>

                <div className={styles.modalPriceRow}>
                  <span className={styles.modalPriceTag}>
                    {detailPriceFormatted ? `${detailPriceFormatted} / lượt xịt` : ''}
                  </span>
                </div>

                {detailIntro && <p className={styles.modalDesc}>{detailIntro}</p>}

                <div className={styles.modalDetailsTable}>
                  <div className={styles.modalDetailRow}>
                    <span className={styles.modalDetailLabel}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        science
                      </span>
                      Nhà Chế Tác (Master Perfumer)
                    </span>
                    <span className={styles.modalDetailValue}>
                      {detailItem.brandName || 'Jean-Claude Ellena'} • Grasse, France
                    </span>
                  </div>

                  {notes && (
                    <div className={styles.modalDetailRow}>
                      <span className={styles.modalDetailLabel}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          spa
                        </span>
                        Tầng Hương Chính
                      </span>
                      <div className={styles.modalDetailValue}>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            alignItems: 'flex-end',
                          }}
                        >
                          {notes.top.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                                Hương đầu:
                              </span>
                              <div className={styles.modalNotesChips}>
                                {notes.top.map((n) => (
                                  <span key={n} className={styles.modalNoteChip}>
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {notes.heart.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                                Hương giữa:
                              </span>
                              <div className={styles.modalNotesChips}>
                                {notes.heart.map((n) => (
                                  <span key={n} className={styles.modalNoteChip}>
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {notes.base.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                                Hương cuối:
                              </span>
                              <div className={styles.modalNotesChips}>
                                {notes.base.map((n) => (
                                  <span key={n} className={styles.modalNoteChip}>
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={styles.modalDetailRow}>
                    <span className={styles.modalDetailLabel}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        verified_user
                      </span>
                      Tiêu Chuẩn &amp; Độ Tinh Khiết
                    </span>
                    <span className={styles.modalDetailValue}>IFRA Certified 100% Pure Origin</span>
                  </div>
                </div>
              </div>

              {/* Hàng nút hành động */}
              <div className={styles.modalActionsRow}>
                <button
                  type="button"
                  className={styles.modalCheckoutBtn}
                  onClick={handleOpenPayment}
                  aria-label="Trải nghiệm xịt ngay"
                >
                  <span>Trải nghiệm xịt ngay</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          3. MÀN HÌNH TOÀN TRANG KIOSK SAU THANH TOÁN (Stitch Screen d0590f7ae4954294b26d2f0d2b83b28f)
          ======================================================== */}
      {isPostPayment && created && (
        <DispenseSuccessGuide
          item={detailItem ?? undefined}
          slot={detailItem?.slotNumber ?? 1}
          order={created.order}
          view={orderStatusView}
          phase={phase}
          now={now}
          settled={['DISPENSED', 'FORFEITED', 'EXPIRED', 'PROBLEM'].includes(phase)}
          pressWindowSec={config.pressWindowSec}
          goHome={handleCloseDetailModal}
        />
      )}

      {/* ========================================================
          2. MODAL THANH TOÁN (Stitch Screens 4, 5, 6)
          ======================================================== */}
      {paymentStep && !isPostPayment && (
        <div
          className={styles.modalBackdrop}
          onClick={handleCloseDetailModal}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.checkoutModalBox} onClick={(e) => e.stopPropagation()}>
            {/* Nút đóng */}
            <button
              type="button"
              className={styles.closeModalBtn}
              onClick={handleCloseDetailModal}
              aria-label="Đóng popup thanh toán"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                close
              </span>
            </button>

            {/* BƯỚC 1: CHỌN PHƯƠNG THỨC THANH TOÁN (Screen 4) */}
            {paymentStep === 'select' && (
              <>
                <div className={styles.checkoutHeaderArea}>
                  <h2 className={styles.checkoutModalTitle}>CHỌN PHƯƠNG THỨC THANH TOÁN</h2>

                  <div className={styles.checkoutSummaryBanner}>
                    <div className={styles.checkoutSummaryLeft}>
                      <img
                        src={detailBottleImg}
                        alt="Nước hoa"
                        className={styles.checkoutSummaryThumb}
                      />
                      <div style={{ textAlign: 'left' }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.14em',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          Thanh toán 1 lượt xịt • Ngăn 0{detailItem?.slotNumber}
                        </div>
                        <div
                          style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600 }}
                        >
                          {detailItem?.product?.name ?? "Nuit d'Or"}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 22,
                          fontWeight: 700,
                          color: '#000000',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {detailPriceFormatted || '35.000 VND'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.checkoutMethodsList}>
                  {/* Option 1: Card / POS */}
                  <label
                    className={`${styles.checkoutMethodItem} ${selectedMethod === 'card' ? styles.checkoutMethodItemSelected : ''}`}
                  >
                    <input
                      type="radio"
                      name="payment_opt"
                      value="card"
                      checked={selectedMethod === 'card'}
                      onChange={() => setSelectedMethod('card')}
                      className={styles.checkoutRadio}
                    />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontWeight: 700,
                            fontSize: 13.5,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            credit_card
                          </span>
                          Thẻ Visa / Mastercard / Thẻ Quốc Tế
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                          margin: '4px 0 8px',
                        }}
                      >
                        Chạm NFC hoặc cắm thẻ chip vào khe đọc POS tích hợp ngay bên dưới màn hình.
                      </div>
                      <div className={styles.tagsRow} style={{ justifyContent: 'flex-start' }}>
                        <span className={styles.badgeTag}>VISA</span>
                        <span className={styles.badgeTag}>MASTERCARD</span>
                        <span className={styles.badgeTag}>JCB</span>
                        <span className={styles.badgeTag}>Apple Pay</span>
                        <span className={styles.badgeTag}>Google Pay</span>
                      </div>
                    </div>
                  </label>

                  {/* Option 2: VietQR */}
                  <label
                    className={`${styles.checkoutMethodItem} ${selectedMethod === 'qr' ? styles.checkoutMethodItemSelected : ''}`}
                  >
                    <input
                      type="radio"
                      name="payment_opt"
                      value="qr"
                      checked={selectedMethod === 'qr'}
                      onChange={() => setSelectedMethod('qr')}
                      className={styles.checkoutRadio}
                    />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontWeight: 700,
                            fontSize: 13.5,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            qr_code_scanner
                          </span>
                          Quét Mã QR (VietQR / Ngân Hàng / Ví Điện Tử)
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                          margin: '4px 0 8px',
                        }}
                      >
                        Quét mã qua app Mobile Banking hoặc ví MoMo, ZaloPay, VNPay.
                      </div>
                      <div className={styles.tagsRow} style={{ justifyContent: 'flex-start' }}>
                        <span className={styles.badgeTag}>VIETQR</span>
                        <span className={styles.badgeTag}>MOMO</span>
                        <span className={styles.badgeTag}>ZALOPAY</span>
                        <span className={styles.badgeTag}>VNPAY</span>
                      </div>
                    </div>
                  </label>
                </div>

                <div className={styles.checkoutFooterButtons}>
                  <button
                    type="button"
                    className={styles.checkoutBtnSecondary}
                    onClick={handleBackToDetail}
                    aria-label="Quay lại"
                  >
                    ← Quay lại
                  </button>
                  <button
                    type="button"
                    className={styles.checkoutBtnPrimary}
                    onClick={handleProceedPayment}
                  >
                    Tiếp tục thanh toán →
                  </button>
                </div>
              </>
            )}

            {/* BƯỚC 2A: POPUP HƯỚNG DẪN VIETQR (Screen 5) */}
            {paymentStep === 'qr' && (
              <>
                <div className={styles.checkoutHeaderArea}>
                  <h2 className={styles.checkoutModalTitle}>QUÉT MÃ QR ĐỂ THANH TOÁN</h2>

                  <div className={styles.checkoutSummaryBanner}>
                    <div className={styles.checkoutSummaryLeft}>
                      <img
                        src={detailBottleImg}
                        alt="Nước hoa"
                        className={styles.checkoutSummaryThumb}
                      />
                      <div style={{ textAlign: 'left' }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          Mã đơn:{' '}
                          <strong style={{ color: '#000000' }}>
                            {created?.order.paymentReference ??
                              (createOrder.isPending ? 'Đang tạo đơn...' : '#SCT-8842')}
                          </strong>
                        </div>
                        <div
                          style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600 }}
                        >
                          {detailItem?.product?.name ?? "Nuit d'Or"}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 20,
                          fontWeight: 700,
                          color: '#000000',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {detailPriceFormatted || '35.000 VND'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.qrDisplayBox}>
                  <div className={styles.qrWrapper}>
                    <svg
                      style={{ width: 160, height: 160 }}
                      fill="none"
                      viewBox="0 0 160 160"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect fill="#000000" height="40" rx="6" width="40" x="10" y="10" />
                      <rect fill="white" height="24" rx="3" width="24" x="18" y="18" />
                      <rect fill="#000000" height="14" rx="2" width="14" x="23" y="23" />
                      <rect fill="#000000" height="40" rx="6" width="40" x="110" y="10" />
                      <rect fill="white" height="24" rx="3" width="24" x="118" y="18" />
                      <rect fill="#000000" height="14" rx="2" width="14" x="123" y="23" />
                      <rect fill="#000000" height="40" rx="6" width="40" x="10" y="110" />
                      <rect fill="white" height="24" rx="3" width="24" x="18" y="118" />
                      <rect fill="#000000" height="14" rx="2" width="14" x="23" y="123" />
                      <rect fill="#000000" height="8" width="8" x="60" y="15" />
                      <rect fill="#000000" height="8" width="12" x="75" y="15" />
                      <rect fill="#000000" height="8" width="8" x="92" y="15" />
                      <rect fill="#000000" height="8" width="14" x="60" y="30" />
                      <rect fill="#000000" height="8" width="18" x="82" y="28" />
                      <rect fill="#000000" height="15" width="8" x="60" y="45" />
                      <rect fill="#000000" height="12" width="12" x="75" y="42" />
                      <rect fill="#000000" height="10" width="10" x="95" y="45" />
                      <rect fill="#000000" height="8" width="10" x="15" y="60" />
                      <rect fill="#000000" height="8" width="12" x="32" y="60" />
                      <rect fill="#000000" height="8" width="18" x="15" y="75" />
                      <rect fill="#000000" height="12" width="14" x="38" y="75" />
                      <rect fill="#000000" height="8" width="12" x="15" y="92" />
                      <rect fill="#000000" height="10" width="10" x="35" y="92" />
                      <rect fill="#000000" height="10" width="10" x="60" y="65" />
                      <rect fill="#000000" height="10" width="10" x="78" y="65" />
                      <rect fill="#000000" height="8" width="15" x="95" y="65" />
                      <rect fill="#000000" height="10" width="12" x="115" y="60" />
                      <rect fill="#000000" height="8" width="15" x="135" y="60" />
                      <rect fill="#000000" height="15" width="8" x="115" y="75" />
                      <rect fill="#000000" height="8" width="18" x="130" y="78" />
                      <rect fill="#000000" height="8" width="14" x="115" y="95" />
                      <rect fill="#000000" height="12" width="12" x="135" y="92" />
                      <rect fill="#000000" height="8" width="12" x="60" y="85" />
                      <rect fill="#000000" height="14" width="10" x="80" y="82" />
                      <rect fill="#000000" height="10" width="8" x="98" y="85" />
                      <rect fill="#000000" height="8" width="18" x="60" y="105" />
                      <rect fill="#000000" height="14" width="8" x="85" y="102" />
                      <rect fill="#000000" height="8" width="12" x="100" y="105" />
                      <rect fill="#000000" height="12" width="10" x="60" y="120" />
                      <rect fill="#000000" height="8" width="14" x="78" y="122" />
                      <rect fill="#000000" height="10" width="12" x="98" y="120" />
                      <rect fill="#000000" height="8" width="15" x="60" y="138" />
                      <rect fill="#000000" height="12" width="10" x="82" y="135" />
                      <rect fill="#000000" height="8" width="14" x="98" y="138" />
                      <rect fill="#000000" height="10" width="12" x="118" y="115" />
                      <rect fill="#000000" height="8" width="14" x="135" y="115" />
                      <rect fill="#000000" height="14" width="10" x="118" y="132" />
                      <rect fill="#000000" height="8" width="15" x="135" y="130" />
                      <rect fill="#000000" height="24" rx="6" width="24" x="68" y="68" />
                      <path d="M74 80L78 74H86L82 86H74L78 80Z" fill="#ffffff" />
                    </svg>
                  </div>

                  <div className={styles.timerRow}>
                    <div className={styles.timerPill}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                        schedule
                      </span>
                      <span>Thời gian hiệu lực: {formatCountdown(countdown)}</span>
                    </div>
                    <div className={styles.waitingPill}>
                      <span className={styles.waitingPulse} />
                      <span>Đang chờ nhận diện giao dịch tự động...</span>
                    </div>
                  </div>

                  <div className={styles.tagsRow}>
                    <span className={styles.badgeTag}>VIETQR</span>
                    <span className={styles.badgeTag}>MOMO</span>
                    <span className={styles.badgeTag}>ZALOPAY</span>
                    <span className={styles.badgeTag}>VNPAY</span>
                    <span className={styles.badgeTag}>NAPAS 247</span>
                  </div>

                  {/* Lệnh thanh toán giả lập dành cho tester / dev */}
                  {created?.order.paymentReference && (
                    <div
                      style={{
                        marginTop: 14,
                        padding: '10px 14px',
                        background: '#1c1b1e',
                        borderRadius: 8,
                        color: '#e5e0d8',
                        textAlign: 'left',
                        border: '1px solid #333038',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: '#d4af37',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          Lệnh thanh toán giả lập (Dev / Test)
                        </span>
                        <button
                          type="button"
                          style={{
                            background: copiedCmd ? '#e6f4ea' : '#ffffff',
                            color: copiedCmd ? '#1e7e34' : '#131315',
                            border: 'none',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                              void navigator.clipboard.writeText(
                                `npm run pay:mock -- ${created.order.paymentReference}`,
                              );
                              setCopiedCmd(true);
                              setTimeout(() => setCopiedCmd(false), 2000);
                            }
                          }}
                        >
                          {copiedCmd ? 'Đã sao chép!' : 'Sao chép lệnh test'}
                        </button>
                      </div>
                      <code
                        style={{
                          color: '#e2c069',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          wordBreak: 'break-all',
                        }}
                      >
                        npm run pay:mock -- {created.order.paymentReference}
                      </code>
                    </div>
                  )}
                </div>

                <div className={styles.checkoutFooterButtons}>
                  <button
                    type="button"
                    className={styles.checkoutBtnSecondary}
                    onClick={() => setCustomPaymentStep('select')}
                  >
                    ← Đổi phương thức thanh toán
                  </button>
                  <button
                    type="button"
                    className={styles.checkoutBtnPrimary}
                    onClick={handleCloseDetailModal}
                  >
                    Hủy giao dịch
                  </button>
                </div>
              </>
            )}

            {/* BƯỚC 2B: POPUP HƯỚNG DẪN POS / NFC (Screen 6) */}
            {!isPostPayment && paymentStep === 'pos' && (
              <>
                <div className={styles.checkoutHeaderArea}>
                  <h2 className={styles.checkoutModalTitle}>THANH TOÁN THẺ QUỐC TẾ / NFC</h2>

                  <div className={styles.checkoutSummaryBanner}>
                    <div className={styles.checkoutSummaryLeft}>
                      <img
                        src={detailBottleImg}
                        alt="Nước hoa"
                        className={styles.checkoutSummaryThumb}
                      />
                      <div style={{ textAlign: 'left' }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          Mã đơn: #SCT-8842
                        </div>
                        <div
                          style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600 }}
                        >
                          {detailItem?.product?.name ?? "Nuit d'Or"}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 20,
                          fontWeight: 700,
                          color: '#000000',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {detailPriceFormatted || '35.000 VND'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.nfcDisplayBox}>
                  <div className={styles.nfcRadar}>
                    <div className={styles.radarRing} />
                    <div className={styles.nfcIconCore}>
                      <span className="material-symbols-outlined" style={{ fontSize: 30 }}>
                        contactless
                      </span>
                    </div>
                  </div>

                  <div className={styles.nfcStatusPill}>
                    <span className={styles.waitingPulse} style={{ background: '#ffffff' }} />
                    <span>ĐANG CHỜ CHẠM THẺ HOẶC CẮM CHIP...</span>
                  </div>

                  <div className={styles.tagsRow}>
                    <span className={styles.badgeTag}>VISA</span>
                    <span className={styles.badgeTag}>MASTERCARD</span>
                    <span className={styles.badgeTag}>JCB</span>
                    <span className={styles.badgeTag}>Apple Pay</span>
                    <span className={styles.badgeTag}>Google Pay</span>
                  </div>
                </div>

                <div className={styles.stepsGrid}>
                  <div className={styles.stepCard}>
                    <span className={styles.stepBadge}>1</span>
                    <span className={`material-symbols-outlined ${styles.stepIcon}`}>
                      contactless
                    </span>
                    <span className={styles.stepTitle}>Chạm thẻ</span>
                  </div>
                  <div className={styles.stepCard}>
                    <span className={styles.stepBadge}>2</span>
                    <span className={`material-symbols-outlined ${styles.stepIcon}`}>pin</span>
                    <span className={styles.stepTitle}>Nhập mã PIN</span>
                  </div>
                  <div className={styles.stepCard}>
                    <span className={styles.stepBadge}>3</span>
                    <span className={`material-symbols-outlined ${styles.stepIcon}`}>
                      receipt_long
                    </span>
                    <span className={styles.stepTitle}>Nhận lượt xịt tại vòi</span>
                  </div>
                </div>

                <div className={styles.checkoutFooterButtons}>
                  <button
                    type="button"
                    className={styles.checkoutBtnSecondary}
                    onClick={() => setCustomPaymentStep('select')}
                  >
                    ← Đổi phương thức thanh toán
                  </button>
                  <button
                    type="button"
                    className={styles.checkoutBtnPrimary}
                    onClick={handleCloseDetailModal}
                  >
                    Hủy giao dịch
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import type { components } from '@scentstation/contracts';
import {
  errorMessage,
  isNotCancellable,
  recordKioskInteraction,
  useCancelOrder,
  useCreateOrder,
  useKioskCatalog,
  useOrderStatus,
} from '@/shared/api';
import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import { phaseOf, secondsUntil } from '../checkout/checkout-phase';
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

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Màn hình Kiosk duy nhất (Single-Screen Architecture):
 * - Băng chuyền nước hoa sang trọng hỗ trợ cuộn kéo vuốt mượt mà trái sang phải (Drag & Swipe).
 * - Các màn hình phụ (Chi tiết sản phẩm, Popup mã QR thanh toán) đều là MODAL hiển thị trực tiếp
 *   trên nền HomeScreen. Hiện chỉ có thanh toán QR (ADR-0016) nên không có bước chọn phương thức.
 */
export default function CatalogScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams<{ slotNumber?: string }>();
  const catalog = useKioskCatalog();
  const { kioskSessionId, startNewSession } = useKioskSession();

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
  // Khách đã đồng ý điều khoản bấm nút (FR-ORD-25) và đang ở modal mã QR.
  const [paying, setPaying] = useState(false);
  // Khách vừa bấm hủy khi đã có mã QR — đang hỏi lại trước khi bỏ đơn.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Hook tạo đơn và theo dõi trạng thái thanh toán từ backend
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const createOrder = useCreateOrder();
  const cancelOrder = useCancelOrder();
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
  // Mở thẳng /checkout/:slot (vd. tải lại trang) vẫn phải qua modal chi tiết có điều khoản trước
  // (FR-ORD-25): chỉ khi khách bấm đồng ý thì mới mở mã QR.
  const paymentOpen = paying && detailItem !== null;

  // Đếm theo hạn của chính đơn đang hiện (máy chủ trả), không đếm cục bộ — đơn mới thì hạn mới.
  const qrSecondsLeft = secondsUntil(created?.order.expiresAt, now);

  // Tự động gọi API tạo đơn khi khách đã đồng ý điều khoản
  useEffect(() => {
    if (detailItem && paymentOpen && !created && !createOrder.isPending) {
      createOrder.mutate({
        slotId: detailItem.slotId,
        kioskSessionId,
        idempotencyKey,
      });
    }
  }, [detailItem, paymentOpen, created, createOrder, kioskSessionId, idempotencyKey]);

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
    const speed = 0.5; // Tốc độ trôi êm ái sang phải (left-to-right)

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

  // Đóng modal khi nhấn ESC — đi qua cùng đường đóng để bỏ đơn đang hiện, không mang sang sản phẩm khác.
  const escCloseRef = useRef<() => void>(() => {});
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
  // Bỏ đơn đang hiện (nếu có). Đơn chưa trả tiền tự hết hạn phía máy chủ; khách chọn lại là đơn mới,
  // khoá idempotency mới — không bao giờ hiện lại mã QR/đồng hồ của sản phẩm trước.
  const discardOrder = () => {
    setPaying(false);
    setConfirmingCancel(false);
    cancelOrder.reset();
    createOrder.reset();
    setPaidSince(null);
    setPrevStatus(null);
    setIdempotencyKey(newIdempotencyKey());
  };

  const handleSelectItem = (item: KioskCatalogItem) => {
    if (hasDraggedRef.current) return;
    if (!item.available) return;
    isPausedRef.current = true;
    recordKioskInteraction({
      eventType: 'PRODUCT_SELECTED',
      slotId: item.slotId,
      kioskSessionId,
    });
    discardOrder();
    setSelectedDetailItem(item);
    void navigate(`/products/${item.slotNumber}`);
  };

  const handleCloseDetailModal = () => {
    setSelectedDetailItem(null);
    discardOrder();
    startNewSession();
    isPausedRef.current = false;
    void navigate('/');
  };

  // Khách có thể đã chuyển khoản dù đang bấm hủy — đã có mã QR thì phải hỏi lại. Chưa có mã (đang
  // tạo đơn) thì khách chưa thể trả tiền, đóng luôn.
  const handleRequestCancel = () => {
    if (created) setConfirmingCancel(true);
    else handleCloseDetailModal();
  };

  // FR-ORD-33: hủy đơn ở máy chủ (máy chủ hủy luôn link ở cổng) rồi mới đóng. Cổng báo tiền đã/đang
  // về → ở lại màn QR, poll trạng thái sẽ đưa khách sang màn nhận lượt xịt. Lỗi khác (mất mạng…) →
  // vẫn đóng: khách đã quyết rời đi, và tiền nếu vẫn tới sẽ vào danh sách hoàn tiền.
  const handleConfirmCancel = () => {
    if (!created) {
      handleCloseDetailModal();
      return;
    }
    cancelOrder.mutate(created.order.id, {
      onSuccess: handleCloseDetailModal,
      onError: (error) => {
        if (isNotCancellable(error)) setConfirmingCancel(false);
        else handleCloseDetailModal();
      },
    });
  };

  const settled =
    created !== undefined && ['DISPENSED', 'FORFEITED', 'EXPIRED', 'PROBLEM'].includes(phase);

  // Luôn trỏ tới bản đóng mới nhất để hẹn giờ/phím ESC không gọi closure cũ.
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    closeRef.current = handleCloseDetailModal;
    // Màn hướng dẫn sau thanh toán không đóng bằng phím ESC — khách đang chờ lượt xịt đã trả tiền.
    escCloseRef.current = isPostPayment
      ? () => {}
      : paymentOpen
        ? confirmingCancel
          ? () => setConfirmingCancel(false)
          : handleRequestCancel
        : handleCloseDetailModal;
  });

  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => closeRef.current(), 60_000);
    return () => clearTimeout(timer);
  }, [settled]);

  // Khách bấm "Đồng ý và thanh toán" ở modal chi tiết (đã đọc điều khoản, FR-ORD-25) → vào thẳng mã QR.
  const handleOpenPayment = () => {
    if (!detailItem) return;
    setPaying(true);
    void navigate(`/checkout/${detailItem.slotNumber}`);
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

  // Mô tả giữ nguyên như thương hiệu nhập (NFR-USA-07) — không có thì không bịa mô tả thay.
  const detailIntro = detailItem?.product?.description;

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
            aria-label={t('kiosk.scrollLeft')}
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
                      alt={item.product?.name ?? t('kiosk.productImageAlt')}
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
                            {t('kiosk.tapToExplore')}
                          </span>
                          <span className={`material-symbols-outlined ${styles.actionArrow}`}>
                            east
                          </span>
                        </>
                      ) : (
                        <>
                          <span>{t('kiosk.outOfStockInfo')}</span>
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
            aria-label={t('kiosk.scrollRight')}
          >
            <span className="material-symbols-outlined">east</span>
          </button>
        </div>
      )}

      {/* ========================================================
          1. MODAL CHI TIẾT SẢN PHẨM & QUICK VIEW (Stitch Screen 2)
          ======================================================== */}
      {detailItem && !paymentOpen && (
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
              aria-label={t('kiosk.close')}
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
                  alt={detailItem.product?.name ?? t('kiosk.productImageAlt')}
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
                    {detailPriceFormatted
                      ? t('kiosk.pricePerSpray', { price: detailPriceFormatted })
                      : ''}
                  </span>
                </div>

                {detailIntro && <p className={styles.modalDesc}>{detailIntro}</p>}

                <div className={styles.modalDetailsTable}>
                  {/* Chỉ hiện thông tin thương hiệu đã nhập — không gán nhà chế tác/xuất xứ thay (NFR-USA-07). */}
                  {detailItem.brandName && (
                    <div className={styles.modalDetailRow}>
                      <span className={styles.modalDetailLabel}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          science
                        </span>
                        {t('kiosk.brandLabel')}
                      </span>
                      <span className={styles.modalDetailValue}>{detailItem.brandName}</span>
                    </div>
                  )}

                  {notes && (
                    <div className={styles.modalDetailRow}>
                      <span className={styles.modalDetailLabel}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          spa
                        </span>
                        {t('kiosk.fragranceNotes')}
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
                                {t('kiosk.topNotes')}:
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
                                {t('kiosk.heartNotes')}:
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
                                {t('kiosk.baseNotes')}:
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
                </div>
              </div>

              {/* FR-ORD-25: điều khoản bấm nút hiện TRƯỚC mã QR; bấm đồng ý mới tạo đơn và hiện mã. */}
              <p
                style={{
                  marginTop: 20,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: 'var(--color-text-secondary)',
                  textAlign: 'left',
                }}
              >
                <strong>{t('kiosk.pressTermsTitle')}: </strong>
                {t('kiosk.pressTerms', {
                  slot: detailItem.slotNumber,
                  seconds: config.pressWindowSec,
                })}
              </p>

              {/* Hàng nút hành động */}
              <div className={styles.modalActionsRow}>
                <button
                  type="button"
                  className={styles.modalCheckoutBtn}
                  onClick={handleOpenPayment}
                >
                  <span>{t('kiosk.agreeAndPay')}</span>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18 }}
                    aria-hidden="true"
                  >
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          3. SAU THANH TOÁN: MÀN CHÚC MỪNG RỒI MODAL HƯỚNG DẪN BẤM NÚT
          ======================================================== */}
      {isPostPayment && created && (
        <DispenseSuccessGuide
          slot={detailItem?.slotNumber ?? 1}
          order={created.order}
          view={orderStatusView}
          phase={phase}
          now={now}
          pressWindowSec={config.pressWindowSec}
          goHome={handleCloseDetailModal}
        />
      )}

      {/* ========================================================
          2. MODAL MÃ QR THANH TOÁN (Stitch Screen 5)
          ======================================================== */}
      {paymentOpen && !isPostPayment && (
        <div
          className={styles.modalBackdrop}
          onClick={handleRequestCancel}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.checkoutModalBox} onClick={(e) => e.stopPropagation()}>
            {/* Nút đóng — cũng phải hỏi lại như nút hủy */}
            <button
              type="button"
              className={styles.closeModalBtn}
              onClick={handleRequestCancel}
              aria-label={t('kiosk.close')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                close
              </span>
            </button>

            {/* Hiện chỉ có thanh toán QR (ADR-0016) nên vào thẳng mã QR, không có bước chọn phương thức. */}
            <div className={styles.checkoutHeaderArea}>
              <h2 className={styles.checkoutModalTitle}>{t('kiosk.scanToPay')}</h2>

              <div className={styles.checkoutSummaryBanner}>
                <div className={styles.checkoutSummaryLeft}>
                  <img
                    src={detailBottleImg}
                    alt={detailItem?.product?.name ?? t('kiosk.productImageAlt')}
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
                      {t('kiosk.paymentReference')}:{' '}
                      <strong style={{ color: '#000000' }}>
                        {created?.order.paymentReference ?? t('kiosk.creatingOrder')}
                      </strong>
                    </div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600 }}>
                      {detailItem?.product?.name}
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
                    {created
                      ? formatPrice(created.order.amount, created.order.currency)
                      : detailPriceFormatted}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.qrDisplayBox}>
              <div className={styles.qrWrapper}>
                {/* QR thật mã hoá đúng payload cổng thanh toán trả về — ngân hàng quét được (FR-ORD-08). */}
                {created?.qrPayload ? (
                  <QRCodeSVG
                    value={created.qrPayload}
                    size={160}
                    level="M"
                    role="img"
                    aria-label={t('kiosk.scanToPay')}
                  />
                ) : (
                  <span>{t('kiosk.creatingOrder')}</span>
                )}
              </div>

              <div className={styles.timerRow}>
                {/* Đếm theo hạn của chính đơn này (máy chủ trả) — đổi sản phẩm là đơn mới, hạn mới. */}
                {qrSecondsLeft !== null && (
                  <div className={styles.timerPill}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                      schedule
                    </span>
                    <span>
                      {t('kiosk.paymentValidFor', { time: formatCountdown(qrSecondsLeft) })}
                    </span>
                  </div>
                )}
                <div className={styles.waitingPill}>
                  <span className={styles.waitingPulse} />
                  <span>{t('kiosk.waitingPaymentDesc')}</span>
                </div>
              </div>

              <div className={styles.tagsRow}>
                <span className={styles.badgeTag}>VIETQR</span>
                <span className={styles.badgeTag}>MOMO</span>
                <span className={styles.badgeTag}>ZALOPAY</span>
                <span className={styles.badgeTag}>VNPAY</span>
                <span className={styles.badgeTag}>NAPAS 247</span>
              </div>

              {/* Lệnh thanh toán giả lập cho tester — chỉ có ở bản dev, khách không bao giờ thấy. */}
              {config.showDevTools && created?.order.paymentReference && (
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
                      {t('kiosk.mockPayGuide')}
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
                      {copiedCmd ? t('kiosk.copied') : t('kiosk.copyCommand')}
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

            <div className={styles.checkoutFooterButtons} style={{ justifyContent: 'flex-end' }}>
              {/* Hủy không được vì tiền đã/đang về — nói rõ để khách yên tâm đứng chờ. */}
              {isNotCancellable(cancelOrder.error) && (
                <p role="status" style={{ margin: 0, marginRight: 'auto', fontSize: 13 }}>
                  {errorMessage(cancelOrder.error, t)}
                </p>
              )}
              <button
                type="button"
                className={styles.checkoutBtnPrimary}
                onClick={handleRequestCancel}
              >
                {t('kiosk.cancelOrder')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận hủy nổi trên modal QR. Chạm ra ngoài = ở lại (lựa chọn an toàn cho khách có
          thể đã chuyển khoản), không phải hủy. */}
      {paymentOpen && !isPostPayment && confirmingCancel && (
        <div
          className={styles.confirmBackdrop}
          onClick={() => {
            if (!cancelOrder.isPending) setConfirmingCancel(false);
          }}
        >
          <div
            className={styles.confirmBox}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-payment-title"
            aria-describedby="cancel-payment-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`material-symbols-outlined ${styles.confirmIcon}`} aria-hidden="true">
              warning
            </span>
            <h3 id="cancel-payment-title" className={styles.confirmTitle}>
              {t('kiosk.cancelPaymentConfirmTitle')}
            </h3>
            <p id="cancel-payment-desc" className={styles.confirmText}>
              {t('kiosk.cancelPaymentConfirm')}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.checkoutBtnSecondary}
                onClick={handleConfirmCancel}
                disabled={cancelOrder.isPending}
              >
                {cancelOrder.isPending ? t('kiosk.cancelling') : t('kiosk.cancelAnyway')}
              </button>
              <button
                type="button"
                className={styles.checkoutBtnPrimary}
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelOrder.isPending}
                autoFocus
              >
                {t('kiosk.continuePayment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

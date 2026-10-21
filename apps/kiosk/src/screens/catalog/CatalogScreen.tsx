import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import type { components } from '@scentstation/contracts';
import {
  errorMessage,
  isMachineInMaintenance,
  isNotCancellable,
  recordKioskInteraction,
  useKioskCatalog,
} from '@/shared/api';
import OutOfServiceScreen from '@/screens/out-of-service/OutOfServiceScreen';
import { config } from '@/shared/config';
import { formatPrice } from '@/shared/format/price';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import { Icon } from '@/shared/ui/Icon';
import { ProductImage } from '@/shared/ui/ProductImage';
import DispenseSuccessGuide from '../checkout/DispenseSuccessGuide';
import { useKioskOrderFlow } from '../checkout/useKioskOrderFlow';
import { CatalogRail } from './CatalogRail';
import styles from './CatalogScreen.module.css';

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

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Màn hình Kiosk duy nhất (Single-Screen Architecture):
 * - Dải danh mục vuốt ngang (CatalogRail), xếp theo số nút trên máy.
 * - Các màn hình phụ (Chi tiết sản phẩm, Popup mã QR thanh toán) đều là MODAL hiển thị trực tiếp
 *   trên nền HomeScreen. Hiện chỉ có thanh toán QR (ADR-0016) nên không có bước chọn phương thức.
 */
export default function CatalogScreen() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const params = useParams<{ slotNumber?: string }>();
  const catalog = useKioskCatalog();
  const { kioskSessionId, startNewSession } = useKioskSession();

  const reportedImpressionsRef = useRef<Set<string>>(new Set());

  const [selectedDetailItem, setSelectedDetailItem] = useState<KioskCatalogItem | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const items = useMemo(() => catalog.data?.items ?? [], [catalog.data?.items]);

  // Đồng bộ mở modal theo URL (nếu có slotNumber từ route)
  const routeMatchedItem = useMemo(() => {
    if (!params.slotNumber || items.length === 0) return null;
    return items.find((i) => String(i.slotNumber) === params.slotNumber) ?? null;
  }, [params.slotNumber, items]);

  const detailItem = selectedDetailItem ?? routeMatchedItem;

  // Khách rời luồng: đóng lớp phủ, mở phiên mới, về trang chủ (đơn đang hiện đã được bỏ trong hook).
  const flow = useKioskOrderFlow(detailItem, () => {
    setSelectedDetailItem(null);
    startNewSession();
    void navigate('/');
  });
  const { created, phase, paymentOpen, isPostPayment, qrSecondsLeft, qrExpired, confirmingCancel } =
    flow;
  const handleCloseDetailModal = flow.exit;
  const handleRequestCancel = flow.requestCancel;
  const handleConfirmCancel = flow.confirmCancel;

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

  // Chọn sản phẩm -> Mở modal chi tiết ngay trên HomeScreen; bỏ đơn của sản phẩm trước (nếu có).
  const handleSelectItem = (item: KioskCatalogItem) => {
    if (!item.available) return;
    recordKioskInteraction({
      eventType: 'PRODUCT_SELECTED',
      slotId: item.slotId,
      kioskSessionId,
    });
    flow.discard();
    setSelectedDetailItem(item);
    void navigate(`/products/${item.slotNumber}`);
  };

  // Luôn trỏ tới bản đóng mới nhất để phím ESC không gọi closure cũ.
  useEffect(() => {
    // Màn hướng dẫn sau thanh toán không đóng bằng phím ESC — khách đang chờ lượt xịt đã trả tiền.
    escCloseRef.current = isPostPayment
      ? () => {}
      : paymentOpen
        ? confirmingCancel
          ? flow.dismissCancel
          : handleRequestCancel
        : handleCloseDetailModal;
  });

  // Khách bấm "Đồng ý và thanh toán" ở modal chi tiết (đã đọc điều khoản, FR-ORD-25) → vào thẳng mã QR.
  const handleOpenPayment = () => {
    if (!detailItem) return;
    flow.startPayment();
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

  const detailPriceFormatted = formatPrice(
    detailItem?.pricePerSpray,
    detailItem?.currency ?? 'VND',
    locale,
  );

  // Mô tả giữ nguyên như thương hiệu nhập (NFR-USA-07) — không có thì không bịa mô tả thay.
  const detailIntro = detailItem?.product?.description;

  if (isMachineInMaintenance(flow.createError)) {
    return <OutOfServiceScreen />;
  }

  return (
    <section className={styles.catalogContainer} aria-label={t('kiosk.catalogTitle')}>
      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{t('kiosk.emptyCatalog')}</p>
        </div>
      ) : (
        <CatalogRail items={items} onSelect={handleSelectItem} />
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
              <Icon name="close" size={20} />
            </button>

            {/* Cột trái: Flacon Grasse */}
            <div className={styles.modalBottleColumn}>
              <div className={styles.modalBatchBadge}>N° {detailItem.slotNumber}</div>
              <ProductImage
                src={detailItem.product?.imageUrl}
                alt={detailItem.product?.name ?? t('kiosk.productImageAlt')}
                className={styles.modalImageFrame}
              />
            </div>

            {/* Cột phải: Thông tin hương thơm & hành động */}
            <div className={styles.modalInfoColumn}>
              <div>
                <h2 className={styles.modalProductName}>{detailItem.product?.name}</h2>

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
                      <span className={styles.modalDetailLabel}>{t('kiosk.brandLabel')}</span>
                      <span className={styles.modalDetailValue}>{detailItem.brandName}</span>
                    </div>
                  )}

                  {notes && (
                    <div className={styles.modalDetailRow}>
                      <span className={styles.modalDetailLabel}>{t('kiosk.fragranceNotes')}</span>
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
                  <Icon name="arrowRight" size={18} />
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
          view={flow.view}
          phase={phase}
          now={flow.now}
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
              <Icon name="close" size={20} />
            </button>

            {/* Hiện chỉ có thanh toán QR (ADR-0016) nên vào thẳng mã QR, không có bước chọn phương thức. */}
            <div className={styles.checkoutHeaderArea}>
              <h2 className={styles.checkoutModalTitle}>{t('kiosk.scanToPay')}</h2>

              <div className={styles.checkoutSummaryBanner}>
                <div className={styles.checkoutSummaryLeft}>
                  {detailItem?.product?.imageUrl && (
                    <img
                      src={detailItem.product.imageUrl}
                      alt={detailItem.product.name}
                      className={styles.checkoutSummaryThumb}
                    />
                  )}
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
                      ? formatPrice(created.order.amount, created.order.currency, locale)
                      : detailPriceFormatted}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.qrDisplayBox}>
              {qrExpired && created ? (
                <div role="status" style={{ padding: '24px 8px', textAlign: 'center' }}>
                  <Icon
                    name="timerOff"
                    size={40}
                    style={{ color: 'var(--color-text-secondary)' }}
                  />
                  <h3 style={{ fontFamily: 'var(--font-serif)', margin: '8px 0' }}>
                    {t('kiosk.paymentExpiredTitle')}
                  </h3>
                  <p style={{ margin: '0 0 8px' }}>{t('kiosk.paymentExpiredHint')}</p>
                  {/* Tiền về sau hạn thì đơn sang REFUND_PENDING — không hứa "chưa bị trừ tiền". */}
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {t('kiosk.paymentExpiredLatePayment', {
                      reference: created.order.paymentReference,
                    })}
                  </p>
                </div>
              ) : (
                <>
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
                    ) : flow.createFailed ? (
                      <div role="alert" style={{ textAlign: 'center', padding: 12 }}>
                        <p style={{ margin: '0 0 12px' }}>{errorMessage(flow.createError, t)}</p>
                        <button
                          type="button"
                          className={styles.checkoutBtnPrimary}
                          onClick={flow.retryCreate}
                        >
                          {t('kiosk.retryCreateOrder')}
                        </button>
                      </div>
                    ) : (
                      <span>{t('kiosk.creatingOrder')}</span>
                    )}
                  </div>

                  <div className={styles.timerRow}>
                    {/* Đếm theo hạn của chính đơn này (máy chủ trả) — đổi sản phẩm là đơn mới, hạn mới. */}
                    {qrSecondsLeft !== null && (
                      <div className={styles.timerPill}>
                        <Icon name="clock" size={16} />
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
                </>
              )}

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
              {isNotCancellable(flow.cancelError) && (
                <p role="status" style={{ margin: 0, marginRight: 'auto', fontSize: 13 }}>
                  {errorMessage(flow.cancelError, t)}
                </p>
              )}
              <button
                type="button"
                className={styles.checkoutBtnPrimary}
                onClick={handleRequestCancel}
              >
                {qrExpired ? t('kiosk.backToHome') : t('kiosk.cancelOrder')}
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
            if (!flow.cancelPending) flow.dismissCancel();
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
            <Icon name="warning" size={32} className={styles.confirmIcon} />
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
                disabled={flow.cancelPending}
              >
                {flow.cancelPending ? t('kiosk.cancelling') : t('kiosk.cancelAnyway')}
              </button>
              <button
                type="button"
                className={styles.checkoutBtnPrimary}
                onClick={flow.dismissCancel}
                disabled={flow.cancelPending}
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

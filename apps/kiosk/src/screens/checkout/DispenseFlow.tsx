import { useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { OrderStatusView } from '@/shared/api';
import { playChime } from '@/shared/audio/chime';
import { claimUrlFor, config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { secondsUntil, type CheckoutPhase } from './checkout-phase';
import { PressScreen } from './PressScreen';
import styles from './DispenseFlow.module.css';

export interface DispenseFlowProps {
  slot: number;
  productName?: string;
  order: { id: string; paymentReference: string };
  view?: OrderStatusView;
  phase: CheckoutPhase;
  now: number;
  goHome: () => void;
}

/**
 * Sau thanh toán (FR-ORD-11, 21, 26, 27, 28; ADR-0007): mỗi trạng thái máy chủ trả ứng với đúng một
 * màn, kiosk không tự suy nghiệp vụ (QT5).
 *
 * - PAID / lệnh chưa tới máy: "Đã nhận thanh toán · Đang chuẩn bị máy" — KHÔNG có đồng hồ.
 * - PAID lâu (máy đang phục vụ khách trước, FR-DSP-26): "Bạn là lượt tiếp theo" kèm tên hương, số
 *   nút, chuyển động chờ nhẹ — không báo lỗi, không nút thử lại.
 * - Đèn đã sáng (lệnh ACKNOWLEDGED): đổi nền, âm báo, số nút lớn, đồng hồ theo `pressDeadline`
 *   máy chủ trả (acknowledgedAt + DISPENSE_PRESS_WINDOW_SEC). Hết giờ mà máy chủ chưa báo kết quả
 *   thì chỉ hiện "đang xác nhận" — ghi nhận bỏ lượt là việc của thiết bị và máy chủ.
 * - Kết quả: đã xịt, bỏ lượt, hoặc sự cố kèm QR khiếu nại (ADR-0012). Tự về trang chủ là việc của
 *   useKioskOrderFlow (KIOSK_IDLE_TIMEOUT_SEC, FR-ORD-26 AC3).
 */
export default function DispenseFlow({
  slot,
  productName,
  order,
  view,
  phase,
  now,
  goHome,
}: DispenseFlowProps) {
  const { t } = useI18n();
  const slotNo = view?.slotNumber ?? slot;
  const secondsLeft = phase === 'PRESS' ? secondsUntil(view?.pressDeadline, now) : null;
  // Đèn sáng nhưng đã quá hạn máy chủ đưa mà chưa có kết quả: chờ máy chủ, không tự kết luận.
  const shown: CheckoutPhase = phase === 'PRESS' && secondsLeft === 0 ? 'CHECKING' : phase;

  // Âm báo một lần mỗi khi đèn vừa sáng.
  const chimed = useRef(false);
  useEffect(() => {
    if (phase === 'PRESS' && !chimed.current) {
      chimed.current = true;
      playChime();
    }
    if (phase !== 'PRESS') chimed.current = false;
  }, [phase]);

  if (shown === 'PRESS') return <PressScreen slot={slotNo} secondsLeft={secondsLeft} />;

  // Đã trả tiền, máy còn phục vụ khách trước (FR-DSP-26): trấn an, không có nút thử lại — đơn đã
  // giữ chỗ, máy chủ tự tạo lệnh khi tới lượt.
  if (shown === 'WAITING_TURN') {
    return (
      <section className={styles.page} aria-labelledby="dispense-title">
        <h1 id="dispense-title" className={styles.title}>
          {t('kiosk.paidTitle')}
        </h1>
        <p className={styles.hint} role="status">
          {t('kiosk.waitingTurnHint')}
        </p>
        <div className={styles.queued}>
          <span className={styles.queuedNo} aria-label={t('kiosk.buttonNumber', { slot: slotNo })}>
            {slotNo}
          </span>
          {productName && <span className={styles.queuedName}>{productName}</span>}
        </div>
        <span className={styles.waitDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </section>
    );
  }

  if (shown === 'PREPARING' || shown === 'CHECKING') {
    const checking = shown === 'CHECKING';
    return (
      <section className={styles.page} aria-labelledby="dispense-title">
        <h1 id="dispense-title" className={styles.title}>
          {checking ? t('kiosk.checkingResult') : t('kiosk.paidTitle')}
        </h1>
        {!checking && (
          <>
            <p className={styles.hint} role="status">
              <span className={styles.pulse} aria-hidden="true" />
              {t('kiosk.preparingHint')}
            </p>
            <p className={styles.note}>{t('kiosk.afterPayLookUp', { slot: slotNo })}</p>
          </>
        )}
      </section>
    );
  }

  if (shown === 'DISPENSED') {
    return (
      <section className={`${styles.page} ${styles.slow}`} aria-labelledby="dispense-title">
        <h1 id="dispense-title" className={styles.title}>
          {t('kiosk.dispensedTitle')}
        </h1>
        {productName && <p className={styles.product}>{productName}</p>}
        <p className={styles.hint}>{t('kiosk.dispensedHint')}</p>
        <button type="button" className={styles.home} onClick={goHome}>
          {t('kiosk.backToHome')}
        </button>
      </section>
    );
  }

  if (shown === 'FORFEITED') {
    return (
      <section className={styles.page} aria-labelledby="dispense-title">
        <h1 id="dispense-title" className={styles.title}>
          {t('kiosk.pressTimeoutTitle')}
        </h1>
        <p className={styles.hint}>
          {t('kiosk.pressTimeoutHint', { seconds: config.pressWindowSec })}
        </p>
        <button type="button" className={styles.home} onClick={goHome}>
          {t('kiosk.backToHome')}
        </button>
      </section>
    );
  }

  // Sự cố sau thanh toán (FAILED, REFUND_PENDING…): lịch sự, không đổ lỗi, đưa đường khiếu nại.
  const reference = view?.supportReference ?? order.paymentReference;
  // Tiền về sau khi mã hết hạn/bị hủy: đơn REFUND_PENDING mà chưa từng có lệnh xịt (FR-ORD-16 AC3).
  const latePayment = view?.status === 'REFUND_PENDING' && !view.dispenseStatus;
  // FR-ORD-28: máy chủ chỉ trả claimToken khi đơn đủ điều kiện khiếu nại và chưa có phiếu.
  const claimUrl = view?.claimToken
    ? claimUrlFor(config.claimPageUrl, order.id, view.claimToken)
    : null;

  return (
    <section className={`${styles.page} ${styles.problem}`} aria-labelledby="dispense-title">
      <div className={styles.problemText}>
        <h1 id="dispense-title" className={styles.title}>
          {latePayment ? t('kiosk.latePaymentTitle') : t('kiosk.orderProblemTitle')}
        </h1>
        {latePayment && <p className={styles.hint}>{t('kiosk.latePaymentHint')}</p>}
        {/* FR-ORD-21: chỉ dẫn tới kênh hỗ trợ thật; máy không có nhân viên (BR-001). */}
        <p className={styles.hint}>
          {config.supportContact
            ? t('kiosk.supportHint', { reference, contact: config.supportContact })
            : t('kiosk.supportHintNoContact', { reference })}
        </p>
        <p className={styles.reference}>
          {t('kiosk.paymentReference')}: <span>{reference}</span>
        </p>
        <button type="button" className={styles.home} onClick={goHome}>
          {t('kiosk.backToHome')}
        </button>
      </div>
      {claimUrl && (
        <figure className={styles.claim}>
          <QRCodeSVG
            value={claimUrl}
            size={320}
            level="M"
            marginSize={4}
            className={styles.claimQr}
            role="img"
            aria-label={t('kiosk.claimQrTitle')}
          />
          <figcaption>
            <strong>{t('kiosk.claimQrTitle')}</strong>
            <span>{t('kiosk.claimQrHint', { hours: config.refundClaimSlaHours })}</span>
          </figcaption>
        </figure>
      )}
    </section>
  );
}

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { components } from '@scentstation/contracts';
import { errorMessage, isNotCancellable } from '@/shared/api';
import { config } from '@/shared/config';
import { formatPrice } from '@/shared/format/price';
import { useI18n } from '@/shared/i18n';
import { Icon } from '@/shared/ui/Icon';
import type { KioskOrderFlow } from './useKioskOrderFlow';
import styles from './PaymentPage.module.css';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

/** Chỉ trong chừng này giây cuối đồng hồ mới đổi màu nhấn — trước đó để yên cho khách quét. */
const QR_URGENT_SEC = 30;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Màn quét mã thanh toán (FR-ORD-08, FR-ORD-16, FR-ORD-33): mã QR là trung tâm, viền tiến trình mảnh
 * chạy quanh mã theo hạn máy chủ trả; một lối thoát duy nhất là nút "Hủy" — đã có mã thì hỏi lại
 * trước khi hủy đơn (máy chủ hủy luôn link ở cổng). Hiện chỉ có thanh toán QR qua PayOS (ADR-0016).
 */
export function PaymentPage({ item, flow }: { item: KioskCatalogItem; flow: KioskOrderFlow }) {
  const { t, locale } = useI18n();
  const { created, qrSecondsLeft, qrExpired, confirmingCancel } = flow;
  const [copied, setCopied] = useState(false);

  const amount = created
    ? formatPrice(created.order.amount, created.order.currency, locale)
    : formatPrice(item.pricePerSpray, item.currency, locale);
  const fraction = qrSecondsLeft === null ? 1 : Math.min(1, qrSecondsLeft / config.paymentTtlSec);
  const urgent = qrSecondsLeft !== null && qrSecondsLeft <= QR_URGENT_SEC;
  const reference = created?.order.paymentReference;
  const mockCommand = reference ? `npm run pay:mock -- ${reference}` : null;

  return (
    <section className={styles.page} aria-labelledby="payment-title">
      <div className={styles.info}>
        <h1 id="payment-title" className={styles.title}>
          {t('kiosk.scanToPay')}
        </h1>
        <p className={styles.product}>{item.product?.name}</p>
        <p className={styles.amount}>{amount}</p>
        <p className={`caps ${styles.method}`}>{t('kiosk.paymentMethod')}</p>

        {!qrExpired && (
          <p className={styles.lookUp}>{t('kiosk.afterPayLookUp', { slot: item.slotNumber })}</p>
        )}

        {/* Hủy không được vì tiền đã/đang về — nói rõ để khách yên tâm đứng chờ. */}
        {!qrExpired && created && (
          <p className={styles.status} role="status">
            {isNotCancellable(flow.cancelError) ? (
              errorMessage(flow.cancelError, t)
            ) : (
              <>
                <span className={styles.pulse} aria-hidden="true" />
                {t('kiosk.waitingForPayment')}
              </>
            )}
          </p>
        )}

        <button type="button" className={styles.cancel} onClick={flow.requestCancel}>
          {qrExpired ? t('kiosk.backToHome') : t('kiosk.cancel')}
        </button>
      </div>

      <div className={styles.qrArea}>
        {qrExpired && created ? (
          <div className={styles.expired} role="status">
            <Icon name="timerOff" size={40} />
            <h2 className={styles.expiredTitle}>{t('kiosk.paymentExpiredTitle')}</h2>
            <p>{t('kiosk.paymentExpiredHint')}</p>
            {/* Tiền về sau hạn thì đơn sang REFUND_PENDING — không hứa "chưa bị trừ tiền". */}
            <p className={styles.muted}>
              {t('kiosk.paymentExpiredLatePayment', { reference: created.order.paymentReference })}
            </p>
          </div>
        ) : created?.qrPayload ? (
          <figure className={styles.qrFrame}>
            <svg
              className={`${styles.ring} ${urgent ? styles.ringUrgent : ''}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect x="0.5" y="0.5" width="99" height="99" rx="1" pathLength={100} />
              <rect
                className={styles.ringLeft}
                x="0.5"
                y="0.5"
                width="99"
                height="99"
                rx="1"
                pathLength={100}
                strokeDasharray={`${fraction * 100} 100`}
              />
            </svg>
            {/* QR thật mã hoá đúng payload cổng thanh toán trả về — ngân hàng quét được (FR-ORD-08).
                Luôn đen trên trắng, viền trắng rộng để app ngân hàng bắt được góc mã. */}
            <QRCodeSVG
              value={created.qrPayload}
              size={512}
              level="M"
              marginSize={4}
              className={styles.qr}
              role="img"
              aria-label={t('kiosk.scanToPay')}
            />
            {qrSecondsLeft !== null && (
              <figcaption className={`${styles.time} ${urgent ? styles.timeUrgent : ''}`}>
                {formatCountdown(qrSecondsLeft)}
              </figcaption>
            )}
          </figure>
        ) : flow.createFailed ? (
          <div className={styles.expired} role="alert">
            <p>{errorMessage(flow.createError, t)}</p>
            <button type="button" className={styles.retry} onClick={flow.retryCreate}>
              {t('kiosk.retryCreateOrder')}
            </button>
          </div>
        ) : (
          <p className={styles.muted}>{t('kiosk.creatingOrder')}</p>
        )}
      </div>

      {reference && (
        <p className={styles.reference}>
          {t('kiosk.paymentReference')}: <span>{reference}</span>
        </p>
      )}

      {/* Lệnh thanh toán giả lập cho tester — chỉ có ở bản dev, khách không bao giờ thấy. */}
      {config.showDevTools && mockCommand && (
        <div className={styles.dev}>
          <code>{mockCommand}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(mockCommand);
              setCopied(true);
            }}
          >
            {copied ? t('kiosk.copied') : t('kiosk.copyCommand')}
          </button>
        </div>
      )}

      {/* Chạm ra ngoài = ở lại (lựa chọn an toàn cho khách có thể đã chuyển khoản), không phải hủy. */}
      {confirmingCancel && (
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
            <h2 id="cancel-payment-title" className={styles.confirmTitle}>
              {t('kiosk.cancelPaymentConfirmTitle')}
            </h2>
            <p id="cancel-payment-desc">{t('kiosk.cancelPaymentConfirm')}</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancel}
                onClick={flow.confirmCancel}
                disabled={flow.cancelPending}
              >
                {flow.cancelPending ? t('kiosk.cancelling') : t('kiosk.cancelAnyway')}
              </button>
              <button
                type="button"
                className={styles.primary}
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

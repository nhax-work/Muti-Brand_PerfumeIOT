import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorMessage, useCreateOrder, useKioskCatalog, useOrderStatus } from '@/shared/api';
import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import { phaseOf, secondsUntil, type CheckoutPhase } from './checkout-phase';
import styles from './CheckoutScreen.module.css';

/** Về trang chủ sau khi đơn kết thúc — khách tiếp theo không thấy kết quả của người trước. */
const RETURN_HOME_AFTER_MS = 15_000;
const SETTLED_PHASES = new Set<CheckoutPhase>(['DISPENSED', 'FORFEITED', 'EXPIRED', 'PROBLEM']);

function formatAmount(amount: string, currency: string): string {
  const num = Number(amount);
  return Number.isNaN(num)
    ? `${amount} ${currency}`
    : `${new Intl.NumberFormat('vi-VN').format(num)} ${currency}`;
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Thanh toán và nhận lượt xịt cho một slot (FR-ORD-04..11, FR-ORD-21, FR-ORD-25÷27, ADR-0007).
 *
 * điều khoản bấm nút → tạo đơn → mã thanh toán → (webhook) → "Mời bấm nút số N" → kết quả.
 */
export default function CheckoutScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { slotNumber } = useParams<{ slotNumber: string }>();
  const catalog = useKioskCatalog();
  const { kioskSessionId, startNewSession, setActiveOrder } = useKioskSession();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const createOrder = useCreateOrder();
  const created = createOrder.data;
  const statusQuery = useOrderStatus(created?.order.id ?? null);
  const view = statusQuery.data;
  const now = useNow(500);

  const item = useMemo(
    () => catalog.data?.items.find((i) => String(i.slotNumber) === slotNumber),
    [catalog.data?.items, slotNumber],
  );

  // Đo thời gian đơn nằm ở PAID để biết máy đang bận khách trước (FR-DSP-26).
  const [paidSince, setPaidSince] = useState<number | null>(null);
  const isPaid = view?.status === 'PAID';
  if (isPaid && paidSince === null) setPaidSince(now);
  if (!isPaid && paidSince !== null) setPaidSince(null);
  const phase = phaseOf(view, paidSince === null ? 0 : now - paidSince);

  const goHome = useCallback(() => {
    startNewSession();
    void navigate('/');
  }, [navigate, startNewSession]);

  const settled = created !== undefined && SETTLED_PHASES.has(phase);
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(goHome, RETURN_HOME_AFTER_MS);
    return () => clearTimeout(timer);
  }, [settled, goHome]);

  // Báo cho KioskShell biết khách đang giữa chừng một đơn: không thay màn hình khi mất kết nối, không
  // hiện nút quay lại ở header (FR-IOT-13, FR-ORD-26). Rời màn hình hoặc đơn kết thúc thì gỡ.
  const activeOrderId = created?.order.id;
  const activeReference = created?.order.paymentReference;
  useEffect(() => {
    if (!activeOrderId || !activeReference || settled) {
      setActiveOrder(null);
      return;
    }
    setActiveOrder({ id: activeOrderId, paymentReference: activeReference });
    return () => setActiveOrder(null);
  }, [activeOrderId, activeReference, settled, setActiveOrder]);

  const [confirmingLeave, setConfirmingLeave] = useState(false);

  if (!created && (!item || !item.product || !item.available)) {
    return (
      <section className={styles.checkout}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('kiosk.productUnavailable')}</h1>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void navigate('/catalog')}
          >
            {t('kiosk.backToCatalog')}
          </button>
        </div>
      </section>
    );
  }

  const slot = item?.slotNumber ?? Number(slotNumber);

  // FR-ORD-25: điều khoản bấm nút hiện TRƯỚC mã thanh toán.
  if (!created) {
    return (
      <section className={styles.checkout} aria-label={t('kiosk.checkoutTitle')}>
        <div className={styles.card}>
          {item?.product && <p className={styles.product}>{item.product.name}</p>}
          <h1 className={styles.title}>{t('kiosk.pressTermsTitle')}</h1>
          {/* Khách phải thấy số tiền TRƯỚC khi bấm đồng ý, không phải sau khi đã có mã QR. */}
          {item?.pricePerSpray && (
            <dl className={styles.facts}>
              <dt>{t('kiosk.amountLabel')}</dt>
              <dd>{formatAmount(item.pricePerSpray, item.currency)}</dd>
            </dl>
          )}
          <p className={styles.body}>
            {t('kiosk.pressTerms', { slot, seconds: config.pressWindowSec })}
          </p>
          {createOrder.isError && (
            <p className={styles.error} role="alert">
              {errorMessage(createOrder.error, t)}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void navigate(`/products/${slot}`)}
              disabled={createOrder.isPending}
            >
              {t('kiosk.cancel')}
            </button>
            <button
              id="kiosk-agree-pay-button"
              type="button"
              className={styles.primary}
              disabled={createOrder.isPending || !item}
              onClick={() =>
                item && createOrder.mutate({ slotId: item.slotId, kioskSessionId, idempotencyKey })
              }
            >
              {createOrder.isPending ? t('kiosk.creatingOrder') : t('kiosk.agreeAndPay')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const order = created.order;
  const support = view?.supportReference ?? null;
  // FR-ORD-21: chỉ dẫn khách tới kênh hỗ trợ thật; máy không có nhân viên (BR-001).
  const supportText = (reference: string) =>
    config.supportContact
      ? t('kiosk.supportHint', { reference, contact: config.supportContact })
      : t('kiosk.supportHintNoContact', { reference });

  return (
    <section className={styles.checkout} aria-label={t('kiosk.checkoutTitle')} data-phase={phase}>
      <div className={styles.card}>
        {phase === 'PAYING' && (
          <>
            <h1 className={styles.title}>{t('kiosk.scanToPay')}</h1>
            <div className={styles.qrBox} aria-label={t('kiosk.scanToPay')}>
              <code className={styles.qrPayload}>{created.qrPayload}</code>
            </div>
            <dl className={styles.facts}>
              <dt>{t('kiosk.paymentReference')}</dt>
              <dd className={styles.reference}>{order.paymentReference}</dd>
              <dt>{t('kiosk.amountLabel')}</dt>
              <dd>{formatAmount(order.amount, order.currency)}</dd>
            </dl>
            <p className={styles.muted}>
              {t('kiosk.paymentExpiresIn', { seconds: secondsUntil(order.expiresAt, now) ?? 0 })}
            </p>
            <p className={styles.muted}>{t('kiosk.waitingForPayment')}</p>
            {/* Chưa có API hủy đơn: rời màn hình không hủy được đơn, nên phải dặn khách trước. */}
            {confirmingLeave ? (
              <div className={styles.confirmLeave} role="alertdialog">
                <p className={styles.body}>{t('kiosk.leavePaymentConfirm')}</p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => setConfirmingLeave(false)}
                  >
                    {t('kiosk.stayHere')}
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => void navigate('/catalog')}
                  >
                    {t('kiosk.leaveAnyway')}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirmingLeave(true)}
                >
                  {t('kiosk.goBack')}
                </button>
              </div>
            )}
          </>
        )}

        {/* Mất liên lạc khi đang theo dõi đơn: vẫn giữ mã trên màn hình để khách còn tra cứu được. */}
        {!settled && statusQuery.failureCount > 0 && (
          <p className={styles.error} role="alert">
            {t('kiosk.connectionLostOrder', { reference: order.paymentReference })}
          </p>
        )}

        {phase === 'PREPARING' && <p className={styles.status}>{t('kiosk.preparingMachine')}</p>}
        {phase === 'WAITING_TURN' && <p className={styles.status}>{t('kiosk.waitingForTurn')}</p>}

        {phase === 'PRESS' && (
          <div className={styles.press} role="status">
            <span className={styles.pressBadge} aria-hidden="true">
              {view?.slotNumber ?? slot}
            </span>
            <h1 className={styles.pressTitle}>
              {t('kiosk.pressButtonNow', { slot: view?.slotNumber ?? slot })}
            </h1>
            <p className={styles.countdown}>
              {t('kiosk.pressCountdown', {
                seconds: secondsUntil(view?.pressDeadline, now) ?? config.pressWindowSec,
              })}
            </p>
          </div>
        )}

        {phase === 'CHECKING' && (
          <>
            <p className={styles.status}>{t('kiosk.checkingResult')}</p>
            {support && <p className={styles.muted}>{supportText(support)}</p>}
          </>
        )}

        {phase === 'DISPENSED' && (
          <>
            <h1 className={styles.title}>{t('kiosk.dispensedTitle')}</h1>
            <p className={styles.body}>{t('kiosk.dispensedHint')}</p>
          </>
        )}
        {phase === 'FORFEITED' && (
          <>
            <h1 className={styles.title}>{t('kiosk.pressTimeoutTitle')}</h1>
            <p className={styles.body}>
              {t('kiosk.pressTimeoutHint', { seconds: config.pressWindowSec })}
            </p>
          </>
        )}
        {phase === 'EXPIRED' && (
          <>
            <h1 className={styles.title}>{t('kiosk.paymentExpiredTitle')}</h1>
            <p className={styles.body}>{t('kiosk.paymentExpiredHint')}</p>
            {/* Tiền về sau hạn thì đơn sang REFUND_PENDING — không được hứa "chưa bị trừ tiền". */}
            <p className={styles.muted}>
              {t('kiosk.paymentExpiredLatePayment', { reference: order.paymentReference })}
            </p>
          </>
        )}
        {phase === 'PROBLEM' && (
          <>
            <h1 className={styles.title}>{t('kiosk.orderProblemTitle')}</h1>
            <p className={styles.body}>{supportText(support ?? order.paymentReference)}</p>
          </>
        )}

        {settled && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={goHome}>
              {t('kiosk.backToHome')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

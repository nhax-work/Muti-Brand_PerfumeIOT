import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorMessage, useCreateOrder, useKioskCatalog, useOrderStatus } from '@/shared/api';
import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import { phaseOf, secondsUntil, type CheckoutPhase } from './checkout-phase';
import DispenseSuccessGuide from './DispenseSuccessGuide';
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
 * điều khoản bấm nút → tạo đơn → mã thanh toán QR / Thẻ → (thanh toán thành công) → "Thanh Toán Thành Công & Hướng Dẫn Nhận Lượt Xịt"
 */
export default function CheckoutScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { slotNumber } = useParams<{ slotNumber: string }>();
  const catalog = useKioskCatalog();
  const { kioskSessionId, startNewSession } = useKioskSession();
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

  // Giao diện sau khi thanh toán thành công (Stitch screen d0590f7ae4954294b26d2f0d2b83b28f)
  // Hiển thị ngay sau khi đơn chuyển khỏi trạng thái chờ thanh toán
  const isPostPayment = phase !== 'PAYING' && phase !== 'EXPIRED';

  if (isPostPayment) {
    return (
      <section
        className={styles.checkout}
        aria-label={t('kiosk.paymentSuccessTitle')}
        data-phase={phase}
      >
        <DispenseSuccessGuide
          item={item}
          slot={slot}
          order={order}
          view={view}
          phase={phase}
          now={now}
          settled={settled}
          pressWindowSec={config.pressWindowSec}
          goHome={goHome}
        />
      </section>
    );
  }

  // Màn hình quét mã QR thanh toán hoặc khi mã hết hạn
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
          </>
        )}

        {phase === 'EXPIRED' && (
          <>
            <h1 className={styles.title}>{t('kiosk.paymentExpiredTitle')}</h1>
            <p className={styles.body}>{t('kiosk.paymentExpiredHint')}</p>
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


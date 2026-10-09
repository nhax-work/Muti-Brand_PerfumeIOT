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
  const [prevStatus, setPrevStatus] = useState<string | null>(null);
  const [paidSince, setPaidSince] = useState<number | null>(null);

  const currentStatus = view?.status ?? null;
  if (currentStatus !== prevStatus) {
    setPrevStatus(currentStatus);
    setPaidSince(currentStatus === 'PAID' ? now : null);
  }

  const phase = phaseOf(view, paidSince === null ? 0 : now - paidSince);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const copyText = useCallback((text: string, isCmd: boolean) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      if (isCmd) {
        setCopiedCmd(true);
        setTimeout(() => setCopiedCmd(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    }
  }, []);

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
  const mockPayCmd = `npm run pay:mock -- ${order.paymentReference}`;

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
              <div className={styles.qrSvgFrame}>
                <svg
                  width="180"
                  height="180"
                  viewBox="0 0 180 180"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="QR Code Visual"
                >
                  <rect width="180" height="180" rx="12" fill="#FFFFFF" />
                  {/* Top-Left Finder */}
                  <rect x="14" y="14" width="40" height="40" rx="6" fill="#131315" />
                  <rect x="20" y="20" width="28" height="28" rx="4" fill="#FFFFFF" />
                  <rect x="26" y="26" width="16" height="16" rx="2" fill="#D4AF37" />

                  {/* Top-Right Finder */}
                  <rect x="126" y="14" width="40" height="40" rx="6" fill="#131315" />
                  <rect x="132" y="20" width="28" height="28" rx="4" fill="#FFFFFF" />
                  <rect x="138" y="26" width="16" height="16" rx="2" fill="#D4AF37" />

                  {/* Bottom-Left Finder */}
                  <rect x="14" y="126" width="40" height="40" rx="6" fill="#131315" />
                  <rect x="20" y="132" width="28" height="28" rx="4" fill="#FFFFFF" />
                  <rect x="26" y="138" width="16" height="16" rx="2" fill="#D4AF37" />

                  {/* Matrix decorative dots */}
                  <g fill="#1A191C" opacity="0.9">
                    <rect x="62" y="16" width="6" height="6" rx="1.5" />
                    <rect x="74" y="16" width="6" height="6" rx="1.5" />
                    <rect x="86" y="16" width="6" height="6" rx="1.5" />
                    <rect x="106" y="16" width="6" height="6" rx="1.5" />
                    <rect x="62" y="28" width="6" height="6" rx="1.5" />
                    <rect x="98" y="28" width="6" height="6" rx="1.5" />
                    <rect x="110" y="28" width="6" height="6" rx="1.5" />
                    <rect x="74" y="40" width="6" height="6" rx="1.5" />
                    <rect x="86" y="40" width="6" height="6" rx="1.5" />
                    <rect x="106" y="40" width="6" height="6" rx="1.5" />

                    <rect x="16" y="62" width="6" height="6" rx="1.5" />
                    <rect x="28" y="62" width="6" height="6" rx="1.5" />
                    <rect x="44" y="62" width="6" height="6" rx="1.5" />
                    <rect x="60" y="62" width="6" height="6" rx="1.5" />
                    <rect x="114" y="62" width="6" height="6" rx="1.5" />
                    <rect x="130" y="62" width="6" height="6" rx="1.5" />
                    <rect x="146" y="62" width="6" height="6" rx="1.5" />
                    <rect x="158" y="62" width="6" height="6" rx="1.5" />

                    <rect x="16" y="74" width="6" height="6" rx="1.5" />
                    <rect x="40" y="74" width="6" height="6" rx="1.5" />
                    <rect x="134" y="74" width="6" height="6" rx="1.5" />
                    <rect x="150" y="74" width="6" height="6" rx="1.5" />

                    <rect x="20" y="86" width="6" height="6" rx="1.5" />
                    <rect x="36" y="86" width="6" height="6" rx="1.5" />
                    <rect x="52" y="86" width="6" height="6" rx="1.5" />
                    <rect x="122" y="86" width="6" height="6" rx="1.5" />
                    <rect x="142" y="86" width="6" height="6" rx="1.5" />
                    <rect x="158" y="86" width="6" height="6" rx="1.5" />

                    <rect x="62" y="126" width="6" height="6" rx="1.5" />
                    <rect x="74" y="126" width="6" height="6" rx="1.5" />
                    <rect x="98" y="126" width="6" height="6" rx="1.5" />
                    <rect x="130" y="126" width="6" height="6" rx="1.5" />
                    <rect x="146" y="126" width="6" height="6" rx="1.5" />
                    <rect x="158" y="126" width="6" height="6" rx="1.5" />

                    <rect x="62" y="138" width="6" height="6" rx="1.5" />
                    <rect x="86" y="138" width="6" height="6" rx="1.5" />
                    <rect x="110" y="138" width="6" height="6" rx="1.5" />
                    <rect x="138" y="138" width="6" height="6" rx="1.5" />
                    <rect x="154" y="138" width="6" height="6" rx="1.5" />

                    <rect x="74" y="150" width="6" height="6" rx="1.5" />
                    <rect x="86" y="150" width="6" height="6" rx="1.5" />
                    <rect x="102" y="150" width="6" height="6" rx="1.5" />
                    <rect x="126" y="150" width="6" height="6" rx="1.5" />
                    <rect x="142" y="150" width="6" height="6" rx="1.5" />
                    <rect x="158" y="150" width="6" height="6" rx="1.5" />
                  </g>

                  {/* Logo Center */}
                  <rect x="72" y="72" width="36" height="36" rx="8" fill="#131315" stroke="#D4AF37" strokeWidth="2" />
                  <path d="M84 90C84 86 96 86 96 90C96 94 84 94 84 98C84 102 96 102 96 98" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <code className={styles.qrPayload}>{created.qrPayload}</code>
            </div>

            <dl className={styles.facts}>
              <dt>{t('kiosk.paymentReference')}</dt>
              <dd>
                <div className={styles.referenceRow}>
                  <span className={styles.reference}>{order.paymentReference}</span>
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${copiedCode ? styles.copyBtnCopied : ''}`}
                    onClick={() => copyText(order.paymentReference, false)}
                    title={t('kiosk.copyCode')}
                  >
                    {copiedCode ? t('kiosk.copied') : t('kiosk.copyCode')}
                  </button>
                </div>
              </dd>
              <dt>{t('kiosk.amountLabel')}</dt>
              <dd>{formatAmount(order.amount, order.currency)}</dd>
            </dl>

            {/* Khung hướng dẫn thanh toán giả lập dành cho tester / dev */}
            <div className={styles.devHelper}>
              <div className={styles.devHelperTitle}>
                <span>{t('kiosk.mockPayGuide')}</span>
                <button
                  type="button"
                  className={`${styles.copyBtn} ${copiedCmd ? styles.copyBtnCopied : ''}`}
                  onClick={() => copyText(mockPayCmd, true)}
                >
                  {copiedCmd ? t('kiosk.copied') : t('kiosk.copyCommand')}
                </button>
              </div>
              <div className={styles.devHelperCodeRow}>
                <span className={styles.devHelperCode}>{mockPayCmd}</span>
              </div>
            </div>

            <div className={styles.waitingBox}>
              <div className={styles.waitingSpinner} aria-hidden="true" />
              <span>{t('kiosk.waitingPaymentDesc')}</span>
            </div>

            <p className={styles.countdownTimer}>
              {t('kiosk.paymentExpiresIn', { seconds: secondsUntil(order.expiresAt, now) ?? 0 })}
            </p>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void navigate(`/products/${slot}`)}
              >
                {t('kiosk.cancelOrder')}
              </button>
            </div>
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


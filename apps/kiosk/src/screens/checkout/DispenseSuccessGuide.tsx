import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OrderStatusView } from '@/shared/api';
import { QRCodeSVG } from 'qrcode.react';
import { claimUrlFor, config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { pressDeadlineMs, type CheckoutPhase } from './checkout-phase';
import { ApproachIllustration, MistIllustration, PressIllustration } from './GuideIllustrations';
import styles from './DispenseSuccessGuide.module.css';

/** Màn "Thanh toán thành công" chiếm trọn màn hình trong chừng này rồi mới mở hướng dẫn. */
export const SUCCESS_SPLASH_MS = 2000;

/** Hết giờ bấm nút: để khách đọc thông báo trong chừng này rồi tự về trang chủ. */
export const TIMEOUT_NOTICE_MS = 10_000;

/** Các phase đơn đã trả tiền và đang đi tới lượt xịt — chỉ những phase này mới mở bằng màn chúc mừng. */
const IN_PROGRESS = new Set<CheckoutPhase>(['PREPARING', 'WAITING_TURN', 'PRESS', 'CHECKING']);

/** Đã tới lượt khách nên đồng hồ chạy. `WAITING_TURN` máy còn phục vụ khách trước — chưa đếm. */
const COUNTING = new Set<CheckoutPhase>(['PREPARING', 'PRESS', 'CHECKING']);

type TimeoutOutcome = Extract<CheckoutPhase, 'FORFEITED' | 'PROBLEM'>;

export interface DispenseSuccessGuideProps {
  slot: number;
  order: { id: string; paymentReference: string };
  view?: OrderStatusView;
  phase: CheckoutPhase;
  now: number;
  pressWindowSec: number;
  goHome: () => void;
}

/**
 * Sau thanh toán (FR-ORD-11, FR-ORD-21, FR-ORD-26, FR-ORD-27, ADR-0007): màn chúc mừng toàn màn
 * hình ~2 giây, rồi modal hướng dẫn bằng hình động — chỉ một dòng chữ chính "Nhấn nút ở ô số N".
 * Thiết kế cho tablet 10 inch: mọi trạng thái vừa một màn hình, không cuộn.
 */
export default function DispenseSuccessGuide({
  slot,
  order,
  view,
  phase,
  now,
  pressWindowSec,
  goHome,
}: DispenseSuccessGuideProps) {
  const { t } = useI18n();
  const slotNo = view?.slotNumber ?? slot;

  const [splashOver, setSplashOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSplashOver(true), SUCCESS_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);
  const showSplash = !splashOver && IN_PROGRESS.has(phase);

  // Đồng hồ bấm nút chạy từ lúc modal hướng dẫn hiện (sau màn chúc mừng). Đang chờ lượt thì dừng và
  // đếm lại từ đầu khi tới lượt.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState<TimeoutOutcome | null>(null);
  const counting = splashOver && COUNTING.has(phase);
  if (counting && turnStartedAt === null) setTurnStartedAt(now);
  if (phase === 'WAITING_TURN' && turnStartedAt !== null && timedOut === null) {
    setTurnStartedAt(null);
  }

  const deadline = pressDeadlineMs(turnStartedAt, pressWindowSec, view?.pressDeadline);
  const secondsLeft =
    deadline === null ? pressWindowSec : Math.max(0, Math.ceil((deadline - now) / 1000));

  // Hết giờ mà máy chủ chưa báo kết quả: đèn đã sáng → khách bỏ lượt; đèn chưa từng sáng → sự cố
  // máy, không đổ lỗi cho khách và đưa mã hỗ trợ. Chốt một lần để màn hình không nhảy qua lại.
  if (timedOut === null && counting && deadline !== null && now >= deadline) {
    setTimedOut(phase === 'PRESS' ? 'FORFEITED' : 'PROBLEM');
  }
  // Kết quả thật từ máy chủ (đã xịt, hết giờ, sự cố) luôn thắng mốc cục bộ.
  const shown: CheckoutPhase = timedOut !== null && IN_PROGRESS.has(phase) ? timedOut : phase;

  const goHomeRef = useRef(goHome);
  useEffect(() => {
    goHomeRef.current = goHome;
  });
  const autoHome = shown === 'FORFEITED' || (timedOut !== null && IN_PROGRESS.has(phase));
  useEffect(() => {
    if (!autoHome) return;
    const timer = setTimeout(() => goHomeRef.current(), TIMEOUT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [autoHome]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispense-guide-title"
      data-phase={shown}
    >
      {showSplash ? (
        <div className={styles.splash} role="status">
          <div className={styles.splashCheck} aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <path d="M14 27 l8 8 l16 -18" />
            </svg>
          </div>
          <h1 id="dispense-guide-title" className={styles.splashTitle}>
            {t('kiosk.paymentSuccessTitle')}
          </h1>
        </div>
      ) : IN_PROGRESS.has(shown) ? (
        <GuideModal
          phase={shown}
          slot={slotNo}
          secondsLeft={secondsLeft}
          pressWindowSec={pressWindowSec}
        />
      ) : (
        <ResultModal
          phase={shown}
          order={order}
          view={view}
          pressWindowSec={pressWindowSec}
          goHome={goHome}
        />
      )}
    </div>
  );
}

function GuideModal({
  phase,
  slot,
  secondsLeft,
  pressWindowSec,
}: {
  phase: CheckoutPhase;
  slot: number;
  secondsLeft: number;
  pressWindowSec: number;
}) {
  const { t } = useI18n();
  const lit = phase === 'PRESS';
  const counting = COUNTING.has(phase);

  const steps: { key: string; art: ReactNode; caption: string }[] = [
    { key: 'approach', art: <ApproachIllustration />, caption: t('kiosk.guideStepApproach') },
    {
      key: 'press',
      art: <PressIllustration slot={slot} />,
      caption: t('kiosk.guideStepPress', { slot }),
    },
    { key: 'mist', art: <MistIllustration />, caption: t('kiosk.guideStepHold') },
  ];

  return (
    <div className={styles.modal} data-testid="dispense-guide">
      <div className={styles.heading}>
        <h1 id="dispense-guide-title" className={styles.headingText}>
          {t('kiosk.guidePressHeading')}
        </h1>
        <span className={`${styles.slotBadge} ${lit ? styles.slotBadgeLit : ''}`}>{slot}</span>
      </div>

      {/* Một dòng trạng thái duy nhất: khách chỉ cần biết đèn đã sáng chưa và còn bao lâu. */}
      <p className={`${styles.status} ${lit ? styles.statusLit : ''}`} role="status">
        <span className={styles.statusDot} aria-hidden="true" />
        <span>
          {lit
            ? t('kiosk.guideStatusLit')
            : phase === 'WAITING_TURN'
              ? t('kiosk.guideStatusWaiting')
              : t('kiosk.guideStatusPreparing')}
        </span>
        {counting && (
          <strong className={styles.countdown}>
            {t('kiosk.pressCountdown', { seconds: secondsLeft })}
          </strong>
        )}
      </p>

      <ol className={styles.steps}>
        {steps.map((s, i) => (
          <li key={s.key} className={styles.step}>
            <div className={styles.stepArt}>
              <span className={styles.stepIndex} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.art}
            </div>
            <p className={styles.stepCaption}>{s.caption}</p>
          </li>
        ))}
      </ol>

      {counting && (
        <div className={styles.timeBar} aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.min(1, secondsLeft / pressWindowSec)})` }} />
        </div>
      )}
    </div>
  );
}

function ResultModal({
  phase,
  order,
  view,
  pressWindowSec,
  goHome,
}: {
  phase: CheckoutPhase;
  order: { id: string; paymentReference: string };
  view?: OrderStatusView;
  pressWindowSec: number;
  goHome: () => void;
}) {
  const { t } = useI18n();
  const done = phase === 'DISPENSED';
  const reference = view?.supportReference ?? order.paymentReference;
  // Tiền về sau khi mã hết hạn/bị hủy: đơn REFUND_PENDING mà chưa từng có lệnh xịt (FR-ORD-16 AC3).
  const latePayment = view?.status === 'REFUND_PENDING' && !view.dispenseStatus;

  // FR-ORD-28: máy chủ chỉ trả claimToken khi đơn đủ điều kiện khiếu nại và chưa có phiếu.
  const claimUrl =
    phase === 'PROBLEM' && view?.claimToken
      ? claimUrlFor(config.claimPageUrl, order.id, view.claimToken)
      : null;

  return (
    <div className={`${styles.modal} ${styles.resultModal}`}>
      <div
        className={`${styles.resultIcon} ${done ? styles.resultIconDone : ''}`}
        aria-hidden="true"
      >
        {done ? (
          <svg viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <line x1="12" y1="7" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
      </div>

      <h1 id="dispense-guide-title" className={styles.resultTitle}>
        {done
          ? t('kiosk.dispensedTitle')
          : phase === 'FORFEITED'
            ? t('kiosk.pressTimeoutTitle')
            : latePayment
              ? t('kiosk.latePaymentTitle')
              : t('kiosk.orderProblemTitle')}
      </h1>

      {done && <p className={styles.resultText}>{t('kiosk.dispensedHint')}</p>}

      {phase === 'FORFEITED' && (
        <p className={styles.resultText}>
          {t('kiosk.pressTimeoutHint', { seconds: pressWindowSec })}
        </p>
      )}

      {phase === 'PROBLEM' && (
        <>
          {/* Tiền về sau khi mã đã hết hạn/bị hủy: máy không xịt, khách được hoàn tiền (FR-ORD-16 AC3). */}
          {latePayment && <p className={styles.resultText}>{t('kiosk.latePaymentHint')}</p>}
          {/* FR-ORD-21, FR-ORD-28: QR sự cố dẫn tới trang khiếu nại hoàn tiền (ADR-0012). */}
          {claimUrl && (
            <div className={styles.claimQr}>
              <QRCodeSVG
                value={claimUrl}
                size={168}
                level="M"
                role="img"
                aria-label={t('kiosk.claimQrTitle')}
              />
              <strong>{t('kiosk.claimQrTitle')}</strong>
              <span>{t('kiosk.claimQrHint', { hours: config.refundClaimSlaHours })}</span>
            </div>
          )}
          {/* FR-ORD-21: chỉ dẫn tới kênh hỗ trợ thật; máy không có nhân viên (BR-001). */}
          <p className={styles.resultText}>
            {config.supportContact
              ? t('kiosk.supportHint', { reference, contact: config.supportContact })
              : t('kiosk.supportHintNoContact', { reference })}
          </p>
        </>
      )}

      <button type="button" className={styles.homeButton} onClick={goHome}>
        {t('kiosk.backToHome')}
      </button>
    </div>
  );
}

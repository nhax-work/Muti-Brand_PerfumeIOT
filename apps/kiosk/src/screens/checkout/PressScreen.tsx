import { useEffect, useState } from 'react';
import { STEP_SOURCES } from '@/assets/steps';
import { config } from '@/shared/config';
import { useI18n } from '@/shared/i18n';
import { useDarkShell } from '@/shared/shell/chrome';
import { StepAnimation } from './StepAnimation';
import styles from './PressScreen.module.css';

/** Mỗi bước hướng dẫn sáng chừng này rồi chuyển sang bước kế (01 → 02 → 03 → 01…). */
const STEP_MS = 2500;
/** Trong chừng này giây cuối vòng số nút nháy nhanh hơn — vẫn màu đèn, không đỏ. */
const HURRY_SEC = 10;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Màn "đèn đã sáng" (FR-ORD-26): nền tối cả header, số nút lớn màu đèn có vòng đếm ngược theo
 * `pressDeadline` máy chủ trả, "Nhấn nút số N · Còn S giây"; dưới là ba bước sáng lần lượt. Bật giảm
 * chuyển động thì không nháy, không hoạt ảnh — chỉ giữ bước 02 (nhấn nút) sáng tĩnh.
 */
export function PressScreen({ slot, secondsLeft }: { slot: number; secondsLeft: number | null }) {
  const { t } = useI18n();
  useDarkShell(true);

  const [still] = useState(prefersReducedMotion);
  const [step, setStep] = useState(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % 3), STEP_MS);
    return () => clearInterval(timer);
  }, [still]);

  const fraction = secondsLeft === null ? 1 : Math.min(1, secondsLeft / config.pressWindowSec);
  const hurry = secondsLeft !== null && secondsLeft <= HURRY_SEC;
  // "Còn {seconds} giây" / "{seconds} seconds left": tách quanh số để số giây in lớn, đúng trật tự
  // từng ngôn ngữ.
  const [before, after] =
    secondsLeft === null ? ['', ''] : t('kiosk.pressCountdown', { seconds: '§' }).split('§');

  const captions = [
    t('kiosk.guideStepApproach'),
    t('kiosk.guideStepPress', { slot }),
    t('kiosk.guideStepHold'),
  ];

  return (
    <section className={styles.page} aria-labelledby="press-title">
      <div className={styles.top}>
        <div className={`${styles.lamp} ${hurry ? styles.hurry : ''}`}>
          <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="48" pathLength={100} />
            <circle
              className={styles.ringLeft}
              cx="50"
              cy="50"
              r="48"
              pathLength={100}
              strokeDasharray={`${fraction * 100} 100`}
            />
          </svg>
          <span className={styles.lampNo} aria-label={t('kiosk.buttonNumber', { slot })}>
            {slot}
          </span>
        </div>
        <div className={styles.copy}>
          <h1 id="press-title" className={styles.title}>
            {t('kiosk.pressButtonN', { slot })}
          </h1>
          {secondsLeft !== null && (
            <p className={styles.count} role="timer">
              {before}
              <strong>{secondsLeft}</strong>
              {after}
            </p>
          )}
        </div>
      </div>

      <ol className={styles.steps}>
        {STEP_SOURCES.map((source, i) => (
          <li key={i} className={styles.card} data-active={i === step}>
            <span className={styles.stepNo}>{String(i + 1).padStart(2, '0')}</span>
            <StepAnimation source={source} slot={slot} active={i === step} />
            <p className={styles.caption}>{captions[i]}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

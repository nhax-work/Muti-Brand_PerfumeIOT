import { useMemo } from 'react';
import type { CatalogItem, OrderStatusView } from '@/shared/api';

import { useI18n } from '@/shared/i18n';
import { secondsUntil, type CheckoutPhase } from './checkout-phase';
import styles from './DispenseSuccessGuide.module.css';

const FALLBACK_BOTTLES: Record<number, string> = {
  1: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjHLKHQ-e9v8rbVauKmO7a4XdFgitH2PX04adOLTIDcdpPwTMgj-ABCxgZT3y1iVk4EkVCclPnFJrm2AP7heA3adEYnqsJsWfuHluEESKmnpcpMphfmLkxdj5oTKVTETo2E8JdzRMpvqTaHozpF27TbIsqMhy3BEIWgUjwP0FNUks_8sX00O_fphckeGjDYOqtj7WxsNLAxCBLfThMPkP3xN9K3q-NAOeoySXLnRZdVHO09viZHUTm',
  2: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCi8kgz8yWcTDwPznpLifDSV9mqx5f3T3sYLxfM6aJ_dbkYiY_UC6j3hY7txxWfnMG_isJJ_WxlMdGt86bRV0k5TcAN7LhxMhSljyTmn-S0JL3tHi7E5tKCO0o1rDcYx1bUoCUByKyl285EKIYD9FVctJyP40qzusM13xM7ejEW6CiqwAJQ0giQD8CVUL1YFtP4SrXTwDlazB_1IZIdSpdY4fOXGMnYaHb0jli_1Dxeu02TDqO-E1Ce',
  3: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDrwnlACE74MpP3ze5UCHx_2MWHdGE2a8EZ9tRcjojME_0ZFCpdnP8jrPGBhM6K1Mgy7p_XSRWJLkdJ_wej47ts_3-MrYMHDU42ZQVo25IJO2lIXI8_BCcJ5IMtnb3uL-ftOT32o5Bvy9EoQXsQvhVifruPsELMB_uIfnTopfCgYTTWWVGV1kCOGuW8ZvwdU1C3JUXQZcGEjkAzJriCenzlJFxWW23Nk5LJXIhwJ_DJu1i9vd1buJsL',
  4: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDhEcCtoyj-KiT2weL0jXt1iCyGCvxYPjrqSQ1hyqIdMsULOb2OpvFNcrpU-Oaz7Qd-fcogDGELsRPoK2ByYreFQ6wn7Z3PdFRLDz9DKjfQ9vllHdOZ-0K7e9Frpr_7mvKpGnpz1lQUl-NcssHIf8GV4tORcyBPSyLHP1uvMBw8U0nv4wa9oreMxMhsc28LTVNijTDmfP30P5J3ZboqBmEG9RPa935bwAEgRRe-XEJAGJVrtJg-_BwT',
};

function formatAmount(amount: string, currency: string): string {
  const num = Number(amount);
  return Number.isNaN(num)
    ? `${amount} ${currency}`
    : `${new Intl.NumberFormat('vi-VN').format(num)} ${currency}`;
}

export interface DispenseSuccessGuideProps {
  item?: CatalogItem;

  slot: number;
  order: {
    id: string;
    paymentReference: string;
    amount: string;
    currency: string;
  };
  view?: OrderStatusView;
  phase: CheckoutPhase;
  now: number;
  settled: boolean;
  pressWindowSec: number;
  goHome: () => void;
}

/**
 * Màn hình Thanh toán thành công & Hướng dẫn nhận lượt xịt (Stitch UI: d0590f7ae4954294b26d2f0d2b83b28f)
 * Hiển thị sau khi quét mã QR hoặc chạm thẻ quốc tế POS/NFC thành công.
 * Hướng dẫn khách đưa cổ tay cách vòi xịt 10-15cm và bấm nút vật lý đang sáng đèn trên máy.
 */
export default function DispenseSuccessGuide({
  item,
  slot,
  order,
  view,
  phase,
  now,
  settled,
  pressWindowSec,
  goHome,
}: DispenseSuccessGuideProps) {
  const { t } = useI18n();

  const product = item?.product;
  const bottleImg = product?.imageUrl || FALLBACK_BOTTLES[slot] || FALLBACK_BOTTLES[1];

  const secondsLeft = useMemo(() => {
    return secondsUntil(view?.pressDeadline, now) ?? pressWindowSec;
  }, [view?.pressDeadline, now, pressWindowSec]);

  const countdownPercent = useMemo(() => {
    if (pressWindowSec <= 0) return 0;
    return Math.min(100, Math.max(0, (secondsLeft / pressWindowSec) * 100));
  }, [secondsLeft, pressWindowSec]);

  const support = view?.supportReference ?? null;

  return (
    <div className={styles.container} role="region" aria-label={t('kiosk.paymentSuccessTitle')}>
      {/* 1. Header Banner */}
      <section className={styles.headerBanner}>
        <div className={styles.badgeRow}>
          <span className={styles.successBadge}>
            <svg
              className={styles.successIcon}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            {t('kiosk.paymentSuccessBadge')}
          </span>
        </div>
        <h1 className={styles.title}>{t('kiosk.paymentSuccessTitle')}</h1>
        <p className={styles.subtitle}>{t('kiosk.paymentSuccessSubtitle')}</p>
      </section>

      {/* 2. Main 2-Column Grid */}
      <div className={styles.grid}>
        {/* Column 1: Slot & Live Machine State */}
        <div className={styles.dispenserCard}>
          <div className={styles.productHeader}>
            <div className={styles.bottleThumbWrapper}>
              <img
                src={bottleImg}
                alt={product?.name ?? `Slot ${slot}`}
                className={styles.bottleThumb}
              />
            </div>
            <div className={styles.productMeta}>
              <span className={styles.productBrand}>{item?.brandName ?? 'Scentation Paris'}</span>
              <h2 className={styles.productName}>{product?.name ?? `Hương thơm ngăn ${slot}`}</h2>
              <span className={styles.slotTag}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {t('kiosk.slotNumber', { slot })}
              </span>
            </div>
          </div>

          {/* Action / Phase Display Area */}
          <div className={styles.actionArea} data-phase={phase}>
            {phase === 'PRESS' && (
              <div className={styles.pressWrapper} role="status">
                <div className={styles.pressButtonHalo}>
                  <div className={styles.pressBadge} aria-hidden="true">
                    <span>{view?.slotNumber ?? slot}</span>
                    <span className={styles.pressBadgeLabel}>PUSH</span>
                  </div>
                </div>

                <h3 className={styles.pressPrompt}>
                  {t('kiosk.pressButtonNow', { slot: view?.slotNumber ?? slot })}
                </h3>

                <div className={styles.countdownBadge}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{t('kiosk.pressCountdown', { seconds: secondsLeft })}</span>
                </div>

                <div className={styles.countdownBarTrack} aria-hidden="true">
                  <div
                    className={styles.countdownBarFill}
                    style={{ width: `${countdownPercent}%` }}
                  />
                </div>

                <p className={styles.pressHint}>{t('kiosk.pressSlotHint', { slot })}</p>
              </div>
            )}

            {phase === 'PREPARING' && (
              <div className={styles.loadingWrapper} role="status">
                <div className={styles.spinner} aria-hidden="true" />
                <h3 className={styles.statusTitle}>{t('kiosk.preparingMachine')}</h3>
                <p className={styles.statusMuted}>{t('kiosk.preparingSlotHint', { slot })}</p>
              </div>
            )}

            {phase === 'WAITING_TURN' && (
              <div className={styles.loadingWrapper} role="status">
                <div className={styles.spinner} aria-hidden="true" />
                <h3 className={styles.statusTitle}>{t('kiosk.waitingForTurn')}</h3>
              </div>
            )}

            {phase === 'CHECKING' && (
              <div className={styles.loadingWrapper} role="status">
                <div className={styles.spinner} aria-hidden="true" />
                <h3 className={styles.statusTitle}>{t('kiosk.checkingResult')}</h3>
                {support && (
                  <p className={styles.statusMuted}>{t('kiosk.supportHint', { reference: support })}</p>
                )}
              </div>
            )}

            {phase === 'DISPENSED' && (
              <div className={styles.dispensedWrapper} role="status">
                <svg
                  className={styles.sparkleIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  <circle cx="12" cy="12" r="4" fill="rgba(212, 175, 55, 0.2)" />
                </svg>
                <h3 className={styles.statusTitle}>{t('kiosk.dispensedTitle')}</h3>
                <p className={styles.statusMuted}>{t('kiosk.dispensedHint')}</p>
              </div>
            )}

            {phase === 'FORFEITED' && (
              <div className={styles.dispensedWrapper} role="status">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a12828"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <h3 className={styles.statusTitle}>{t('kiosk.pressTimeoutTitle')}</h3>
                <p className={styles.statusMuted}>{t('kiosk.pressTimeoutHint')}</p>
              </div>
            )}

            {phase === 'PROBLEM' && (
              <div className={styles.dispensedWrapper} role="status">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a12828"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <h3 className={styles.statusTitle}>{t('kiosk.orderProblemTitle')}</h3>
                <p className={styles.statusMuted}>
                  {t('kiosk.supportHint', { reference: support ?? order.paymentReference })}
                </p>
              </div>
            )}
          </div>

          {/* Order Summary Footer */}
          <div className={styles.orderFooter}>
            <div>
              <span>{t('kiosk.paymentReference')}: </span>
              <span className={styles.orderRef}>{order.paymentReference}</span>
            </div>
            <div>
              <span>{t('kiosk.amountLabel')}: </span>
              <strong style={{ color: '#000000' }}>
                {formatAmount(order.amount, order.currency)}
              </strong>
            </div>
          </div>
        </div>

        {/* Column 2: 3-Step Haute Parfumerie Ritual Guide */}
        <div className={styles.guideCard}>
          <div className={styles.guideHeader}>
            <span className={styles.guideTitle}>{t('kiosk.dispenseGuideTitle')}</span>
            <span style={{ fontSize: '11px', color: '#99907c', letterSpacing: '0.1em' }}>
              HAUTE PROTOCOL
            </span>
          </div>

          <div className={styles.stepsList}>
            {/* Step 1 */}
            <div className={`${styles.stepItem} ${phase === 'PREPARING' || phase === 'WAITING_TURN' ? styles.stepItemActive : ''}`}>
              <div className={styles.stepIconFrame} aria-hidden="true">
                {/* SVG Wrist 10-15cm illustration */}
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 26c0-4 2-8 5-11l3-3" strokeLinecap="round" />
                  <path d="M12 28c0-5 3-9 7-12" strokeLinecap="round" />
                  <rect x="22" y="6" width="6" height="8" rx="1.5" stroke="#000" />
                  <line x1="22" y1="10" x2="18" y2="10" strokeDasharray="2 2" />
                  <path d="M16 8l-3 2 3 2" fill="none" />
                </svg>
              </div>
              <div className={styles.stepBody}>
                <span className={styles.stepNumber}>BƯỚC 01</span>
                <h4 className={styles.stepItemTitle}>{t('kiosk.step1Title')}</h4>
                <p className={styles.stepItemDesc}>{t('kiosk.step1Desc', { slot })}</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className={`${styles.stepItem} ${phase === 'PRESS' ? styles.stepItemActive : ''}`}>
              <div className={styles.stepIconFrame} aria-hidden="true">
                {/* SVG Push Button illustration */}
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="16" cy="16" r="10" stroke="#d4af37" strokeWidth="2" />
                  <circle cx="16" cy="16" r="5" fill="#d4af37" />
                  <path d="M16 2v4M16 26v4M2 16h4M26 16h4" strokeLinecap="round" />
                </svg>
              </div>
              <div className={styles.stepBody}>
                <span className={styles.stepNumber}>BƯỚC 02</span>
                <h4 className={styles.stepItemTitle}>{t('kiosk.step2Title', { slot })}</h4>
                <p className={styles.stepItemDesc}>{t('kiosk.step2Desc', { slot })}</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className={`${styles.stepItem} ${phase === 'DISPENSED' ? styles.stepItemActive : ''}`}>
              <div className={styles.stepIconFrame} aria-hidden="true">
                {/* SVG Fine Mist cloud illustration */}
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 18a4 4 0 017-2 5 5 0 019 3 4 4 0 01-3 7H9a4 4 0 011-8z" />
                  <circle cx="6" cy="12" r="1" fill="#d4af37" />
                  <circle cx="24" cy="9" r="1.5" fill="#d4af37" />
                  <circle cx="28" cy="15" r="1" fill="#d4af37" />
                </svg>
              </div>
              <div className={styles.stepBody}>
                <span className={styles.stepNumber}>BƯỚC 03</span>
                <h4 className={styles.stepItemTitle}>{t('kiosk.step3Title')}</h4>
                <p className={styles.stepItemDesc}>{t('kiosk.step3Desc')}</p>
              </div>
            </div>
          </div>

          {/* Safety Callout */}
          <div className={styles.safetyBox}>
            <svg
              className={styles.safetyIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div>
              <p style={{ margin: 0 }}>{t('kiosk.safetyNote')}</p>
              {phase === 'PRESS' && (
                <p style={{ margin: '4px 0 0 0', color: '#a12828', fontWeight: 600 }}>
                  {t('kiosk.forfeitNote')}
                </p>
              )}
            </div>
          </div>

          {/* Settled Actions (Home button) */}
          {settled && (
            <div className={styles.settledActions}>
              <button
                type="button"
                className={styles.homeButton}
                onClick={goHome}
              >
                {t('kiosk.backToHome')}
              </button>
              <p className={styles.autoHomeHint}>
                Màn hình sẽ tự động về trang chủ sau vài giây
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

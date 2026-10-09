import { useMemo } from 'react';
import type { CatalogItem, OrderStatusView } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { secondsUntil, type CheckoutPhase } from './checkout-phase';
import styles from './DispenseSuccessGuide.module.css';

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
 * Màn hình Thanh toán thành công & Hướng dẫn nhận lượt xịt
 * Chuẩn 100% thiết kế Stitch Screen ID: d0590f7ae4954294b26d2f0d2b83b28f
 * "Khoảnh khắc hương sẵn sàng" — Haute Parfumerie Minimalist Luxury
 */
export default function DispenseSuccessGuide({
  item,
  slot,
  order,
  view,
  phase,
  now,
  settled: _settled,
  pressWindowSec,
  goHome,
}: DispenseSuccessGuideProps) {
  const { t } = useI18n();

  const product = item?.product;
  const productName = product?.name ?? "Nuit d'Or (50ml)";

  const secondsLeft = useMemo(() => {
    return secondsUntil(view?.pressDeadline, now) ?? pressWindowSec;
  }, [view?.pressDeadline, now, pressWindowSec]);

  // Thông điệp trạng thái vòi xịt theo phase thực tế
  const statusHeadline = useMemo(() => {
    if (phase === 'PRESS') {
      return `VÒI XỊT SẴN SÀNG: MỜI BẤM NÚT SỐ ${view?.slotNumber ?? slot} (CÒN ${secondsLeft} GIÂY)`;
    }
    if (phase === 'DISPENSED') {
      return 'VÒI XỊT ĐÃ HOÀN TẤT PHUN SƯƠNG';
    }
    if (phase === 'PREPARING') {
      return 'VÒI XỊT SẴN SÀNG TRONG: ĐANG CHUẨN BỊ';
    }
    if (phase === 'WAITING_TURN') {
      return 'MÁY ĐANG PHỤC VỤ KHÁCH TRƯỚC, VUI LÒNG CHỜ TRONG GIÂY LÁT';
    }
    return 'VÒI XỊT SẴN SÀNG TRONG: ĐANG KẾT NỐI';
  }, [phase, view?.slotNumber, slot, secondsLeft]);

  return (
    <div
      className={styles.fullScreenOverlay}
      role="region"
      aria-label={t('kiosk.paymentSuccessTitle')}
      data-phase={phase}
    >
      {/* 1. Header Navigation */}
      <header className={styles.topNav}>
        <div className={styles.navLinks}>
          <span className={styles.navLink}>COLLECTIONS</span>
          <span className={styles.navLink}>DIAGNOSTIC</span>
        </div>

        <div className={styles.brandLogo}>
          <h2 className={styles.brandTitle}>SCENTATION</h2>
          <span className={styles.brandSubtitle}>PARIS</span>
        </div>

        <div className={styles.navActions}>
          <span>VI / EN</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className={styles.mainContent}>
        {/* Checkmark Circle & Heading */}
        <section className={styles.statusHeader}>
          <div className={styles.checkCircle} aria-hidden="true">
            <svg
              className={styles.checkIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <span className={styles.badgeSuccess}>{t('kiosk.paymentSuccessTitle')}</span>

          <h1 className={styles.mainTitle}>
            {phase === 'FORFEITED'
              ? t('kiosk.pressTimeoutTitle')
              : phase === 'DISPENSED'
                ? t('kiosk.dispensedTitle')
                : phase === 'PROBLEM'
                  ? t('kiosk.orderProblemTitle')
                  : 'KHOẢNH KHẮC HƯƠNG SẴN SÀNG'}
          </h1>

          <div className={styles.metaSubtitle}>
            {phase === 'FORFEITED' ? (
              <p>{t('kiosk.pressTimeoutHint')}</p>
            ) : phase === 'DISPENSED' ? (
              <p>{t('kiosk.dispensedHint')}</p>
            ) : phase === 'PROBLEM' ? (
              <p>{t('kiosk.supportHint', { reference: order.paymentReference })}</p>
            ) : (
              <p>
                MÃ GIAO DỊCH: #{order.paymentReference} / {productName.toUpperCase()} / 1 LƯỢT TRẢI
                NGHIỆM
              </p>
            )}
          </div>
        </section>

        {/* Live Machine Status Bar */}
        <section className={styles.statusBar} role="status">
          <div className={styles.statusBarLeft}>
            <span className={styles.mistBadge}>MIST</span>
            <div>
              <p className={styles.statusTextTitle}>
                {phase === 'PRESS' ? (
                  <>
                    <span>{t('kiosk.pressButtonNow', { slot: view?.slotNumber ?? slot })}</span>
                    {' — '}
                    <span>{t('kiosk.pressCountdown', { seconds: secondsLeft })}</span>
                  </>
                ) : (
                  <span>{statusHeadline}</span>
                )}
              </p>
              <p className={styles.statusTextSub}>
                {phase === 'PRESS'
                  ? t('kiosk.pressSlotHint', { slot: view?.slotNumber ?? slot })
                  : 'Vui lòng chuẩn bị và chọn vị trí trước buồng phun sương tự động.'}
              </p>
            </div>
          </div>
          <div className={styles.statusBarRight}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>SIÊU ÂM VI HẠT</span>
          </div>
        </section>

        {/* Guide Title Indicator */}
        <div className={styles.guideSectionTitle}>
          <span>{t('kiosk.dispenseGuideTitle')}</span>
        </div>

        {/* 2-Cards Grid: Cách 1 & Cách 2 */}
        <section className={styles.cardsGrid} aria-label={t('kiosk.dispenseGuideTitle')}>
          {/* Card 1: Trải Nghiệm Trực Tiếp */}
          <article className={styles.experienceCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardWayTitle}>CÁCH 1: TRẢI NGHIỆM TRỰC TIẾP</span>
              <span className={styles.cardStepNumber}>01 / MIST</span>
            </div>

            <div className={styles.cardVisualArea}>
              <img
                src="/images/dispense-method-1.png"
                alt="Cách 1: Trải nghiệm trực tiếp - đứng trước vòi xịt"
                className={styles.visualIllustration}
              />
              <span className={styles.distanceTag}>KHOẢNG CÁCH: 30-40 CM</span>
            </div>

            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>Đứng trước vòi xịt để xịt vào người</h3>
              <p className={styles.cardDesc}>
                Đứng cách vòi phun khoảng 30 - 40 cm. Giữ tư thế thoải mái để màn sương mịn lan tỏa
                đều lên cổ tay, cổ hoặc trang phục.
              </p>
            </div>

            <div className={styles.cardFooter}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24" />
              </svg>
              <span>TRẢI NGHIỆM ĐA GIÁC QUAN TRÊN CƠ THỂ</span>
            </div>
          </article>

          {/* Card 2: Thử Trên Điểm Mạch */}
          <article className={styles.experienceCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardWayTitle}>CÁCH 2: THỬ TRÊN ĐIỂM MẠCH</span>
              <span className={styles.cardStepNumber}>02 / PULSE</span>
            </div>

            <div className={styles.cardVisualArea}>
              <img
                src="/images/dispense-method-2.png"
                alt="Cách 2: Thử trên điểm mạch - đưa cổ tay hoặc mu bàn tay"
                className={styles.visualIllustration}
              />
              <span className={styles.distanceTag}>KHOẢNG CÁCH: 10–15 CM</span>
            </div>

            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>{t('kiosk.step1Title')}</h3>
              <p className={styles.cardDesc}>
                Đưa phần cổ tay hoặc mu bàn tay cách vòi xịt khoảng 10–15 cm.{' '}
                {t('kiosk.step2Title', { slot: view?.slotNumber ?? slot })}. Giữ yên tư thế để màn
                sương nước hoa phủ đều trực tiếp lên vùng da mạch đập.
              </p>
              <div className={styles.cardSubStep}>
                <span>{t('kiosk.step3Title')}</span>
              </div>
            </div>

            <div className={styles.cardFooter}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 21a9 9 0 0 0 9-9c0-4.97-4.03-9-9-9s-9 4.03-9 9 4.03 9 9 9Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>VÙNG DA MẠCH ĐẬP GIỮ HƯƠNG LÂU NHẤT</span>
            </div>
          </article>
        </section>

        {/* Ultrasonic System Countdown Notice */}
        <p className={styles.ultrasonicNotice}>
          HỆ THỐNG VÒI PHUN SIÊU ÂM ĐANG TỰ ĐỘNG ĐẾM NGƯỢC. CHU KỲ PHUN HOÀN TOÀN TỰ ĐỘNG SAU KHI
          SẴN SÀNG.
        </p>

        {/* 3. Action Buttons */}
        <div className={styles.actionButtonsRow}>
          <button type="button" className={styles.primaryActionBtn} onClick={goHome}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span>ĐÃ HOÀN TẤT LƯỢT XỊT</span>
          </button>

          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={goHome}
            aria-label="Trang chủ"
          >
            <span>{phase === 'DISPENSED' ? 'Trang chủ' : 'HOÀN TẤT & QUAY LẠI'}</span>
          </button>
        </div>
      </main>

      {/* 4. Bottom Brand Footer */}
      <footer className={styles.bottomFooter}>
        <div className={styles.footerRow1}>
          <span>PLACE VENDÔME KIOSK TERMINAL</span>
          <span>CÔNG NGHỆ PHUN SƯƠNG SIÊU ÂM • SCENTATION PARIS</span>
        </div>
        <div className={styles.footerRow2}>
          <span>BOUTIQUE EXPLORATION UNIT &nbsp; NO. 04 — PLACE VENDÔME</span>
          <span>HAUTE PARFUMERIE INTERACTIVE EXPERIENCE</span>
          <span>✦ DIFFUSER READY</span>
        </div>
      </footer>
    </div>
  );
}

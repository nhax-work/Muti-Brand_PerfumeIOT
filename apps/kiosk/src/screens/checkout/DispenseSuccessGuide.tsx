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
      return t('kiosk.waitingForTurn');
    }
    if (phase === 'FORFEITED') {
      return 'LƯỢT XỊT ĐÃ BỊ HỦY DO HẾT THỜI GIAN BẤM NÚT';
    }
    if (phase === 'PROBLEM') {
      return 'LƯỢT XỊT GẶP SỰ CỐ KỸ THUẬT';
    }
    return 'VÒI XỊT SẴN SÀNG TRONG: ĐANG KẾT NỐI';
  }, [phase, view?.slotNumber, slot, secondsLeft, t]);

  const badgeText = useMemo(() => {
    if (phase === 'FORFEITED') return 'HẾT THỜI GIAN';
    if (phase === 'WAITING_TURN') return 'ĐANG CHỜ LƯỢT';
    if (phase === 'DISPENSED') return 'HOÀN TẤT TRẢI NGHIỆM';
    if (phase === 'PROBLEM') return 'CẦN HỖ TRỢ';
    return t('kiosk.paymentSuccessTitle');
  }, [phase, t]);

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
        {/* Checkmark / Status Icon Circle & Heading */}
        <section className={styles.statusHeader}>
          <div className={styles.checkCircle} aria-hidden="true" data-phase={phase}>
            {phase === 'FORFEITED' || phase === 'PROBLEM' ? (
              <svg
                className={styles.checkIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : phase === 'WAITING_TURN' ? (
              <svg
                className={styles.checkIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ) : phase === 'PRESS' ? (
              <svg
                className={styles.checkIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            ) : (
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
            )}
          </div>

          <span className={styles.badgeSuccess}>{badgeText}</span>

          <h1 className={styles.mainTitle}>
            {phase === 'FORFEITED'
              ? t('kiosk.pressTimeoutTitle')
              : phase === 'WAITING_TURN'
                ? 'ĐANG CHỜ LƯỢT PHỤC VỤ'
                : phase === 'PRESS'
                  ? `MỜI BẤM VÀO NÚT SỐ ${view?.slotNumber ?? slot} TRÊN MÁY`
                  : phase === 'DISPENSED'
                    ? t('kiosk.dispensedTitle')
                    : phase === 'PROBLEM'
                      ? t('kiosk.orderProblemTitle')
                      : 'KHOẢNH KHẮC HƯƠNG SẴN SÀNG'}
          </h1>

          <div className={styles.metaSubtitle}>
            {phase === 'PRESS' ? (
              <p
                style={{
                  color: '#d4af37',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  letterSpacing: '0.04em',
                }}
              >
                HỆ THỐNG ĐÃ SÁNG ĐÈN NÚT SỐ {view?.slotNumber ?? slot} — BẤM NÚT ĐỂ BẮT ĐẦU PHUN
                SƯƠNG ({secondsLeft}S)
              </p>
            ) : phase === 'FORFEITED' ? (
              <p>{t('kiosk.pressTimeoutHint')}</p>
            ) : phase === 'WAITING_TURN' ? (
              <p>{t('kiosk.waitingForTurn')}</p>
            ) : phase === 'DISPENSED' ? (
              <p>{t('kiosk.dispensedHint')}</p>
            ) : phase === 'PROBLEM' ? (
              <p>
                {t('kiosk.supportHint', {
                  reference: view?.supportReference ?? order.paymentReference,
                })}
              </p>
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
                ) : phase === 'WAITING_TURN' ? (
                  <span>{t('kiosk.waitingForTurn')}</span>
                ) : (
                  <span>{statusHeadline}</span>
                )}
              </p>
              <p className={styles.statusTextSub}>
                {phase === 'PRESS'
                  ? t('kiosk.pressSlotHint', { slot: view?.slotNumber ?? slot })
                  : phase === 'WAITING_TURN'
                    ? 'Lượt của bạn sẽ tự động kích hoạt ngay sau khi khách trước hoàn tất.'
                    : phase === 'FORFEITED'
                      ? 'Lượt xịt đã bị hủy. Hệ thống sẽ tự động quay lại trang chủ.'
                      : phase === 'DISPENSED'
                        ? 'Cảm ơn bạn đã trải nghiệm nước hoa ScentStation Paris.'
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

        {/* Trường hợp ĐANG CHỜ LƯỢT: Hero Card hàng đợi chuyên biệt */}
        {phase === 'WAITING_TURN' && (
          <div className={styles.phaseHeroCard} data-testid="waiting-turn-hero">
            <div className={styles.phaseHeroIconPulse} aria-hidden="true">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span className={styles.phaseHeroSlotTag}>NGĂN SỐ {view?.slotNumber ?? slot}</span>
            <h2 className={styles.phaseHeroTitle}>MÁY ĐANG PHỤC VỤ KHÁCH TRƯỚC</h2>
            <p className={styles.phaseHeroMessage}>
              Đơn hàng của bạn đã thanh toán thành công và đang được xếp hàng ưu tiên. Vui lòng giữ
              vị trí trước buồng xịt nước hoa.
            </p>
            <div className={styles.phaseHeroHint}>
              ✦ Ngay khi khách trước nhận xịt xong, đèn nút số {view?.slotNumber ?? slot} sẽ phát
              sáng và hệ thống tự động đếm ngược để mời bạn bấm nút.
            </div>
          </div>
        )}

        {/* Trường hợp HẾT THỜI GIAN BẤM NÚT: Hero Card kết thúc lượt */}
        {phase === 'FORFEITED' && (
          <div className={styles.phaseHeroCard} data-testid="forfeited-hero">
            <div className={styles.phaseHeroIconTimeout} aria-hidden="true">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className={styles.phaseHeroSlotTag}>HẾT THỜI GIAN</span>
            <h2 className={styles.phaseHeroTitle}>ĐÃ HẾT THỜI GIAN BẤM NÚT</h2>
            <p className={styles.phaseHeroMessage}>
              Thời gian bấm nút kích hoạt ({pressWindowSec} giây) đã kết thúc. Theo điều khoản đã
              thỏa thuận, lượt xịt này đã bị hủy và không hoàn tiền.
            </p>
            <div className={styles.phaseHeroHint}>
              Cảm ơn bạn đã ghé thăm ScentStation Paris. Hệ thống sẽ tự động quay lại trang chủ sau
              giây lát.
            </div>
          </div>
        )}

        {/* Trường hợp ĐANG CHUẨN BỊ VÒI XỊT / KIỂM TRA: Hero Card kết nối */}
        {(phase === 'PREPARING' || phase === 'CHECKING') && (
          <div className={styles.phaseHeroCard} data-testid="preparing-hero">
            <div className={styles.phaseHeroIconPulse} aria-hidden="true">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span className={styles.phaseHeroSlotTag}>NGĂN SỐ {view?.slotNumber ?? slot}</span>
            <h2 className={styles.phaseHeroTitle}>ĐANG CHUẨN BỊ VÒI XỊT</h2>
            <p className={styles.phaseHeroMessage}>
              Đơn hàng đã thanh toán thành công. Hệ thống đang chuẩn bị buồng phun sương vi hạt cho
              ngăn số {view?.slotNumber ?? slot}.
            </p>
            <div className={styles.phaseHeroHint}>
              ✦ Đèn nút số {view?.slotNumber ?? slot} trên máy sẽ phát sáng ngay sau đây.
            </div>
          </div>
        )}

        {/* Chỉ hiện 2 Cards hướng dẫn nhận xịt khi đèn nút đã sáng (PRESS) hoặc khi đã xịt xong (DISPENSED) */}
        {(phase === 'PRESS' || phase === 'DISPENSED') && (
          <>
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
                    Đứng cách vòi phun khoảng 30 - 40 cm. Giữ tư thế thoải mái để màn sương mịn lan
                    tỏa đều lên cổ tay, cổ hoặc trang phục.
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
                    {t('kiosk.step2Title', { slot: view?.slotNumber ?? slot })}. Giữ yên tư thế để
                    màn sương nước hoa phủ đều trực tiếp lên vùng da mạch đập.
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
          </>
        )}

        {/* Ultrasonic System Notice / Status Notice */}
        <p className={styles.ultrasonicNotice}>
          {phase === 'FORFEITED'
            ? 'ĐÃ QUÁ THỜI GIAN BẤM NÚT KÍCH HOẠT. ĐƠN ĐÃ KẾT THÚC VÀ TỰ ĐỘNG QUAY LẠI TRANG CHỦ.'
            : phase === 'WAITING_TURN'
              ? 'MÁY ĐANG PHỤC VỤ KHÁCH TRƯỚC. VUI LÒNG ĐỢI TRONG GIÂY LÁT ĐỂ ĐẾN LƯỢT BẠN.'
              : phase === 'DISPENSED'
                ? 'HỆ THỐNG VÒI PHUN ĐÃ HOÀN TẤT CHU KỲ PHUN SƯƠNG NƯỚC HOA.'
                : 'HỆ THỐNG VÒI PHUN SIÊU ÂM ĐANG TỰ ĐỘNG ĐẾM NGƯỢC. CHU KỲ PHUN HOÀN TOÀN TỰ ĐỘNG SAU KHI SẴN SÀNG.'}
        </p>

        {/* 3. Action Buttons */}
        <div className={styles.actionButtonsRow}>
          {phase === 'DISPENSED' && (
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
          )}

          <button
            type="button"
            className={phase !== 'DISPENSED' ? styles.primaryActionBtn : styles.secondaryActionBtn}
            onClick={goHome}
            aria-label="Trang chủ"
          >
            <span>
              {phase === 'DISPENSED'
                ? 'Trang chủ'
                : phase === 'FORFEITED' || phase === 'PROBLEM'
                  ? 'QUAY VỀ TRANG CHỦ'
                  : phase === 'WAITING_TURN'
                    ? 'RỜI HÀNG ĐỢI & VỀ TRANG CHỦ'
                    : 'QUAY LẠI TRANG CHỦ'}
            </span>
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

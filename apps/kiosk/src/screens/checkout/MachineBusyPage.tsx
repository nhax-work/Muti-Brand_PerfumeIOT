import { useI18n } from '@/shared/i18n';
import type { KioskOrderFlow } from './useKioskOrderFlow';
import styles from './MachineBusyPage.module.css';

/**
 * Chưa tạo được đơn vì máy đang phục vụ khách khác — máy chủ trả 409 MACHINE_BUSY khi máy còn đơn chờ
 * thanh toán (FR-ORD-35) hoặc đang chờ khách trước bấm nút (FR-ORD-24). Khách CHƯA trả tiền. Kiosk tự
 * thử lại theo chu kỳ (useKioskOrderFlow) và tự sang mã QR khi được; khách cũng có thể thử ngay hoặc
 * quay lại chọn mùi khác.
 */
export function MachineBusyPage({ flow }: { flow: KioskOrderFlow }) {
  const { t } = useI18n();
  return (
    <section className={styles.page} aria-labelledby="busy-title">
      <h1 id="busy-title" className={styles.title}>
        {t('kiosk.machineBusyTitle')}
      </h1>
      <p className={styles.hint} role="status">
        <span className={styles.pulse} aria-hidden="true" />
        {t('kiosk.machineBusyHint')}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => flow.exit('catalog')}>
          {t('kiosk.chooseAnother')}
        </button>
        <button type="button" className={styles.primary} onClick={flow.retryCreate}>
          {t('kiosk.retryCreateOrder')}
        </button>
      </div>
    </section>
  );
}

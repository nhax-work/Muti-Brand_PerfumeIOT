import type { MessageKey } from '@scentstation/i18n';
import { Button, Checkbox, Modal, Spin, Typography, message } from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useAcceptAgreement, useCurrentAgreement } from './api';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Chạy sau khi đồng ý thành công và hộp thoại đã đóng (ví dụ: tạo tiếp phiên thanh toán). */
  onAccepted?: () => void | Promise<void>;
  /** Nhãn nút đóng; mặc định "Hủy". Cuối màn hướng dẫn dùng "Để sau". */
  cancelLabel?: MessageKey;
  /** Việc chạy tiếp sau khi đồng ý còn đang chạy thì nút đồng ý vẫn quay. */
  busy?: boolean;
}

/**
 * Hộp thoại đọc và đồng ý hợp đồng khung hiện hành (FR-SLT-49, ADR-0013): tick xác nhận rồi mới
 * bấm được Đồng ý. Phụ lục của từng phiên thanh toán không nằm ở đây — nó sinh ra từ phiên đó.
 */
export function FrameworkAgreementModal({
  open,
  onClose,
  onAccepted,
  cancelLabel = 'ui.cancel',
  busy = false,
}: Props) {
  const { t } = useI18n();
  const { data } = useCurrentAgreement({ enabled: open });
  const agreement = data?.agreement;
  const accept = useAcceptAgreement();
  const [checked, setChecked] = useState(false);

  const close = () => {
    setChecked(false);
    onClose();
  };

  const handleAccept = async () => {
    if (!agreement) return;
    try {
      await accept.mutateAsync({ version: agreement.version, contentHash: agreement.contentHash });
      message.success(t('ui.agreementAcceptedSuccess'));
      close();
      await onAccepted?.();
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  return (
    <Modal
      title={
        agreement
          ? `${agreement.title} (${t('ui.agreementVersion', { version: agreement.version })})`
          : t('ui.frameworkAgreementTitle')
      }
      open={open}
      onCancel={close}
      footer={[
        <Button key="cancel" onClick={close}>
          {t(cancelLabel)}
        </Button>,
        <Button
          key="accept"
          type="primary"
          disabled={!checked || !agreement}
          loading={accept.isPending || busy}
          onClick={() => void handleAccept()}
        >
          {t('ui.agreementAcceptBtn')}
        </Button>,
      ]}
      width={700}
    >
      <Typography.Paragraph type="secondary">{t('ui.frameworkAgreementDesc')}</Typography.Paragraph>
      <div className="framework-agreement-content">
        {agreement ? (
          agreement.content
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Spin tip={t('ui.loadingFrameworkAgreement')} />
          </div>
        )}
      </div>
      <Checkbox
        checked={checked}
        disabled={!agreement}
        onChange={(e) => setChecked(e.target.checked)}
      >
        {t('ui.agreementCheckbox')}
      </Checkbox>
    </Modal>
  );
}

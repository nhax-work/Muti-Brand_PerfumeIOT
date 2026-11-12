import { FileProtectOutlined } from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import { Alert, Button, Checkbox, Modal, Skeleton, Typography, message } from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { AgreementDocument } from './AgreementDocument';
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
  const { data, error } = useCurrentAgreement({ enabled: open });
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

  const title = (
    <div className="agreement-modal-header">
      <span className="agreement-modal-icon" aria-hidden>
        <FileProtectOutlined />
      </span>
      <div className="agreement-modal-heading">
        <Typography.Title level={5} style={{ margin: 0 }}>
          {agreement?.title ?? t('ui.frameworkAgreementTitle')}
        </Typography.Title>
        {agreement?.publishedAt && (
          <div className="agreement-modal-meta">
            <Typography.Text type="secondary">
              {t('ui.agreementPublishedOn', { time: formatDateTime(agreement.publishedAt) })}
            </Typography.Text>
          </div>
        )}
      </div>
    </div>
  );

  // Còn bản đã tải thì vẫn cho đọc dù lần tải lại lỗi; chỉ báo lỗi khi chưa có gì để hiện.
  const body = agreement ? (
    <AgreementDocument content={agreement.content} />
  ) : error ? (
    <Alert type="error" showIcon message={errorMessage(error, t)} />
  ) : (
    <div
      className="agreement-paper agreement-paper--loading"
      aria-label={t('ui.loadingFrameworkAgreement')}
    >
      <Skeleton active title paragraph={{ rows: 8 }} />
    </div>
  );

  return (
    <Modal
      title={title}
      open={open}
      onCancel={close}
      centered
      width={780}
      className="agreement-modal"
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
    >
      <Typography.Paragraph type="secondary" className="agreement-modal-desc">
        {t('ui.frameworkAgreementDesc')}
      </Typography.Paragraph>
      {body}
      <div className={`agreement-consent${checked ? ' is-checked' : ''}`}>
        <Checkbox
          checked={checked}
          disabled={!agreement}
          onChange={(e) => setChecked(e.target.checked)}
        >
          {t('ui.agreementCheckbox')}
        </Checkbox>
      </div>
    </Modal>
  );
}

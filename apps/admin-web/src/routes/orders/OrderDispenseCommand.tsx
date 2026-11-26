import { Descriptions, Typography } from 'antd';
import { codeLabel } from '@/shared/codes';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { useOrderDispenseCommand } from './api';

/**
 * Lệnh xịt của một đơn kèm kết quả thiết bị báo về (FR-DSP-16, FR-DSP-20). Dùng ở chi tiết đơn và chi
 * tiết phiếu khiếu nại, để người xử lý đối chiếu máy có thật sự xịt hay không.
 */
export function OrderDispenseCommand({ orderId }: { orderId: string | undefined }) {
  const { t } = useI18n();
  const command = useOrderDispenseCommand(orderId);

  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        {t('ui.orderDispenseCommand')}{' '}
        <Typography.Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>
          {t('ui.orderDispenseCommandSource')}
        </Typography.Text>
      </Typography.Title>
      {command.data ? (
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('ui.pricingStatus')}>
            {codeLabel(t, 'commandStatus', command.data.status)}
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.commandToken')}>
            <Typography.Text copyable style={{ fontSize: 12 }}>
              {command.data.commandToken}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.commandSentAt')}>
            {formatDateTime(command.data.sentAt)}
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.commandAcknowledgedAt')}>
            {formatDateTime(command.data.acknowledgedAt)}
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.commandResult')}>
            {!command.data.result
              ? '—'
              : command.data.result.success
                ? t('ui.commandSucceeded')
                : t('ui.commandFailedWith', {
                    code: codeLabel(t, 'orderCode', command.data.result.failureCode ?? null),
                  })}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">
          {command.isLoading ? '…' : t('ui.orderNoDispenseCommand')}
        </Typography.Text>
      )}
    </>
  );
}

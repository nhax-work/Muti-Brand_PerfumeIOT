import { Alert, Descriptions, Drawer, Empty, Space, Table, Tag, Timeline, Typography } from 'antd';
import { errorMessage } from '@/shared/api';
import { codeLabel } from '@/shared/codes';
import { formatDateTime, formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { type OrderTrace, useOrderTrace } from './api';

type Payment = OrderTrace['payments'][number];
type Adjustment = NonNullable<OrderTrace['inventoryAdjustments']>[number];

/**
 * Truy vết đầu-cuối một đơn (FR-AUD-11): thanh toán, lệnh xịt kèm kết quả thiết bị, thay đổi tồn kho
 * trên slot, hóa đơn thuê và nhật ký. Chỉ người có `audit.read` mở được — máy chủ vẫn kiểm (FE5).
 */
export function OrderTraceDrawer({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const trace = useOrderTrace(orderId ?? undefined);
  if (!orderId) return null;
  const data = trace.data;

  return (
    <Drawer open width={720} title={t('ui.orderTrace')} onClose={onClose} destroyOnHidden>
      {trace.error && <Alert type="error" showIcon message={errorMessage(trace.error, t)} />}
      {trace.isLoading && <Typography.Text type="secondary">…</Typography.Text>}
      {data && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered title={t('ui.orderTraceRental')}>
            <Descriptions.Item label={t('ui.compensationInvoice')}>
              {data.slotRental?.invoiceNumber ?? data.order.slotRentalId}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.revenueOwnerLabel')}>
              {codeLabel(t, 'revenueOwner', data.order.revenueOwner)}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Title level={5}>{t('ui.orderTracePayments')}</Typography.Title>
            <Table<Payment>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={data.payments}
              locale={{ emptyText: <Empty description={t('ui.orderTraceNone')} /> }}
              columns={[
                { title: t('ui.orderTraceProvider'), dataIndex: 'provider', key: 'provider' },
                {
                  title: t('ui.orderAmount'),
                  key: 'amount',
                  render: (_, p) => formatVnd(p.amount),
                },
                {
                  title: t('ui.pricingStatus'),
                  key: 'status',
                  render: (_, p) => <Tag>{p.status}</Tag>,
                },
                {
                  title: t('ui.orderPaidAt'),
                  key: 'paidAt',
                  render: (_, p) => formatDateTime(p.paidAt),
                },
              ]}
            />
          </div>

          <div>
            <Typography.Title level={5}>{t('ui.orderDispenseCommand')}</Typography.Title>
            {data.dispenseCommands.length === 0 ? (
              <Typography.Text type="secondary">{t('ui.orderNoDispenseCommand')}</Typography.Text>
            ) : (
              data.dispenseCommands.map((c) => (
                <Descriptions
                  key={c.id}
                  column={1}
                  size="small"
                  bordered
                  style={{ marginBottom: 8 }}
                >
                  <Descriptions.Item label={t('ui.commandToken')}>
                    <Typography.Text copyable style={{ fontSize: 12 }}>
                      {c.commandToken}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('ui.pricingStatus')}>
                    {codeLabel(t, 'commandStatus', c.status)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('ui.commandSentAt')}>
                    {formatDateTime(c.sentAt)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('ui.commandAcknowledgedAt')}>
                    {formatDateTime(c.acknowledgedAt)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('ui.commandResult')}>
                    {!c.result
                      ? '—'
                      : c.result.success
                        ? t('ui.commandSucceeded')
                        : t('ui.commandFailedWith', {
                            code: codeLabel(t, 'orderCode', c.result.failureCode ?? null),
                          })}
                  </Descriptions.Item>
                </Descriptions>
              ))
            )}
          </div>

          <div>
            <Typography.Title level={5}>{t('ui.orderTraceInventory')}</Typography.Title>
            <Table<Adjustment>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={data.inventoryAdjustments ?? []}
              locale={{ emptyText: <Empty description={t('ui.orderTraceNone')} /> }}
              columns={[
                {
                  title: t('ui.createdAt'),
                  key: 'createdAt',
                  render: (_, a) => formatDateTime(a.createdAt),
                },
                {
                  title: t('ui.orderTraceDifference'),
                  key: 'difference',
                  render: (_, a) => `${a.differenceMl} ml`,
                },
                { title: t('ui.refillRequestReason'), dataIndex: 'reason', key: 'reason' },
              ]}
            />
          </div>

          <div>
            <Typography.Title level={5}>{t('ui.orderTraceAudit')}</Typography.Title>
            {(data.auditLogs ?? []).length === 0 ? (
              <Typography.Text type="secondary">{t('ui.orderTraceNone')}</Typography.Text>
            ) : (
              <Timeline
                items={(data.auditLogs ?? []).map((log) => ({
                  color: log.severity === 'HIGH' || log.severity === 'CRITICAL' ? 'red' : 'blue',
                  children: (
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>{log.action}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDateTime(log.occurredAt)} ·{' '}
                        {codeLabel(t, 'actorType', log.actorType)}
                      </Typography.Text>
                    </Space>
                  ),
                }))}
              />
            )}
          </div>
        </Space>
      )}
    </Drawer>
  );
}

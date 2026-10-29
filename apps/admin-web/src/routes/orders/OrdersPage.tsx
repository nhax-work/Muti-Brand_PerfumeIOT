import { ApartmentOutlined, WarningOutlined } from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Alert,
  Badge,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { RequireRole } from '@/app/guards/RequireRole';
import { useAuth } from '@/shared/auth';
import { codeLabel } from '@/shared/codes';
import { formatDateTime, formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type Order,
  type OrderStatus,
  useManualReviewOrders,
  useOrderDispenseCommand,
  useOrderHistory,
  useOrders,
} from './api';
import { OrderTraceDrawer } from './OrderTraceDrawer';

const STATUS_TAGS: Record<OrderStatus, { color: string; label: MessageKey }> = {
  CREATED: { color: 'default', label: 'ui.orderCreated' },
  PENDING_PAYMENT: { color: 'gold', label: 'ui.orderPendingPayment' },
  PAID: { color: 'blue', label: 'ui.orderPaid' },
  DISPENSE_REQUESTED: { color: 'geekblue', label: 'ui.orderDispenseRequested' },
  DISPENSED: { color: 'green', label: 'ui.orderDispensed' },
  FAILED: { color: 'red', label: 'ui.orderFailed' },
  EXPIRED: { color: 'default', label: 'ui.orderExpired' },
  REFUND_PENDING: { color: 'orange', label: 'ui.orderRefundPending' },
  REFUNDED: { color: 'purple', label: 'ui.orderRefunded' },
  FORFEITED: { color: 'magenta', label: 'ui.orderForfeited' },
};

/**
 * Đơn hàng (FR-ORD-18, 19, 22). Mọi vai trò có `order.view` tra cứu được — Brand Admin chỉ thấy đơn
 * của slot mình (máy chủ lọc). Tab "Cần kiểm tra thủ công" dành cho Operations Staff và Super Admin:
 * đơn đã trả tiền mà không nhận lượt xịt, gồm cả đơn do dừng bán an toàn sinh ra (QUEUE_TIMEOUT, từ
 * chối trước khi đèn sáng — ADR-0015). Hoàn tiền đi qua phiếu khiếu nại (ADR-0012).
 */
export default function OrdersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPlatform = !user?.brandId;
  const canReview =
    user?.roles.some((r) => r === 'PLATFORM_SUPER_ADMIN' || r === 'OPERATIONS_STAFF') ?? false;
  // FR-AUD-11: truy vết đọc nhật ký kiểm toán — chỉ hiện khi có `audit.read`, máy chủ vẫn kiểm.
  const canTrace = user?.permissions.includes('audit.read') ?? false;
  const [tracing, setTracing] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [reference, setReference] = useState<string | undefined>();
  const [range, setRange] = useState<[string, string] | undefined>();
  const [reviewPage, setReviewPage] = useState(1);
  const [selected, setSelected] = useState<Order | null>(null);

  const orders = useOrders({
    page,
    pageSize: 20,
    status,
    paymentReference: reference,
    from: range?.[0],
    to: range?.[1],
  });
  const review = useManualReviewOrders(reviewPage, canReview);

  const columns: ColumnsType<Order> = [
    {
      title: t('ui.orderReference'),
      key: 'ref',
      render: (_, o) => (
        <Space>
          <Typography.Text strong copyable>
            {o.paymentReference}
          </Typography.Text>
          {o.needsManualReview && <WarningOutlined style={{ color: '#fa541c' }} />}
        </Space>
      ),
    },
    { title: t('ui.createdAt'), key: 'createdAt', render: (_, o) => formatDateTime(o.createdAt) },
    { title: t('ui.mySlotsProduct'), dataIndex: 'productNameSnapshot', key: 'product' },
    { title: t('ui.orderAmount'), key: 'amount', render: (_, o) => formatVnd(o.amount) },
    {
      title: t('ui.pricingStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: OrderStatus) => <Tag color={STATUS_TAGS[s].color}>{t(STATUS_TAGS[s].label)}</Tag>,
    },
    {
      title: t('ui.orderFailureCode'),
      dataIndex: 'failureCode',
      key: 'failureCode',
      render: (c: string | null) => (c ? <Tag>{codeLabel(t, 'orderCode', c)}</Tag> : '—'),
    },
    ...(isPlatform
      ? [
          {
            title: t('ui.orderRevenueOwner'),
            dataIndex: 'revenueOwner',
            key: 'revenueOwner',
            render: (r: string) => <Tag>{codeLabel(t, 'revenueOwner', r)}</Tag>,
          },
        ]
      : []),
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, o) => (
        <Button type="link" size="small" onClick={() => setSelected(o)}>
          {t('ui.orderDetail')}
        </Button>
      ),
    },
  ];

  const searchTab = (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          allowClear
          style={{ width: 260 }}
          placeholder={t('ui.orderReference')}
          onSearch={(v) => {
            setReference(v.trim() || undefined);
            setPage(1);
          }}
        />
        <Select<OrderStatus | 'ALL'>
          style={{ width: 220 }}
          value={status ?? 'ALL'}
          onChange={(v) => {
            setStatus(v === 'ALL' ? undefined : v);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: t('ui.allStatuses') },
            ...(Object.keys(STATUS_TAGS) as OrderStatus[]).map((s) => ({
              value: s,
              label: t(STATUS_TAGS[s].label),
            })),
          ]}
        />
        <DatePicker.RangePicker
          onChange={(dates) => {
            setRange(
              dates?.[0] && dates[1]
                ? [
                    dates[0].startOf('day').toISOString(),
                    dates[1].add(1, 'day').startOf('day').toISOString(),
                  ]
                : undefined,
            );
            setPage(1);
          }}
        />
      </Space>
      <Table
        rowKey="id"
        loading={orders.isLoading}
        columns={columns}
        dataSource={orders.data?.items ?? []}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: orders.data?.meta.total ?? 0,
          onChange: setPage,
        }}
      />
    </>
  );

  const reviewTab = (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('ui.orderReviewHint')} />
      <Table
        rowKey="id"
        loading={review.isLoading}
        columns={columns}
        dataSource={review.data?.items ?? []}
        scroll={{ x: 1000 }}
        pagination={{
          current: reviewPage,
          pageSize: 20,
          total: review.data?.meta.total ?? 0,
          onChange: setReviewPage,
        }}
      />
    </>
  );

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.orders')}</Typography.Title>
        {canReview ? (
          <Tabs
            items={[
              { key: 'search', label: t('ui.orderSearchTab'), children: searchTab },
              {
                key: 'review',
                label: (
                  <Badge count={review.data?.meta.total ?? 0} size="small" offset={[10, 0]}>
                    {t('ui.orderReviewTab')}
                  </Badge>
                ),
                children: reviewTab,
              },
            ]}
          />
        ) : (
          searchTab
        )}
        <OrderDrawer
          order={selected}
          onClose={() => setSelected(null)}
          onOpenClaims={canReview ? () => void navigate('/refund-claims') : undefined}
          onTrace={canTrace ? setTracing : undefined}
        />
        <OrderTraceDrawer orderId={tracing} onClose={() => setTracing(null)} />
      </div>
    </RequireRole>
  );
}

function OrderDrawer({
  order,
  onClose,
  onOpenClaims,
  onTrace,
}: {
  order: Order | null;
  onClose: () => void;
  onOpenClaims?: (() => void) | undefined;
  onTrace?: ((orderId: string) => void) | undefined;
}) {
  const { t } = useI18n();
  const history = useOrderHistory(order?.id);
  const command = useOrderDispenseCommand(order?.id);
  if (!order) return null;
  return (
    <Drawer
      open
      width={520}
      title={order.paymentReference}
      onClose={onClose}
      destroyOnHidden
      extra={
        onTrace && (
          <Button icon={<ApartmentOutlined />} onClick={() => onTrace(order.id)}>
            {t('ui.orderTrace')}
          </Button>
        )
      }
    >
      {order.needsManualReview && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('ui.orderNeedsReview')}
          action={
            onOpenClaims && (
              <Button size="small" onClick={onOpenClaims}>
                {t('ui.refundClaims')}
              </Button>
            )
          }
        />
      )}
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('ui.pricingStatus')}>
          <Tag color={STATUS_TAGS[order.status].color}>{t(STATUS_TAGS[order.status].label)}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.mySlotsProduct')}>
          {order.productNameSnapshot}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.orderAmount')}>{formatVnd(order.amount)}</Descriptions.Item>
        <Descriptions.Item label={t('ui.createdAt')}>
          {formatDateTime(order.createdAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.orderPaidAt')}>
          {formatDateTime(order.paidAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.orderDispensedAt')}>
          {formatDateTime(order.dispensedAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.orderFailureCode')}>
          {codeLabel(t, 'orderCode', order.failureCode)}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        {t('ui.orderDispenseCommand')}
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
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        {t('ui.orderHistory')}
      </Typography.Title>
      <Timeline
        items={(history.data ?? []).map((h) => ({
          color: h.toStatus === 'FAILED' ? 'red' : h.toStatus === 'DISPENSED' ? 'green' : 'blue',
          children: (
            <Space direction="vertical" size={0}>
              <Typography.Text strong>{t(STATUS_TAGS[h.toStatus].label)}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatDateTime(h.occurredAt)} · {codeLabel(t, 'actorType', h.actorType)}
                {h.reason ? ` · ${codeLabel(t, 'orderCode', h.reason)}` : ''}
              </Typography.Text>
            </Space>
          ),
        }))}
      />
    </Drawer>
  );
}

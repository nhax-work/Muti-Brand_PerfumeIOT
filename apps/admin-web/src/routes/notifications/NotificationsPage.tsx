import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  MailOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type Notification,
  type NotificationChannel,
  type NotificationStatus,
  useNotification,
  useNotifications,
  useRetryNotification,
} from './api';

const STATUS_TAGS: Record<NotificationStatus, { color: string; icon: React.ReactNode }> = {
  PENDING: { color: 'gold', icon: <ClockCircleOutlined /> },
  SENT: { color: 'green', icon: <CheckCircleOutlined /> },
  FAILED: { color: 'red', icon: <CloseCircleOutlined /> },
  READ: { color: 'blue', icon: <CheckCircleOutlined /> },
};

function ChannelTag({ channel }: { readonly channel: NotificationChannel }) {
  const { t } = useI18n();
  return (
    <Tag
      color={channel === 'EMAIL' ? 'purple' : 'cyan'}
      icon={channel === 'EMAIL' ? <MailOutlined /> : <BellOutlined />}
    >
      {t(`notificationChannel.${channel}`)}
    </Tag>
  );
}

function StatusTag({ status }: { readonly status: NotificationStatus }) {
  const { t } = useI18n();
  return (
    <Tag color={STATUS_TAGS[status].color} icon={STATUS_TAGS[status].icon}>
      {t(`notificationStatus.${status}` as MessageKey)}
    </Tag>
  );
}

/**
 * Thông báo của người dùng (FR-EXP-01, FR-INV-28…) và, với `notification.manage`, bằng chứng gửi email
 * của mọi thương hiệu (FR-ALR-16, ADR-0017 mục 5). Phạm vi do máy chủ quyết định.
 */
export default function NotificationsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAuditor = user?.permissions.includes('notification.manage') ?? false;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [channel, setChannel] = useState<NotificationChannel | undefined>();
  const [status, setStatus] = useState<NotificationStatus | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useNotifications({
    page,
    pageSize,
    status,
    channel: isAuditor ? channel : undefined,
  });
  const detail = useNotification(selectedId);
  const retry = useRetryNotification();

  const canRetry = (n: Notification) => isAuditor && n.channel === 'EMAIL' && n.status === 'FAILED';

  const handleRetry = async (id: string) => {
    try {
      await retry.mutateAsync(id);
      void message.success(t('ui.retryNotificationSuccess'));
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<Notification> = [
    {
      title: t('ui.notificationCreatedAtLabel'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: t('ui.notificationChannelLabel'),
      dataIndex: 'channel',
      key: 'channel',
      width: 140,
      render: (value: NotificationChannel) => <ChannelTag channel={value} />,
    },
    ...(isAuditor
      ? [
          {
            title: t('ui.notificationAddressLabel'),
            dataIndex: 'recipientAddress',
            key: 'recipientAddress',
            render: (value: string | null) => value ?? '—',
          },
        ]
      : []),
    {
      title: t('ui.notificationSubjectLabel'),
      key: 'subject',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {record.subject || t('ui.notificationNoSubject')}
          </Typography.Text>
          <Typography.Text type="secondary">{record.type}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.claimStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (value: NotificationStatus) => <StatusTag status={value} />,
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelectedId(record.id)}
          >
            {t('ui.viewNotificationEvidence')}
          </Button>
          {canRetry(record) && (
            <Popconfirm
              title={t('ui.retryNotificationConfirm')}
              onConfirm={() => handleRetry(record.id)}
              okText={t('ui.confirm')}
              cancelText={t('ui.cancel')}
            >
              <Button type="link" danger size="small" icon={<RedoOutlined />}>
                {t('ui.retryNotificationSend')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const item = detail.data;

  return (
    <RequireRole
      allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'INVENTORY_STAFF', 'BRAND_ADMIN']}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            {t('ui.notificationListTitle')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('ui.notificationListSubtitle')}
          </Typography.Paragraph>
        </div>

        <Space wrap>
          {isAuditor && (
            <Select<NotificationChannel>
              allowClear
              value={channel}
              onChange={(value) => {
                setChannel(value);
                setPage(1);
              }}
              style={{ width: 180 }}
              placeholder={t('ui.filterAllChannels')}
              options={(['EMAIL', 'IN_APP'] as const).map((c) => ({
                value: c,
                label: t(`notificationChannel.${c}`),
              }))}
            />
          )}
          <Select<NotificationStatus>
            allowClear
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            style={{ width: 200 }}
            placeholder={t('ui.filterAllStatuses')}
            options={(Object.keys(STATUS_TAGS) as NotificationStatus[]).map((s) => ({
              value: s,
              label: t(`notificationStatus.${s}` as MessageKey),
            }))}
          />
        </Space>

        <Table<Notification>
          rowKey="id"
          columns={columns}
          dataSource={list.data ? [...list.data.items] : []}
          loading={list.isLoading}
          pagination={{
            current: page,
            pageSize,
            total: list.data?.meta.total ?? 0,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          locale={{ emptyText: <Empty description={t('ui.noNotificationsFound')} /> }}
        />

        <Drawer
          title={t('ui.notificationEvidenceModalTitle')}
          size="large"
          open={selectedId !== null}
          onClose={() => setSelectedId(null)}
          loading={detail.isLoading}
          extra={
            item && canRetry(item) ? (
              <Button
                type="primary"
                danger
                icon={<RedoOutlined />}
                loading={retry.isPending}
                onClick={() => void handleRetry(item.id)}
              >
                {t('ui.retryNotificationSend')}
              </Button>
            ) : null
          }
        >
          {item && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label={t('ui.notificationIdLabel')}>
                  <Typography.Text copyable code>
                    {item.id}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationChannelLabel')}>
                  <ChannelTag channel={item.channel} />
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationTypeLabel')}>
                  {item.type}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.claimStatus')}>
                  <StatusTag status={item.status} />
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationCreatedAtLabel')}>
                  {formatDateTime(item.createdAt)}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationSentAtLabel')}>
                  {item.sentAt ? formatDateTime(item.sentAt) : t('ui.notificationNotSentYet')}
                </Descriptions.Item>
                {item.channel === 'EMAIL' && (
                  <>
                    <Descriptions.Item label={t('ui.notificationAddressLabel')}>
                      {item.recipientAddress ?? '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('ui.notificationProviderIdLabel')}>
                      {item.providerMessageId ?? '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('ui.notificationAttemptsLabel')}>
                      {item.deliveryAttempts ?? 0}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('ui.notificationLastAttemptLabel')}>
                      {item.lastAttemptAt ? formatDateTime(item.lastAttemptAt) : '—'}
                    </Descriptions.Item>
                    {item.lastError && (
                      <Descriptions.Item label={t('ui.notificationLastErrorLabel')}>
                        <Typography.Text type="danger">{item.lastError}</Typography.Text>
                      </Descriptions.Item>
                    )}
                  </>
                )}
                <Descriptions.Item label={t('ui.notificationReferenceLabel')}>
                  {item.referenceId ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationSubjectLabel')}>
                  {item.subject || t('ui.notificationNoSubject')}
                </Descriptions.Item>
              </Descriptions>
              <div>
                <Typography.Text strong>{t('ui.notificationContentLabel')}</Typography.Text>
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                  {item.content}
                </Typography.Paragraph>
              </div>
            </Space>
          )}
        </Drawer>
      </Space>
    </RequireRole>
  );
}

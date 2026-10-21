import {
  BellOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  MailOutlined,
  RedoOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
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
import { useI18n } from '@/shared/i18n';
import {
  type NotificationChannel,
  type NotificationItem,
  type NotificationStatus,
  useNotification,
  useNotifications,
  useRetryNotification,
} from './api';

const STATUS_TAGS: Record<NotificationStatus, { color: string; label: MessageKey; icon: React.ReactNode }> = {
  SENT: { color: 'green', label: 'notificationStatus.SENT', icon: <CheckCircleOutlined /> },
  FAILED: { color: 'red', label: 'notificationStatus.FAILED', icon: <CloseCircleOutlined /> },
  PENDING: { color: 'gold', label: 'notificationStatus.PENDING', icon: <ClockCircleOutlined /> },
  READ: { color: 'blue', label: 'notificationStatus.READ', icon: <CheckCircleOutlined /> },
};

export default function NotificationsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isBrand = user?.roles.includes('BRAND_ADMIN') ?? false;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [channel, setChannel] = useState<NotificationChannel | undefined>();
  const [status, setStatus] = useState<NotificationStatus | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useNotifications({
    page,
    pageSize,
    channel,
    status,
  });

  const { data: detailData, isLoading: isDetailLoading } = useNotification(selectedId);
  const retryMutation = useRetryNotification();

  const handleRetry = async (item: NotificationItem) => {
    try {
      await retryMutation.mutateAsync(item.id);
      message.success(t('ui.retryNotificationSuccess'));
      void refetch();
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  const columns: ColumnsType<NotificationItem> = [
    {
      title: t('ui.notificationCreatedAtLabel'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (val: string, record) => (
        <div>
          <div>{new Date(val).toLocaleString('vi-VN')}</div>
          {record.sentAt && record.status === 'SENT' && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('ui.notificationSentAtLabel')}: {new Date(record.sentAt).toLocaleTimeString('vi-VN')}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: t('ui.notificationChannelLabel'),
      dataIndex: 'channel',
      key: 'channel',
      width: 130,
      render: (val: NotificationChannel) => {
        const isEmail = val === 'EMAIL';
        return (
          <Tag
            color={isEmail ? 'purple' : 'cyan'}
            icon={isEmail ? <MailOutlined /> : <BellOutlined />}
            style={{ fontWeight: 500 }}
          >
            {isEmail ? t('notificationChannel.EMAIL') : t('notificationChannel.IN_APP')}
          </Tag>
        );
      },
    },
    ...(!isBrand
      ? [
          {
            title: t('ui.userBrand'),
            dataIndex: 'brandName',
            key: 'brandName',
            width: 160,
            render: (val: string | null, record: NotificationItem) =>
              val ?? <Typography.Text type="secondary">{record.brandId.slice(0, 8)}...</Typography.Text>,
          },
        ]
      : []),
    {
      title: t('ui.notificationRecipientLabel'),
      key: 'recipient',
      width: 220,
      render: (_: unknown, record: NotificationItem) => (
        <div>
          <Typography.Text strong>{record.recipientName ?? record.recipientUserId.slice(0, 8)}</Typography.Text>
          {record.recipientEmail && (
            <div style={{ fontSize: 12, color: '#64748b' }}>{record.recipientEmail}</div>
          )}
        </div>
      ),
    },
    {
      title: t('ui.notificationSubjectLabel'),
      key: 'subject',
      render: (_: unknown, record: NotificationItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.subject || '(Không có tiêu đề)'}</div>
          <Tag color="default" style={{ fontSize: 11, marginTop: 4 }}>
            {record.type}
          </Tag>
        </div>
      ),
    },
    {
      title: t('ui.claimStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st: NotificationStatus) => {
        const conf = STATUS_TAGS[st];
        return (
          <Tag color={conf.color} icon={conf.icon}>
            {t(conf.label)}
          </Tag>
        );
      },
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: NotificationItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelectedId(record.id)}
          >
            {t('ui.viewNotificationEvidence')}
          </Button>

          {record.status === 'FAILED' && record.channel === 'EMAIL' && (
            <Popconfirm
              title={t('ui.retryNotificationSend')}
              description="Thử gửi lại email thông báo này tới người nhận?"
              onConfirm={() => handleRetry(record)}
              okText={t('ui.confirm')}
              cancelText={t('ui.cancel')}
            >
              <Button
                type="link"
                danger
                size="small"
                icon={<RedoOutlined />}
                loading={retryMutation.isPending && retryMutation.variables === record.id}
              >
                {t('ui.retryNotificationSend')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const total = data?.meta.total ?? 0;
  const sentCount = data?.items.filter((i) => i.status === 'SENT').length ?? 0;
  const failedCount = data?.items.filter((i) => i.status === 'FAILED').length ?? 0;

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN']}>
      <Space vertical size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            {t('ui.notificationListTitle')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('ui.notificationListSubtitle')}
          </Typography.Paragraph>
        </div>

        {/* Thẻ thống kê */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card variant="borderless" style={{ background: '#f8fafc' }}>
              <Statistic title="Tổng số thông báo" value={total} prefix={<BellOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card variant="borderless" style={{ background: '#f0fdf4' }}>
              <Statistic
                title="Đã gửi thành công"
                value={sentCount}
                styles={{ content: { color: '#16a34a' } }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card variant="borderless" style={{ background: failedCount > 0 ? '#fef2f2' : '#f8fafc' }}>
              <Statistic
                title="Gửi thất bại cần xử lý"
                value={failedCount}
                styles={{ content: { color: failedCount > 0 ? '#dc2626' : '#64748b' } }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* Thanh công cụ lọc */}
        <Card variant="borderless">
          <Row justify="space-between" align="middle" gutter={[16, 16]}>
            <Col>
              <Space wrap>
                <Select<NotificationChannel | undefined>
                  value={channel}
                  onChange={(val) => {
                    setChannel(val);
                    setPage(1);
                  }}
                  style={{ width: 160 }}
                  placeholder={t('ui.filterAllChannels')}
                  allowClear
                  options={[
                    { value: undefined, label: t('ui.filterAllChannels') },
                    { value: 'EMAIL', label: t('notificationChannel.EMAIL') },
                    { value: 'IN_APP', label: t('notificationChannel.IN_APP') },
                  ]}
                />

                <Select<NotificationStatus | undefined>
                  value={status}
                  onChange={(val) => {
                    setStatus(val);
                    setPage(1);
                  }}
                  style={{ width: 180 }}
                  placeholder={t('ui.filterAllStatuses')}
                  allowClear
                  options={[
                    { value: undefined, label: t('ui.filterAllStatuses') },
                    { value: 'SENT', label: t('notificationStatus.SENT') },
                    { value: 'FAILED', label: t('notificationStatus.FAILED') },
                    { value: 'PENDING', label: t('notificationStatus.PENDING') },
                    { value: 'READ', label: t('notificationStatus.READ') },
                  ]}
                />
              </Space>
            </Col>

            <Col>
              <Button
                icon={<ReloadOutlined spin={isFetching} />}
                onClick={() => void refetch()}
              >
                {t('ui.reset')}
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Bảng dữ liệu */}
        <Table<NotificationItem>
          rowKey="id"
          columns={columns}
          dataSource={data?.items as NotificationItem[] | undefined}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showSizeChanger: true,
          }}
          locale={{
            emptyText: <Empty description={t('ui.noNotificationsFound')} />,
          }}
        />

        {/* Drawer xem Bằng chứng gửi đối soát pháp lý (FR-ALR-16 AC2) */}
        <Drawer
          title={
            <Space>
              <MailOutlined />
              <span>{t('ui.notificationEvidenceModalTitle')}</span>
            </Space>
          }
          size={650}
          open={Boolean(selectedId)}
          onClose={() => setSelectedId(null)}
          loading={isDetailLoading}
          extra={
            detailData?.status === 'FAILED' && detailData.channel === 'EMAIL' ? (
              <Button
                type="primary"
                danger
                icon={<RedoOutlined />}
                loading={retryMutation.isPending}
                onClick={() => detailData && handleRetry(detailData)}
              >
                {t('ui.retryNotificationSend')}
              </Button>
            ) : null
          }
        >
          {detailData ? (
            <Space vertical size="middle" style={{ width: '100%' }}>
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="Mã bằng chứng (ID)">
                  <Typography.Text copyable code>
                    {detailData.id}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationChannelLabel')}>
                  <Tag color={detailData.channel === 'EMAIL' ? 'purple' : 'cyan'}>
                    {detailData.channel}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationTypeLabel')}>
                  <Tag>{detailData.type}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationRecipientLabel')}>
                  <div>
                    <div>{detailData.recipientName}</div>
                    <Typography.Text type="secondary">{detailData.recipientEmail}</Typography.Text>
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.userBrand')}>
                  {detailData.brandName ?? detailData.brandId}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.claimStatus')}>
                  <Tag color={STATUS_TAGS[detailData.status].color}>
                    {t(STATUS_TAGS[detailData.status].label)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationCreatedAtLabel')}>
                  {new Date(detailData.createdAt).toLocaleString('vi-VN')}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationSentAtLabel')}>
                  {detailData.sentAt
                    ? new Date(detailData.sentAt).toLocaleString('vi-VN')
                    : 'Chưa gửi'}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.notificationSubjectLabel')}>
                  <Typography.Text strong>{detailData.subject}</Typography.Text>
                </Descriptions.Item>
              </Descriptions>

              <div>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('ui.notificationContentLabel')}:
                </Typography.Text>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 16,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'Consolas, Menlo, Monaco, monospace',
                    fontSize: 13,
                    lineHeight: 1.6,
                    maxHeight: 400,
                    overflowY: 'auto',
                  }}
                >
                  {detailData.content}
                </div>
              </div>
            </Space>
          ) : (
            <Empty description={t('ui.noNotificationsFound')} />
          )}
        </Drawer>
      </Space>
    </RequireRole>
  );
}

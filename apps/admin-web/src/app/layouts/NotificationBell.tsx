import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Empty, List, Popover, Space, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type BellNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyLatestNotifications,
  useUnreadCount,
} from './status-api';

/**
 * Chuông trên header của mọi trang quản trị (ADR-0028, FR-ALR-17): số thông báo chưa đọc, bấm mở
 * danh sách mới nhất của chính người dùng. Bấm một thông báo là đã đọc; "Xem tất cả" sang trang
 * Thông báo.
 */
export function NotificationBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const count = useUnreadCount(true);
  const latest = useMyLatestNotifications(open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = count.data?.unread ?? 0;

  const openItem = (n: BellNotification) => {
    if (n.readAt === null || n.readAt === undefined) markRead.mutate(n.id);
  };

  const content = (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 32px)' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Typography.Text strong>{t('ui.notifications')}</Typography.Text>
        <Button
          type="link"
          size="small"
          disabled={unread === 0}
          loading={markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          {t('ui.notificationsMarkAllRead')}
        </Button>
      </Space>
      <List
        size="small"
        loading={latest.isLoading}
        dataSource={latest.data ? [...latest.data.items] : []}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.notificationsEmpty')} />
          ),
        }}
        style={{ maxHeight: 360, overflowY: 'auto' }}
        renderItem={(n) => {
          const isUnread = n.readAt === null || n.readAt === undefined;
          return (
            <List.Item
              onClick={() => openItem(n)}
              style={{ cursor: isUnread ? 'pointer' : 'default', alignItems: 'flex-start' }}
            >
              <Space orientation="vertical" size={0} style={{ width: '100%' }}>
                <Space size={6}>
                  {isUnread && <Badge status="processing" />}
                  <Typography.Text strong={isUnread}>{n.subject ?? n.content}</Typography.Text>
                </Space>
                {n.subject && (
                  <Typography.Text type="secondary" ellipsis={{ tooltip: n.content }}>
                    {n.content}
                  </Typography.Text>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatDateTime(n.createdAt)}
                </Typography.Text>
              </Space>
            </List.Item>
          );
        }}
      />
      <Button
        block
        type="link"
        onClick={() => {
          setOpen(false);
          void navigate('/notifications');
        }}
      >
        {t('ui.notificationsViewAll')}
      </Button>
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      content={content}
    >
      <Tooltip title={t('ui.notifications')}>
        <Badge count={unread} size="small" overflowCount={99}>
          <Button
            type="text"
            icon={<BellOutlined />}
            aria-label={
              unread > 0 ? t('ui.notificationsUnread', { count: unread }) : t('ui.notifications')
            }
            className="admin-sider-toggle"
          />
        </Badge>
      </Tooltip>
    </Popover>
  );
}

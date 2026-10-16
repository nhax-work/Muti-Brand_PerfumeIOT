import { HistoryOutlined } from '@ant-design/icons';
import { Card, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { type MachineStatusHistoryEntry, useMachineStatusHistory } from '../api';

/**
 * Lịch sử trạng thái máy (FR-MCH-13): mỗi hàng đổi đúng một trục — kết nối (heartbeat) hoặc chế độ
 * (người vận hành, hay hệ thống khi `DRAINING` tự sang `MAINTENANCE`).
 */
export function StatusHistoryCard({ machineId }: { machineId: string }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMachineStatusHistory(machineId, page);

  const change = (from: string | null | undefined, to: string | null | undefined) =>
    to ? (
      <Space size={4}>
        {from ? <Tag>{from}</Tag> : null}→<Tag color="blue">{to}</Tag>
      </Space>
    ) : null;

  const columns: ColumnsType<MachineStatusHistoryEntry> = [
    { title: t('ui.statusHistoryAt'), key: 'at', render: (_, h) => formatDateTime(h.occurredAt) },
    {
      title: t('ui.statusHistoryChange'),
      key: 'change',
      render: (_, h) =>
        change(h.fromConnectionStatus, h.toConnectionStatus) ??
        change(h.fromOperatingMode, h.toOperatingMode),
    },
    { title: t('ui.statusHistorySource'), dataIndex: 'source', key: 'source' },
    { title: t('ui.statusHistoryReason'), key: 'reason', render: (_, h) => h.reason ?? '—' },
  ];

  return (
    <Card
      className="premium-card"
      style={{ marginTop: 24 }}
      title={
        <Space>
          <HistoryOutlined style={{ color: '#0284c7' }} />
          <span>{t('ui.statusHistoryTitle')}</span>
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 10,
          total: data?.meta.total ?? 0,
          onChange: setPage,
        }}
      />
    </Card>
  );
}

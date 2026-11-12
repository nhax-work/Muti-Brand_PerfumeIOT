import {
  ClockCircleOutlined,
  EyeOutlined,
  FileSearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { type AuditLogEntry, useAuditLogs } from './api';

const { RangePicker } = DatePicker;

export default function AuditLogsPage() {
  const { t } = useI18n();

  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([
    dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ]);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [targetType, setTargetType] = useState<string | undefined>(undefined);
  const [actorId, setActorId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const {
    data: logsRes,
    isLoading,
    refetch,
  } = useAuditLogs({
    page,
    pageSize,
    from: dateRange[0],
    to: dateRange[1],
    action,
    targetType,
    actorId,
  });

  const [viewingLog, setViewingLog] = useState<AuditLogEntry | null>(null);

  const logs = useMemo(() => logsRes?.items ?? [], [logsRes]);

  const columns: ColumnsType<AuditLogEntry> = [
    {
      title: t('ui.occurredAt') ?? 'Thời điểm',
      dataIndex: 'occurredAt',
      key: 'occurredAt',
      width: 170,
      render: (date: string) => (
        <span>
          <ClockCircleOutlined style={{ marginRight: 6, color: '#888' }} />
          {formatDateTime(date)}
        </span>
      ),
    },
    {
      title: t('ui.auditActor') ?? 'Người thực hiện',
      key: 'actor',
      render: (_, record) => (
        <div>
          <Tag color="geekblue">{record.actorType}</Tag>
          {record.actorId && (
            <div style={{ fontSize: 12, color: '#888' }}>
              <code>{record.actorId.slice(0, 8)}...</code>
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('ui.auditAction') ?? 'Hành động',
      dataIndex: 'action',
      key: 'action',
      render: (act: string) => {
        const color =
          act.includes('DELETE') || act.includes('SUSPEND') || act.includes('REJECT')
            ? 'red'
            : act.includes('CREATE') || act.includes('APPROVE')
              ? 'green'
              : 'blue';
        return <Tag color={color}>{act}</Tag>;
      },
    },
    {
      title: t('ui.auditTarget') ?? 'Đối tượng tác động',
      key: 'target',
      render: (_, record) => (
        <div>
          <strong>{record.targetType}</strong>
          {record.targetId && (
            <div style={{ fontSize: 12, color: '#888' }}>
              <code>{record.targetId.slice(0, 8)}...</code>
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('ui.auditSeverity') ?? 'Mức độ',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (sev?: string) => {
        const s = sev?.toUpperCase() ?? 'INFO';
        const color = s === 'CRITICAL' ? 'red' : s === 'WARNING' ? 'gold' : 'blue';
        return <Tag color={color}>{s}</Tag>;
      },
    },
    {
      title: t('ui.auditIp') ?? 'Địa chỉ IP',
      dataIndex: 'sourceIp',
      key: 'sourceIp',
      width: 130,
      render: (ip?: string | null) =>
        ip ? <code>{ip}</code> : <span style={{ color: '#aaa' }}>-</span>,
    },
    {
      title: t('ui.actions') ?? 'Thao tác',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewingLog(record)}>
          {t('ui.auditDetails') ?? 'Chi tiết'}
        </Button>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            <FileSearchOutlined style={{ marginRight: 8 }} />
            {t('ui.auditLogTitle') ?? 'Nhật ký kiểm toán'}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t('ui.auditLogSubtitle') ??
              'Tra cứu toàn bộ lịch sử thao tác, xác thực và biến động trạng thái trên nền tảng (chỉ ghi, không sửa xóa).'}
          </Typography.Text>
        </div>

        <Card size="small">
          <Row justify="space-between" align="middle" gutter={[16, 16]}>
            <Col>
              <Space wrap>
                <RangePicker
                  value={
                    dateRange[0] && dateRange[1] ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null
                  }
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                    } else {
                      setDateRange([undefined, undefined]);
                    }
                  }}
                />
                <Input
                  placeholder={t('ui.auditAction') ?? 'Hành động (ví dụ: brand.create)'}
                  allowClear
                  value={action}
                  onChange={(e) => setAction(e.target.value || undefined)}
                  style={{ width: 180 }}
                />
                <Input
                  placeholder={t('ui.auditTarget') ?? 'Loại đối tượng (ví dụ: Brand)'}
                  allowClear
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value || undefined)}
                  style={{ width: 160 }}
                />
                <Input
                  placeholder={t('ui.auditActor') ?? 'Actor ID'}
                  allowClear
                  value={actorId}
                  onChange={(e) => setActorId(e.target.value || undefined)}
                  style={{ width: 140 }}
                />
              </Space>
            </Col>
            <Col>
              <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={isLoading}>
                {t('ui.refresh') ?? 'Làm mới'}
              </Button>
            </Col>
          </Row>
        </Card>

        <Table<AuditLogEntry>
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: logsRes?.meta?.total,
            onChange: setPage,
          }}
        />

        {/* Drawer xem Payload Before / After */}
        <Drawer
          title={viewingLog ? `${viewingLog.action} - ${viewingLog.targetType}` : ''}
          open={Boolean(viewingLog)}
          onClose={() => setViewingLog(null)}
          width={650}
        >
          {viewingLog && (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label={t('ui.occurredAt') ?? 'Thời điểm'} span={2}>
                  {formatDateTime(viewingLog.occurredAt)}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.auditActor') ?? 'Chủ thể'}>
                  <Tag>{viewingLog.actorType}</Tag>{' '}
                  {viewingLog.actorId ? <code>{viewingLog.actorId}</code> : ''}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.auditIp') ?? 'Địa chỉ IP'}>
                  {viewingLog.sourceIp ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.auditAction') ?? 'Hành động'}>
                  <Tag color="blue">{viewingLog.action}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.auditTarget') ?? 'Đối tượng'}>
                  <strong>{viewingLog.targetType}</strong>{' '}
                  {viewingLog.targetId ? <code>{viewingLog.targetId}</code> : ''}
                </Descriptions.Item>
              </Descriptions>

              <div>
                <Typography.Title level={5}>
                  {t('ui.auditPayload') ?? 'Dữ liệu trước / sau thao tác'}
                </Typography.Title>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card size="small" title="Before Data">
                      {viewingLog.beforeData ? (
                        <pre style={{ margin: 0, fontSize: 12, maxHeight: 300, overflow: 'auto' }}>
                          {JSON.stringify(viewingLog.beforeData, null, 2)}
                        </pre>
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No before data" />
                      )}
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title="After Data">
                      {viewingLog.afterData ? (
                        <pre style={{ margin: 0, fontSize: 12, maxHeight: 300, overflow: 'auto' }}>
                          {JSON.stringify(viewingLog.afterData, null, 2)}
                        </pre>
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No after data" />
                      )}
                    </Card>
                  </Col>
                </Row>
              </div>
            </Space>
          )}
        </Drawer>
      </Space>
    </RequireRole>
  );
}

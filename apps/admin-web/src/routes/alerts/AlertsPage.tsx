import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
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
  type Alert,
  type AlertSeverity,
  type AlertStatus,
  useAcknowledgeAlert,
  useAlert,
  useAlerts,
  useAssignAlert,
  useCloseAlert,
  useResolveAlert,
} from './api';

const SEVERITY_COLORS: Record<AlertSeverity, { color: string; icon: React.ReactNode }> = {
  INFO: { color: 'blue', icon: <InfoCircleOutlined /> },
  WARNING: { color: 'gold', icon: <ExclamationCircleOutlined /> },
  HIGH: { color: 'orange', icon: <ExclamationCircleOutlined /> },
  CRITICAL: { color: 'red', icon: <AlertOutlined /> },
};

const STATUS_COLORS: Record<AlertStatus, { color: string; icon: React.ReactNode }> = {
  OPEN: { color: 'red', icon: <CloseCircleOutlined /> },
  ACKNOWLEDGED: { color: 'blue', icon: <ClockCircleOutlined /> },
  RESOLVED: { color: 'green', icon: <CheckCircleOutlined /> },
  CLOSED: { color: 'default', icon: <CheckCircleOutlined /> },
};

function SeverityTag({ severity }: { readonly severity: AlertSeverity }) {
  const { t } = useI18n();
  const meta = SEVERITY_COLORS[severity] ?? { color: 'default', icon: null };
  return (
    <Tag color={meta.color} icon={meta.icon}>
      {t(`alertSeverity.${severity}` as MessageKey)}
    </Tag>
  );
}

function StatusTag({ status }: { readonly status: AlertStatus }) {
  const { t } = useI18n();
  const meta = STATUS_COLORS[status] ?? { color: 'default', icon: null };
  return (
    <Tag color={meta.color} icon={meta.icon}>
      {t(`alertStatus.${status}` as MessageKey)}
    </Tag>
  );
}

/**
 * Màn hình quản lý và theo dõi cảnh báo vận hành máy & slot (FR-ALR-06, FR-ALR-08, FR-ALR-11, FR-ALR-12).
 * Phân quyền:
 * - Platform Super Admin & Operations Staff: xem toàn bộ cảnh báo hệ thống, tiếp nhận, phân công, giải quyết, đóng.
 * - Brand Admin: chỉ xem cảnh báo ảnh hưởng tới slot của thương hiệu mình, không nhận affectedBrandIds (BR-012).
 */
export default function AlertsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canHandle = user?.permissions.includes('alert.handle') ?? false;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [severity, setSeverity] = useState<AlertSeverity | undefined>();
  const [status, setStatus] = useState<AlertStatus | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Modals state
  const [assignAlertId, setAssignAlertId] = useState<string | null>(null);
  const [resolveAlertId, setResolveAlertId] = useState<string | null>(null);
  const [assignForm] = Form.useForm<{ assignedTo: string }>();
  const [resolveForm] = Form.useForm<{ resolution: string }>();

  const list = useAlerts({ page, pageSize, severity, status });
  const detail = useAlert(selectedId);

  const ackMutation = useAcknowledgeAlert();
  const assignMutation = useAssignAlert();
  const resolveMutation = useResolveAlert();
  const closeMutation = useCloseAlert();

  const handleAcknowledge = async (id: string) => {
    try {
      await ackMutation.mutateAsync(id);
      void message.success(t('ui.alertAcknowledgeSuccess'));
    } catch (err) {
      void message.error(errorMessage(err, t));
    }
  };

  const handleAssignSubmit = async (values: { assignedTo: string }) => {
    if (!assignAlertId) return;
    try {
      await assignMutation.mutateAsync({ id: assignAlertId, assignedTo: values.assignedTo });
      void message.success(t('ui.alertAssignSuccess'));
      setAssignAlertId(null);
      assignForm.resetFields();
    } catch (err) {
      void message.error(errorMessage(err, t));
    }
  };

  const handleResolveSubmit = async (values: { resolution: string }) => {
    if (!resolveAlertId) return;
    try {
      await resolveMutation.mutateAsync({ id: resolveAlertId, resolution: values.resolution });
      void message.success(t('ui.alertResolveSuccess'));
      setResolveAlertId(null);
      resolveForm.resetFields();
    } catch (err) {
      void message.error(errorMessage(err, t));
    }
  };

  const handleClose = async (id: string) => {
    try {
      await closeMutation.mutateAsync(id);
      void message.success(t('ui.alertCloseSuccess'));
    } catch (err) {
      void message.error(errorMessage(err, t));
    }
  };

  const columns: ColumnsType<Alert> = [
    {
      title: t('ui.alertTitle'),
      dataIndex: 'title',
      key: 'title',
      render: (val: string, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{val}</Typography.Text>
          <Typography.Text orientation="left" type="secondary" style={{ fontSize: 12 }}>
            {record.type} · ID: {record.id.slice(0, 8)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.alertSeverityLabel'),
      dataIndex: 'severity',
      key: 'severity',
      width: 130,
      render: (val: AlertSeverity) => <SeverityTag severity={val} />,
    },
    {
      title: t('ui.alertStatusLabel'),
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (val: AlertStatus) => <StatusTag status={val} />,
    },
    {
      title: t('ui.alertOccurrences'),
      dataIndex: 'occurrenceCount',
      key: 'occurrenceCount',
      width: 100,
      render: (count: number) => <Tag color={count > 1 ? 'volcano' : 'default'}>{count}</Tag>,
    },
    {
      title: t('ui.alertLastOccurredAt'),
      dataIndex: 'lastOccurredAt',
      key: 'lastOccurredAt',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space wrap size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedId(record.id)}>
            {t('ui.viewDetails')}
          </Button>

          {canHandle && record.status === 'OPEN' && (
            <Button
              size="small"
              type="primary"
              loading={ackMutation.isPending}
              onClick={() => handleAcknowledge(record.id)}
            >
              {t('ui.alertAcknowledge')}
            </Button>
          )}

          {canHandle && record.status !== 'CLOSED' && (
            <Button
              size="small"
              icon={<UserAddOutlined />}
              onClick={() => {
                setAssignAlertId(record.id);
                assignForm.setFieldsValue({ assignedTo: record.assignedTo ?? '' });
              }}
            >
              {t('ui.alertAssign')}
            </Button>
          )}

          {canHandle && (record.status === 'OPEN' || record.status === 'ACKNOWLEDGED') && (
            <Button
              size="small"
              type="primary"
              ghost
              onClick={() => {
                setResolveAlertId(record.id);
                resolveForm.setFieldsValue({ resolution: record.resolution ?? '' });
              }}
            >
              {t('ui.alertResolve')}
            </Button>
          )}

          {canHandle && record.status === 'RESOLVED' && (
            <Popconfirm
              title={t('ui.alertCloseConfirm')}
              onConfirm={() => handleClose(record.id)}
              okText={t('ui.confirm')}
              cancelText={t('ui.cancel')}
            >
              <Button size="small" danger>
                {t('ui.alertClose')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {t('ui.alerts')}
          </Typography.Title>

          <Space wrap>
            <Select<AlertSeverity | 'ALL'>
              value={severity ?? 'ALL'}
              style={{ width: 150 }}
              onChange={(val) => {
                setSeverity(val === 'ALL' ? undefined : val);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: t('ui.allSeverities') },
                { value: 'INFO', label: t('alertSeverity.INFO') },
                { value: 'WARNING', label: t('alertSeverity.WARNING') },
                { value: 'HIGH', label: t('alertSeverity.HIGH') },
                { value: 'CRITICAL', label: t('alertSeverity.CRITICAL') },
              ]}
            />

            <Select<AlertStatus | 'ALL'>
              value={status ?? 'ALL'}
              style={{ width: 160 }}
              onChange={(val) => {
                setStatus(val === 'ALL' ? undefined : val);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: t('ui.allStatuses') },
                { value: 'OPEN', label: t('alertStatus.OPEN') },
                { value: 'ACKNOWLEDGED', label: t('alertStatus.ACKNOWLEDGED') },
                { value: 'RESOLVED', label: t('alertStatus.RESOLVED') },
                { value: 'CLOSED', label: t('alertStatus.CLOSED') },
              ]}
            />
          </Space>
        </Space>

        <Table<Alert>
          rowKey="id"
          columns={columns}
          dataSource={list.data?.items ?? []}
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
        />

        {/* Modal phân công */}
        <Modal
          title={t('ui.alertAssignModalTitle')}
          open={assignAlertId !== null}
          onCancel={() => {
            setAssignAlertId(null);
            assignForm.resetFields();
          }}
          onOk={() => assignForm.submit()}
          confirmLoading={assignMutation.isPending}
        >
          <Form form={assignForm} layout="vertical" onFinish={handleAssignSubmit}>
            <Form.Item
              name="assignedTo"
              label={t('ui.alertAssignedToUserId')}
              rules={[{ required: true, message: t('ui.fieldRequired') }]}
            >
              <Input placeholder="uuid-nhan-vien-van-hanh" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal ghi nội dung giải quyết */}
        <Modal
          title={t('ui.alertResolveModalTitle')}
          open={resolveAlertId !== null}
          onCancel={() => {
            setResolveAlertId(null);
            resolveForm.resetFields();
          }}
          onOk={() => resolveForm.submit()}
          confirmLoading={resolveMutation.isPending}
        >
          <Form form={resolveForm} layout="vertical" onFinish={handleResolveSubmit}>
            <Form.Item
              name="resolution"
              label={t('ui.alertResolutionText')}
              rules={[{ required: true, message: t('ui.alertResolutionRequired') }]}
            >
              <Input.TextArea rows={4} placeholder={t('ui.alertResolutionPlaceholder')} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Drawer xem chi tiết */}
        <Drawer
          title={t('ui.alertDetailTitle')}
          width={560}
          open={selectedId !== null}
          onClose={() => setSelectedId(null)}
        >
          {detail.data ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('ui.alertTitle')}>{detail.data.title}</Descriptions.Item>
              <Descriptions.Item label={t('ui.alertTypeLabel')}>
                <Tag>{detail.data.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertSeverityLabel')}>
                <SeverityTag severity={detail.data.severity} />
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertStatusLabel')}>
                <StatusTag status={detail.data.status} />
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertDescription')}>
                {detail.data.description || '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertMachineId')}>
                {detail.data.machineId}
              </Descriptions.Item>
              {detail.data.slotId && (
                <Descriptions.Item label={t('ui.alertSlotId')}>
                  {detail.data.slotId}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('ui.alertOccurrences')}>
                {detail.data.occurrenceCount}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertFirstOccurredAt')}>
                {formatDateTime(detail.data.firstOccurredAt)}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertLastOccurredAt')}>
                {formatDateTime(detail.data.lastOccurredAt)}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertAcknowledgedBy')}>
                {detail.data.acknowledgedBy
                  ? `${detail.data.acknowledgedBy} (${formatDateTime(detail.data.acknowledgedAt)})`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertAssignedTo')}>
                {detail.data.assignedTo || '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertResolvedBy')}>
                {detail.data.resolvedBy
                  ? `${detail.data.resolvedBy} (${formatDateTime(detail.data.resolvedAt)})`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.alertResolutionText')}>
                {detail.data.resolution || '—'}
              </Descriptions.Item>
              {detail.data.affectedBrandIds && detail.data.affectedBrandIds.length > 0 && (
                <Descriptions.Item label={t('ui.alertAffectedBrands')}>
                  <Space wrap>
                    {detail.data.affectedBrandIds.map((bId) => (
                      <Tag key={bId}>{bId}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Empty description={t('ui.noData')} />
          )}
        </Drawer>
      </Space>
    </RequireRole>
  );
}

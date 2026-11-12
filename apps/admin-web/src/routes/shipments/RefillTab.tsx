import { CheckCircleOutlined, CloseCircleOutlined, ToolOutlined } from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { errorMessage } from '@/shared/api';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type RefillSession,
  type RefillStatus,
  useCloseRefillSession,
  useMachineSlots,
  useMachinesForRefill,
  useOpenRefillSession,
  useRefillSessions,
  useStockBottles,
} from './api';

const STATUS_TAGS: Record<RefillStatus, { color: string; icon: React.ReactNode }> = {
  STARTED: { color: 'blue', icon: <ToolOutlined /> },
  COMPLETED: { color: 'green', icon: <CheckCircleOutlined /> },
  CANCELLED: { color: 'default', icon: <CloseCircleOutlined /> },
};

interface OpenValues {
  machineId: string;
  slotId: string;
}

interface CloseValues {
  newBottleId: string;
  checklistCompleted: boolean;
  notes?: string;
}

/**
 * FR-INV-29 ÷ 32, 35. Máy chủ quyết định mở/đóng được hay không (máy bận, hóa đơn chưa thanh toán,
 * lô chưa duyệt…) — màn hình chỉ hiện lỗi máy chủ trả về.
 */
export function RefillTab({
  canOperate,
  canSeeMachines,
}: {
  readonly canOperate: boolean;
  readonly canSeeMachines: boolean;
}) {
  const { t } = useI18n();
  const sessions = useRefillSessions();
  const machines = useMachinesForRefill(canSeeMachines);
  const open = useOpenRefillSession();
  const close = useCloseRefillSession();

  const [opening, setOpening] = useState(false);
  const [openForm] = Form.useForm<OpenValues>();
  const selectedMachine = Form.useWatch('machineId', openForm);
  const slots = useMachineSlots(opening ? selectedMachine : undefined);

  const [closing, setClosing] = useState<RefillSession | null>(null);
  const [closeForm] = Form.useForm<CloseValues>();
  const bottles = useStockBottles(closing !== null);

  const machineNames = useMemo(
    () => new Map((machines.data?.items ?? []).map((m) => [m.id, m.displayName])),
    [machines.data],
  );
  // Chai phải thuộc thương hiệu đang thuê slot (FR-INV-06); máy chủ vẫn kiểm lại.
  const bottleOptions = (bottles.data?.items ?? [])
    .filter((b) => closing !== null && b.brandId === closing.brandId)
    .map((b) => ({ value: b.id, label: `${b.identifier} · ${b.currentEstimatedMl} ml` }));

  const handleOpen = async () => {
    const values = await openForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await open.mutateAsync({ slotId: values.slotId });
      void message.success(t('inv.refillSessionOpened'));
      setOpening(false);
      openForm.resetFields();
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const handleClose = async () => {
    if (!closing) return;
    const values = await closeForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await close.mutateAsync({
        id: closing.id,
        newBottleId: values.newBottleId,
        checklistCompleted: true,
        ...(values.notes ? { notes: values.notes } : {}),
      });
      void message.success(t('inv.refillSessionClosed'));
      setClosing(null);
      closeForm.resetFields();
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<RefillSession> = [
    {
      title: t('ui.invMachine'),
      dataIndex: 'machineId',
      key: 'machineId',
      render: (id: string) =>
        machineNames.get(id) ?? <Typography.Text code>{id.slice(0, 8)}</Typography.Text>,
    },
    {
      title: t('ui.invStartedAt'),
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: t('ui.invStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: RefillStatus) => (
        <Tag color={STATUS_TAGS[status].color} icon={STATUS_TAGS[status].icon}>
          {t(`refillSessionStatus.${status}` as MessageKey)}
        </Tag>
      ),
    },
    {
      title: t('ui.invNotes'),
      dataIndex: 'notes',
      key: 'notes',
      render: (value: string | null) => value ?? '—',
    },
    ...(canOperate
      ? [
          {
            title: t('ui.actions'),
            key: 'actions',
            render: (_: unknown, record: RefillSession) =>
              record.status === 'STARTED' ? (
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => setClosing(record)}
                >
                  {t('ui.closeRefillSession')}
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {canOperate && (
        <Button type="primary" icon={<ToolOutlined />} onClick={() => setOpening(true)}>
          {t('ui.openRefillSession')}
        </Button>
      )}
      <Table
        columns={columns}
        dataSource={sessions.data ? [...sessions.data.items] : []}
        rowKey="id"
        loading={sessions.isLoading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={t('ui.openRefillSession')}
        open={opening}
        onOk={handleOpen}
        confirmLoading={open.isPending}
        onCancel={() => setOpening(false)}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          message={t('ui.refillOpenWarning')}
          style={{ marginBottom: 16 }}
        />
        <Form form={openForm} layout="vertical">
          <Form.Item
            name="machineId"
            label={t('ui.invMachine')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              placeholder={t('ui.selectMachine')}
              loading={machines.isLoading}
              onChange={() => openForm.setFieldValue('slotId', undefined)}
              options={(machines.data?.items ?? []).map((m) => ({
                value: m.id,
                label: `${m.displayName} (${m.serialNumber})`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="slotId"
            label={t('ui.invSlot')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              placeholder={t('ui.selectSlot')}
              disabled={!selectedMachine}
              loading={slots.isLoading}
              options={(slots.data ?? []).map((s) => ({
                value: s.id,
                label: t('ui.slotNumber', { slotNumber: s.slotNumber }),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('ui.closeRefillSession')}
        open={closing !== null}
        onOk={handleClose}
        confirmLoading={close.isPending}
        onCancel={() => setClosing(null)}
        destroyOnClose
      >
        <Form form={closeForm} layout="vertical">
          <Form.Item
            name="newBottleId"
            label={t('ui.invNewBottle')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              placeholder={t('ui.selectBottle')}
              loading={bottles.isLoading}
              notFoundContent={t('ui.noBottleInStock')}
              options={bottleOptions}
            />
          </Form.Item>
          <Form.Item
            name="checklistCompleted"
            valuePropName="checked"
            rules={[
              {
                validator: (_, value) =>
                  value ? Promise.resolve() : Promise.reject(new Error(t('inv.checklistRequired'))),
              },
            ]}
          >
            <Checkbox>{t('ui.checklistCompletedLabel')}</Checkbox>
          </Form.Item>
          <Form.Item name="notes" label={t('ui.invNotes')}>
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

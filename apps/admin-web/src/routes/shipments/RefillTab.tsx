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
import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '@/shared/api';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type RefillSession,
  type RefillStatus,
  type RefillWorkItem,
  useCancelRefillSession,
  useCloseRefillSession,
  useInventoryBatches,
  useMachineSlots,
  useMachinesForRefill,
  useOpenRefillSession,
  useRefillSessions,
  useRefillWorklist,
  useStockBottles,
} from './api';

const STATUS_TAGS: Record<RefillStatus, { color: string; icon: React.ReactNode }> = {
  STARTED: { color: 'blue', icon: <ToolOutlined /> },
  COMPLETED: { color: 'green', icon: <CheckCircleOutlined /> },
  CANCELLED: { color: 'default', icon: <CloseCircleOutlined /> },
};

const KIND_COLORS: Record<RefillWorkItem['kind'], string> = {
  FIRST_INSTALL: 'purple',
  REFILL_REQUEST: 'blue',
  LOW_STOCK: 'orange',
};

/** Yêu cầu bổ sung liên kết được với phiếu (FR-RFQ-08) — máy chủ chỉ nhận ACCEPTED, SCHEDULED. */
const LINKABLE_REQUEST = new Set(['ACCEPTED', 'SCHEDULED']);

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
 * FR-INV-29 ÷ 32, 35 và ADR-0026. Việc cần nạp do máy chủ tính: Thủ Kho bấm từ danh sách, phiếu mở
 * đúng slot và gắn yêu cầu bổ sung; đóng phiếu thì chọn sẵn chai gợi ý. Máy chủ vẫn quyết định mở/đóng
 * được hay không (máy bận, lô chưa duyệt…) — màn hình chỉ hiện lỗi máy chủ trả về.
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
  const worklist = useRefillWorklist(canOperate);
  const machines = useMachinesForRefill(canSeeMachines);
  const open = useOpenRefillSession();
  const close = useCloseRefillSession();
  const cancel = useCancelRefillSession();
  const [cancelling, setCancelling] = useState<RefillSession | null>(null);
  const [cancelForm] = Form.useForm<{ reason: string }>();

  const [opening, setOpening] = useState<{ machineId?: string; slotId?: string } | null>(null);
  const [openForm] = Form.useForm<OpenValues>();
  const selectedMachine = Form.useWatch('machineId', openForm);
  const selectedSlot = Form.useWatch('slotId', openForm);
  const slots = useMachineSlots(opening ? selectedMachine : undefined);

  const [closing, setClosing] = useState<RefillSession | null>(null);
  // Mốc so hạn dùng — chụp lúc bấm mở pop-up, không gọi Date.now() trong lúc render.
  const [closingAt, setClosingAt] = useState(0);
  const [closeForm] = Form.useForm<CloseValues>();
  const bottles = useStockBottles(closing?.fragranceProductId);
  const approvedBatches = useInventoryBatches('APPROVED');

  const machineNames = useMemo(
    () => new Map((machines.data?.items ?? []).map((m) => [m.id, m.displayName])),
    [machines.data],
  );
  const workBySlot = useMemo(
    () => new Map((worklist.data?.items ?? []).map((w) => [w.slotId, w])),
    [worklist.data],
  );
  const sessionById = useMemo(
    () => new Map((sessions.data?.items ?? []).map((s) => [s.id, s])),
    [sessions.data],
  );

  const workText = (w: RefillWorkItem) => ({
    product: w.productName ?? t('ui.refillWorkProductMissing'),
  });

  // Chai lắp được: đúng sản phẩm (lọc ở máy chủ), lô đã duyệt giấy tờ, còn hạn — cùng điều kiện máy chủ
  // kiểm khi đóng phiếu (FR-INV-35). Hết hạn sớm nhất lên đầu.
  const closingWork = closing ? workBySlot.get(closing.slotId) : undefined;
  const bottleOptions = useMemo(() => {
    const approved = new Set((approvedBatches.data?.items ?? []).map((b) => b.id));
    return (bottles.data?.items ?? [])
      .filter(
        (b) => approved.has(b.batchId) && (!b.expiresAt || Date.parse(b.expiresAt) > closingAt),
      )
      .sort(
        (a, b) =>
          (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) -
            (b.expiresAt ? Date.parse(b.expiresAt) : Infinity) ||
          a.identifier.localeCompare(b.identifier),
      )
      .map((b) => ({
        value: b.id,
        label: b.expiresAt
          ? t('ui.refillBottleOption', {
              identifier: b.identifier,
              ml: b.currentEstimatedMl,
              expires: formatDateTime(b.expiresAt),
            })
          : t('ui.refillBottleOptionNoExpiry', {
              identifier: b.identifier,
              ml: b.currentEstimatedMl,
            }),
      }));
  }, [approvedBatches.data, bottles.data, closingAt, t]);

  const startOpen = (preset: { machineId?: string; slotId?: string }) => setOpening(preset);
  const startClose = (session: RefillSession) => {
    setClosingAt(Date.now());
    setClosing(session);
  };

  // Điền sẵn sau khi pop-up đã gắn form (destroyOnHidden gắn lại form mỗi lần mở).
  useEffect(() => {
    if (!opening) return;
    openForm.resetFields();
    openForm.setFieldsValue(opening);
  }, [opening, openForm]);
  const closingSuggestion = closingWork?.suggestedBottle?.id;
  useEffect(() => {
    if (!closing) return;
    closeForm.resetFields();
    if (closingSuggestion) closeForm.setFieldValue('newBottleId', closingSuggestion);
  }, [closing, closingSuggestion, closeForm]);

  const handleOpen = async () => {
    const values = await openForm.validateFields().catch(() => null);
    if (!values) return;
    const work = workBySlot.get(values.slotId);
    const refillRequestId =
      work?.refillRequestId && LINKABLE_REQUEST.has(work.refillRequestStatus ?? '')
        ? work.refillRequestId
        : undefined;
    try {
      await open.mutateAsync({
        slotId: values.slotId,
        ...(refillRequestId ? { refillRequestId } : {}),
      });
      void message.success(t('inv.refillSessionOpened'));
      setOpening(null);
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
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  // ADR-0028: hủy phiếu mở nhầm hoặc không có chai đúng — không có nút này thì máy dừng bán mãi.
  const handleCancel = async () => {
    if (!cancelling) return;
    const values = await cancelForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await cancel.mutateAsync({ id: cancelling.id, reason: values.reason });
      void message.success(t('ui.refillSessionCancelled'));
      setCancelling(null);
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const sessionActions = (session: RefillSession) => (
    <Space size={4} wrap>
      <Button
        type="primary"
        size="small"
        icon={<CheckCircleOutlined />}
        onClick={() => startClose(session)}
      >
        {t('ui.closeRefillSession')}
      </Button>
      <Button
        size="small"
        danger
        icon={<CloseCircleOutlined />}
        onClick={() => {
          cancelForm.resetFields();
          setCancelling(session);
        }}
      >
        {t('ui.cancelRefillSession')}
      </Button>
    </Space>
  );

  const workColumns: ColumnsType<RefillWorkItem> = [
    {
      title: t('ui.refillWorkMachineSlot'),
      key: 'slot',
      render: (_, w) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>
            {w.machineName} · {t('ui.refillSlotLabel', { slotNumber: w.slotNumber })}
          </Typography.Text>
          <Typography.Text type="secondary">{w.locationName}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.refillWorkBrandProduct'),
      key: 'product',
      render: (_, w) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text>{w.brandName}</Typography.Text>
          <Typography.Text type={w.productName ? undefined : 'secondary'}>
            {workText(w).product}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.refillWorkTask'),
      key: 'task',
      render: (_, w) => (
        <Space orientation="vertical" size={2}>
          <Space size={4} wrap>
            <Tag color={KIND_COLORS[w.kind]}>{t(`refillWorkKind.${w.kind}` as MessageKey)}</Tag>
            {w.refillRequestReason && (
              <Tag>{t(`refillRequestReason.${w.refillRequestReason}` as MessageKey)}</Tag>
            )}
            {w.openRefillSessionId && (
              <Tag color="processing" icon={<ToolOutlined />}>
                {t('ui.refillWorkInProgress')}
              </Tag>
            )}
          </Space>
          <Typography.Text type="secondary">
            {w.estimatedRemainingSprays === null
              ? t('ui.refillWorkNoBottle')
              : t('ui.refillWorkRemaining', { count: w.estimatedRemainingSprays })}
            {w.scheduledAt &&
              ` · ${t('ui.refillWorkScheduled', { time: formatDateTime(w.scheduledAt) })}`}
          </Typography.Text>
          {w.blocker && (
            <Typography.Text type="warning">
              {w.blocker === 'NO_STOCK' && w.pendingShipment
                ? t('ui.refillWorkAwaitingShipment')
                : t(`refillWorkBlocker.${w.blocker}` as MessageKey)}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: t('ui.refillWorkBottle'),
      key: 'bottle',
      render: (_, w) =>
        w.suggestedBottle ? (
          <Space orientation="vertical" size={0}>
            <Typography.Text code>{w.suggestedBottle.identifier}</Typography.Text>
            <Typography.Text type="secondary">
              {t('ui.refillWorkAvailable', { count: w.availableBottleCount })}
            </Typography.Text>
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, w) => {
        const session = w.openRefillSessionId ? sessionById.get(w.openRefillSessionId) : undefined;
        if (session) return sessionActions(session);
        return (
          <Button
            size="small"
            icon={<ToolOutlined />}
            disabled={w.blocker !== null || w.openRefillSessionId !== null}
            onClick={() => startOpen({ machineId: w.machineId, slotId: w.slotId })}
          >
            {t('ui.openRefillSession')}
          </Button>
        );
      },
    },
  ];

  const columns: ColumnsType<RefillSession> = [
    {
      title: t('ui.invMachine'),
      dataIndex: 'machineId',
      key: 'machineId',
      render: (id: string) =>
        machineNames.get(id) ?? <Typography.Text code>{id.slice(0, 8)}</Typography.Text>,
    },
    {
      title: t('ui.invSlot'),
      dataIndex: 'slotNumber',
      key: 'slotNumber',
      render: (n: number | undefined) => n ?? '—',
    },
    {
      title: t('ui.refillWorkBrandProduct'),
      key: 'brandProduct',
      render: (_, s) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text>{s.brandName ?? '—'}</Typography.Text>
          <Typography.Text type="secondary">{s.productName ?? '—'}</Typography.Text>
        </Space>
      ),
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
              record.status === 'STARTED' ? sessionActions(record) : null,
          },
        ]
      : []),
  ];

  const selectedWork = selectedSlot ? workBySlot.get(selectedSlot) : undefined;

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {canOperate && (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {t('ui.refillWorklist')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('ui.refillWorklistHint')}</Typography.Text>
          <Table
            columns={workColumns}
            dataSource={worklist.data ? [...worklist.data.items] : []}
            rowKey="slotId"
            loading={worklist.isLoading}
            pagination={false}
            locale={{ emptyText: t('ui.refillWorklistEmpty') }}
            // Việc chưa làm được vẫn hiện để Thủ Kho biết vì sao, nhưng làm mờ cho khỏi lẫn.
            onRow={(w) => ({
              style: w.blocker && !w.openRefillSessionId ? { opacity: 0.6 } : undefined,
            })}
          />
        </Space>
      )}

      <Space orientation="vertical" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {t('ui.refillSessionsHistory')}
          </Typography.Title>
          {canOperate && (
            <Button icon={<ToolOutlined />} onClick={() => startOpen({})}>
              {t('ui.openRefillSession')}
            </Button>
          )}
        </Space>
        <Table
          columns={columns}
          dataSource={sessions.data ? [...sessions.data.items] : []}
          rowKey="id"
          loading={sessions.isLoading}
          pagination={{ pageSize: 10 }}
        />
      </Space>

      <Modal
        title={t('ui.openRefillSession')}
        open={opening !== null}
        onOk={handleOpen}
        confirmLoading={open.isPending}
        onCancel={() => setOpening(null)}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          title={t('ui.refillOpenWarning')}
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
              optionLabelProp="title"
              options={(slots.data ?? []).map((s) => {
                const work = workBySlot.get(s.id);
                const slotLabel = t('ui.refillSlotLabel', { slotNumber: s.slotNumber });
                return {
                  value: s.id,
                  title: slotLabel,
                  // Slot chưa ai thuê thì không có gì để nạp — máy chủ cũng trả RENTAL_NOT_ACTIVE.
                  disabled: s.currentRentalId === null && !work,
                  label: (
                    <Space size={4} wrap>
                      <span>{slotLabel}</span>
                      {work ? (
                        <>
                          <Typography.Text type="secondary">
                            {t('ui.refillSlotOptionDetail', {
                              brand: work.brandName,
                              product: workText(work).product,
                            })}
                          </Typography.Text>
                          <Tag color={KIND_COLORS[work.kind]}>
                            {t(`refillWorkKind.${work.kind}` as MessageKey)}
                          </Tag>
                        </>
                      ) : s.currentRentalId === null ? (
                        <Typography.Text type="secondary">
                          {t('ui.refillSlotEmpty')}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  ),
                };
              })}
            />
          </Form.Item>
          {selectedWork?.blocker && (
            <Alert
              type="info"
              showIcon
              title={t(`refillWorkBlocker.${selectedWork.blocker}` as MessageKey)}
            />
          )}
        </Form>
      </Modal>

      <Modal
        title={t('ui.closeRefillSession')}
        open={closing !== null}
        onOk={handleClose}
        confirmLoading={close.isPending}
        onCancel={() => setClosing(null)}
        destroyOnHidden
      >
        {closing && (
          <Typography.Paragraph strong>
            {closing.slotNumber !== undefined
              ? t('ui.refillTarget', {
                  slotNumber: closing.slotNumber,
                  brand: closing.brandName ?? '—',
                  product: closing.productName ?? t('ui.refillWorkProductMissing'),
                })
              : null}
            {closingWork && (
              <Tag color={KIND_COLORS[closingWork.kind]} style={{ marginLeft: 8 }}>
                {t(`refillWorkKind.${closingWork.kind}` as MessageKey)}
              </Tag>
            )}
          </Typography.Paragraph>
        )}
        <Form form={closeForm} layout="vertical">
          <Form.Item
            name="newBottleId"
            label={t('ui.invNewBottle')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              placeholder={t('ui.selectBottle')}
              loading={bottles.isLoading || approvedBatches.isLoading}
              notFoundContent={t('ui.noBottleInStock')}
              showSearch
              optionFilterProp="label"
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

      <Modal
        title={t('ui.cancelRefillTitle')}
        open={cancelling !== null}
        onOk={handleCancel}
        okButtonProps={{ danger: true }}
        okText={t('ui.cancelRefillSession')}
        confirmLoading={cancel.isPending}
        onCancel={() => setCancelling(null)}
        destroyOnHidden
      >
        {cancelling?.slotNumber !== undefined && (
          <Typography.Paragraph strong>
            {t('ui.refillTarget', {
              slotNumber: cancelling.slotNumber,
              brand: cancelling.brandName ?? '—',
              product: cancelling.productName ?? t('ui.refillWorkProductMissing'),
            })}
          </Typography.Paragraph>
        )}
        <Alert type="info" showIcon title={t('ui.cancelRefillHint')} style={{ marginBottom: 16 }} />
        <Form form={cancelForm} layout="vertical">
          <Form.Item
            name="reason"
            label={t('ui.cancelRefillReason')}
            rules={[{ required: true, whitespace: true, message: t('inv.cancelReasonRequired') }]}
          >
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

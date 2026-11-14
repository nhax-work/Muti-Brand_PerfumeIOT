import { ExperimentOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
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
import { ReauthCancelled } from '@/shared/auth';
import { codeLabel } from '@/shared/codes';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { useNameLookups } from '@/shared/lookups';
import { BottleHistoryDrawer } from './BottleHistoryDrawer';
import {
  BOTTLE_STATUS_COLOR,
  type Bottle,
  type BottleStatus,
  useBottles,
  useBrandProducts,
  useCreateInventoryAdjustment,
  useInventoryBatches,
  useRegisterBottle,
  useRemoveBottleFromSlot,
} from './api';

const PAGE_SIZE = 20;

const BOTTLE_STATUSES: readonly BottleStatus[] = [
  'IN_STOCK',
  'INSTALLED',
  'LOW',
  'EMPTY',
  'DAMAGED',
  'EXPIRED',
  'LIQUIDATED',
  'RETURNED_TO_BRAND',
];

/** Giá trị DatePicker của antd — tránh kéo thêm kiểu trực tiếp từ dayjs. */
interface PickedDate {
  toISOString(): string;
}

interface RegisterBottleValues {
  batchId: string;
  identifier: string;
  initialVolumeMl: number;
  expiresAt?: PickedDate;
}

interface RemoveBottleValues {
  notes?: string;
}

interface AdjustInventoryValues {
  afterQuantityMl: number;
  reason: string;
}

/**
 * FR-INV-02, 04, 15, 16, 17: Danh sách chai nước hoa, đăng ký chai vào kho,
 * tháo chai khỏi slot về kho, điều chỉnh tồn kho (xác thực lại) và xem lịch sử từng chai.
 */
export function BottlesTab({
  canManage,
  canAdjust,
  isPlatform,
}: {
  readonly canManage: boolean;
  readonly canAdjust: boolean;
  readonly isPlatform: boolean;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<BottleStatus | undefined>(undefined);
  const [batchFilter, setBatchFilter] = useState<string | undefined>(undefined);

  const bottles = useBottles({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter,
    batchId: batchFilter,
  });
  const batches = useInventoryBatches();
  const products = useBrandProducts(true);
  const { brandName, slotLabel } = useNameLookups();

  const registerBottle = useRegisterBottle();
  const removeFromSlot = useRemoveBottleFromSlot();
  const adjustInventory = useCreateInventoryAdjustment();

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm] = Form.useForm<RegisterBottleValues>();

  const [removing, setRemoving] = useState<Bottle | null>(null);
  const [removeForm] = Form.useForm<RemoveBottleValues>();

  const [adjusting, setAdjusting] = useState<Bottle | null>(null);
  const [adjustForm] = Form.useForm<AdjustInventoryValues>();
  const watchedAfterMl = Form.useWatch('afterQuantityMl', adjustForm);

  const [historyBottle, setHistoryBottle] = useState<Bottle | null>(null);

  const batchMap = useMemo(
    () => new Map((batches.data?.items ?? []).map((b) => [b.id, b])),
    [batches.data?.items],
  );
  const productMap = useMemo(
    () => new Map((products.data?.items ?? []).map((p) => [p.id, p])),
    [products.data?.items],
  );

  const resolveProductName = (bottle: Bottle): string => {
    if (bottle.fragranceProductId) {
      const product = productMap.get(bottle.fragranceProductId);
      if (product) return product.name;
    }
    const batch = batchMap.get(bottle.batchId);
    if (batch?.productName) return batch.productName;
    if (batch?.fragranceProductId) {
      const product = productMap.get(batch.fragranceProductId);
      if (product) return product.name;
    }
    return '—';
  };

  const resolveBatchNumber = (bottle: Bottle): string =>
    batchMap.get(bottle.batchId)?.batchNumber ?? '—';

  const handleRegister = async () => {
    const values = await registerForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await registerBottle.mutateAsync({
        batchId: values.batchId,
        identifier: values.identifier.trim(),
        initialVolumeMl: values.initialVolumeMl,
        ...(values.expiresAt ? { expiresAt: values.expiresAt.toISOString() } : {}),
      });
      void message.success(t('inv.bottleRegistered'));
      setRegisterOpen(false);
      registerForm.resetFields();
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const handleRemove = async () => {
    if (!removing?.installedSlotId) return;
    const values = await removeForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      const trimmedNotes = values.notes?.trim();
      await removeFromSlot.mutateAsync({
        slotId: removing.installedSlotId,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      void message.success(t('ui.bottleRemovedSuccess'));
      setRemoving(null);
      removeForm.resetFields();
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const handleAdjust = async () => {
    if (!adjusting) return;
    const values = await adjustForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await adjustInventory.mutateAsync({
        bottleId: adjusting.id,
        ...(adjusting.installedSlotId ? { slotId: adjusting.installedSlotId } : {}),
        afterQuantityMl: values.afterQuantityMl,
        reason: values.reason.trim(),
      });
      void message.success(t('ui.inventoryAdjustedSuccess'));
      setAdjusting(null);
      adjustForm.resetFields();
    } catch (error) {
      if (error instanceof ReauthCancelled) return;
      void message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<Bottle> = [
    {
      title: t('ui.bottleIdentifierLabel'),
      dataIndex: 'identifier',
      key: 'identifier',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    ...(isPlatform
      ? [
          {
            title: t('ui.batchBrandLabel'),
            dataIndex: 'brandId',
            key: 'brandId',
            render: (brandId: string) => brandName(brandId),
          },
        ]
      : []),
    {
      title: t('ui.invProduct'),
      key: 'product',
      render: (_, record) => resolveProductName(record),
    },
    {
      title: t('ui.bottleBatchLabel'),
      key: 'batch',
      render: (_, record) => resolveBatchNumber(record),
    },
    {
      title: t('ui.bottleRemainingMl'),
      dataIndex: 'currentEstimatedMl',
      key: 'currentEstimatedMl',
      align: 'right',
      render: (ml: number, record) =>
        record.initialVolumeMl ? `${ml} / ${record.initialVolumeMl} ml` : `${ml} ml`,
    },
    {
      title: t('ui.slot'),
      dataIndex: 'installedSlotId',
      key: 'installedSlotId',
      render: (slotId: string | null | undefined) =>
        slotId ? (
          slotLabel(slotId)
        ) : (
          <Typography.Text type="secondary">{t('ui.inStockSlotLabel')}</Typography.Text>
        ),
    },
    {
      title: t('ui.bottleOwnerLabel'),
      dataIndex: 'owner',
      key: 'owner',
      render: (owner: Bottle['owner']) => (
        <Tag color={owner === 'BRAND' ? 'blue' : 'purple'}>
          {codeLabel(t, 'revenueOwner', owner)}
        </Tag>
      ),
    },
    {
      title: t('ui.bottleExpiresAt'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (iso: string | null | undefined) => (iso ? formatDateTime(iso) : '—'),
    },
    {
      title: t('ui.invStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: BottleStatus) => (
        <Tag color={BOTTLE_STATUS_COLOR[status]}>{codeLabel(t, 'bottleStatus', status)}</Tag>
      ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" onClick={() => setHistoryBottle(record)}>
            {t('ui.bottleHistory')}
          </Button>
          {canAdjust && (
            <Button
              size="small"
              onClick={() => {
                setAdjusting(record);
                adjustForm.setFieldsValue({
                  afterQuantityMl: record.currentEstimatedMl,
                  reason: '',
                });
              }}
            >
              {t('ui.adjustInventory')}
            </Button>
          )}
          {canManage && Boolean(record.installedSlotId) && (
            <Button
              size="small"
              danger
              onClick={() => {
                setRemoving(record);
                removeForm.resetFields();
              }}
            >
              {t('ui.removeFromSlot')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const hasFilters = statusFilter !== undefined || batchFilter !== undefined;

  const adjustmentDiff =
    adjusting !== null && typeof watchedAfterMl === 'number'
      ? Number((watchedAfterMl - adjusting.currentEstimatedMl).toFixed(2))
      : null;

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Space wrap>
          <Select<BottleStatus | 'ALL'>
            style={{ width: 220 }}
            value={statusFilter ?? 'ALL'}
            onChange={(value) => {
              setStatusFilter(value === 'ALL' ? undefined : value);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.filterAllStatuses') },
              ...BOTTLE_STATUSES.map((status) => ({
                value: status,
                label: codeLabel(t, 'bottleStatus', status),
              })),
            ]}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 260 }}
            placeholder={t('ui.selectBatchPlaceholder')}
            value={batchFilter}
            loading={batches.isLoading}
            onChange={(value: string | undefined) => {
              setBatchFilter(value);
              setPage(1);
            }}
            options={(batches.data?.items ?? []).map((b) => ({
              value: b.id,
              label: b.productName ? `${b.batchNumber} — ${b.productName}` : b.batchNumber,
            }))}
          />
          {hasFilters && (
            <Button
              onClick={() => {
                setStatusFilter(undefined);
                setBatchFilter(undefined);
                setPage(1);
              }}
            >
              {t('ui.clearFilter')}
            </Button>
          )}
        </Space>

        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}>
            {t('ui.registerBottle')}
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={bottles.data ? [...bottles.data.items] : []}
        rowKey="id"
        loading={bottles.isLoading}
        locale={{ emptyText: t('ui.noBottlesFound') }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: bottles.data?.meta.total ?? 0,
          onChange: (nextPage) => setPage(nextPage),
          showSizeChanger: false,
        }}
      />

      <Modal
        title={
          <span>
            <ExperimentOutlined /> {t('ui.registerBottle')}
          </span>
        }
        open={registerOpen}
        onOk={handleRegister}
        confirmLoading={registerBottle.isPending}
        onCancel={() => {
          setRegisterOpen(false);
          registerForm.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={registerForm} layout="vertical">
          <Form.Item
            name="batchId"
            label={t('ui.bottleBatchLabel')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={batches.isLoading}
              placeholder={t('ui.selectBatchPlaceholder')}
              options={(batches.data?.items ?? []).map((b) => ({
                value: b.id,
                label: b.productName ? `${b.batchNumber} — ${b.productName}` : b.batchNumber,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="identifier"
            label={t('ui.bottleIdentifierLabel')}
            rules={[{ required: true, whitespace: true, message: t('validation.required') }]}
          >
            <Input maxLength={100} placeholder={t('ui.bottleIdentifierPlaceholder')} />
          </Form.Item>
          <Form.Item
            name="initialVolumeMl"
            label={t('ui.bottleInitialVolumeLabel')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber min={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="expiresAt"
            label={t('ui.bottleExpiresAt')}
            extra={t('ui.bottleExpiresHint')}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          removing
            ? t('ui.removeFromSlotTitle', { bottle: removing.identifier })
            : t('ui.removeFromSlot')
        }
        open={removing !== null}
        onOk={handleRemove}
        confirmLoading={removeFromSlot.isPending}
        onCancel={() => {
          setRemoving(null);
          removeForm.resetFields();
        }}
        destroyOnHidden
      >
        {removing && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              title={t('ui.removeFromSlotHint', { ml: String(removing.currentEstimatedMl) })}
            />
            <Form form={removeForm} layout="vertical">
              <Form.Item name="notes" label={t('ui.invNotes')}>
                <Input.TextArea
                  rows={3}
                  maxLength={500}
                  placeholder={t('ui.removeBottleNotesPlaceholder')}
                />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal
        title={
          adjusting
            ? t('ui.adjustInventoryTitle', { bottle: adjusting.identifier })
            : t('ui.adjustInventory')
        }
        open={adjusting !== null}
        onOk={handleAdjust}
        confirmLoading={adjustInventory.isPending}
        onCancel={() => {
          setAdjusting(null);
          adjustForm.resetFields();
        }}
        destroyOnHidden
      >
        {adjusting && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Alert type="warning" showIcon title={t('ui.adjustInventoryReauthHint')} />
            <Typography.Text>
              {t('ui.currentEstimatedMlLabel')}:{' '}
              <Typography.Text strong>{adjusting.currentEstimatedMl} ml</Typography.Text>
            </Typography.Text>
            <Form form={adjustForm} layout="vertical">
              <Form.Item
                name="afterQuantityMl"
                label={t('ui.afterQuantityMlLabel')}
                rules={[{ required: true, message: t('validation.required') }]}
                extra={
                  adjustmentDiff !== null
                    ? t('ui.adjustmentDifferencePreview', {
                        diff: adjustmentDiff > 0 ? `+${adjustmentDiff}` : String(adjustmentDiff),
                      })
                    : undefined
                }
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="reason"
                label={t('ui.adjustmentReasonLabel')}
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: t('inv.adjustmentReasonRequired'),
                  },
                ]}
              >
                <Input.TextArea
                  rows={3}
                  maxLength={500}
                  placeholder={t('ui.adjustmentReasonPlaceholder')}
                />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <BottleHistoryDrawer
        bottle={historyBottle}
        productName={historyBottle ? resolveProductName(historyBottle) : undefined}
        batchNumber={historyBottle ? resolveBatchNumber(historyBottle) : undefined}
        onClose={() => setHistoryBottle(null)}
      />
    </Space>
  );
}

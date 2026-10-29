import { SafetyOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { ReauthCancelled, useAuth } from '@/shared/auth';
import { codeLabel } from '@/shared/codes';
import { formatDateTime, formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type Bottle,
  type BottleStatus,
  type StorageCompensation,
  type StorageCompensationStatus,
  useBottles,
  useBrandNames,
  useMarkBottleDamaged,
  usePayoutCompensation,
  useStorageCompensations,
} from './api';

const STATUS_COLOR: Record<StorageCompensationStatus, string> = {
  PENDING: 'orange',
  PAID: 'green',
};
const COMPENSATION_STATUSES: readonly StorageCompensationStatus[] = ['PENDING', 'PAID'];

/** Chai mà nền tảng còn giữ — trạng thái có thể ghi nhận hư hỏng (ADR-0018). */
const DAMAGEABLE_STATUSES: readonly BottleStatus[] = [
  'IN_STOCK',
  'INSTALLED',
  'LOW',
  'EMPTY',
  'EXPIRED',
  'RETURNED_TO_BRAND',
];

/**
 * Bảo hiểm hàng hóa (FR-SLT-44 ÷ 46, ADR-0018). Hai tab theo quyền mà máy chủ cũng kiểm:
 *   - Khoản bồi thường (`report.brand`): Brand Admin xem khoản của mình, Super Admin xem mọi thương
 *     hiệu và ghi nhận chi trả (`revenue.manage`, xác thực lại).
 *   - Ghi nhận chai hư hỏng (`inventory.adjust`, xác thực lại): Inventory Staff, Super Admin.
 * Số tiền bồi thường do máy chủ tính — màn hình chỉ hiện kết quả (FE5).
 */
export default function StorageCompensationsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;
  const canView = can('report.brand');
  const canDamage = can('inventory.adjust');

  const tabs = [
    ...(canView
      ? [
          {
            key: 'compensations',
            label: (
              <span>
                <SafetyOutlined /> {t('ui.compensations')}
              </span>
            ),
            children: (
              <CompensationsTab
                isPlatform={user?.brandId == null}
                canPayout={can('revenue.manage')}
              />
            ),
          },
        ]
      : []),
    ...(canDamage
      ? [
          {
            key: 'damage',
            label: (
              <span>
                <WarningOutlined /> {t('ui.damagedBottles')}
              </span>
            ),
            children: <DamageTab />,
          },
        ]
      : []),
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'BRAND_ADMIN', 'INVENTORY_STAFF']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('ui.storageCompensations')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('ui.storageCompensationsSubtitle')}</Typography.Text>
        </div>
        <Card>
          <Tabs items={tabs} />
        </Card>
      </Space>
    </RequireRole>
  );
}

function CompensationsTab({ isPlatform, canPayout }: { isPlatform: boolean; canPayout: boolean }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StorageCompensationStatus | undefined>();
  const [brandId, setBrandId] = useState<string | undefined>();
  const [selected, setSelected] = useState<StorageCompensation | null>(null);

  const compensations = useStorageCompensations({ page, pageSize: 20, status, brandId });
  const brands = useBrandNames(isPlatform);

  const columns: ColumnsType<StorageCompensation> = [
    {
      title: t('ui.compensationBottle'),
      key: 'bottle',
      render: (_, c) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{c.bottleIdentifier ?? c.bottleId}</Typography.Text>
          <Typography.Text type="secondary">{c.productName}</Typography.Text>
        </Space>
      ),
    },
    ...(isPlatform
      ? [
          {
            title: t('ui.payoutBrand'),
            key: 'brand',
            render: (_: unknown, c: StorageCompensation) => c.brandName ?? c.brandId,
          },
        ]
      : []),
    {
      title: t('ui.compensationInvoice'),
      key: 'invoice',
      render: (_, c) => c.invoiceNumber ?? '—',
    },
    {
      title: t('ui.compensationAmount'),
      key: 'amount',
      render: (_, c) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{formatVnd(c.amount)}</Typography.Text>
          <Typography.Text type="secondary">
            {t('ui.compensationFormula', {
              percent: c.coveragePercent,
              price: formatVnd(c.bottleRetailPrice),
            })}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.pricingStatus'),
      key: 'status',
      render: (_, c) => (
        <Tag color={STATUS_COLOR[c.status]}>
          {codeLabel(t, 'storageCompensationStatus', c.status)}
        </Tag>
      ),
    },
    {
      title: t('ui.compensationDamagedAt'),
      key: 'damagedAt',
      render: (_, c) => formatDateTime(c.damagedAt ?? c.createdAt),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, c) => (
        <Button type="link" size="small" onClick={() => setSelected(c)}>
          {t('ui.payoutDetail')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select<StorageCompensationStatus | 'ALL'>
          style={{ width: 200 }}
          value={status ?? 'ALL'}
          onChange={(v) => {
            setStatus(v === 'ALL' ? undefined : v);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: t('ui.allStatuses') },
            ...COMPENSATION_STATUSES.map((s) => ({
              value: s,
              label: codeLabel(t, 'storageCompensationStatus', s),
            })),
          ]}
        />
        {isPlatform && (
          <Select<string>
            style={{ width: 240 }}
            value={brandId ?? 'ALL'}
            showSearch
            optionFilterProp="label"
            onChange={(v) => {
              setBrandId(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.allBrands') },
              ...(brands.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        )}
      </Space>
      <Table
        rowKey="id"
        loading={compensations.isLoading}
        columns={columns}
        dataSource={compensations.data?.items ?? []}
        scroll={{ x: 900 }}
        locale={{ emptyText: t('ui.noCompensations') }}
        pagination={{
          current: page,
          pageSize: 20,
          total: compensations.data?.meta.total ?? 0,
          onChange: setPage,
        }}
      />
      <CompensationDrawer
        compensation={selected}
        canPayout={canPayout}
        onChanged={setSelected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function CompensationDrawer({
  compensation,
  canPayout,
  onChanged,
  onClose,
}: {
  compensation: StorageCompensation | null;
  canPayout: boolean;
  onChanged: (c: StorageCompensation) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const payout = usePayoutCompensation();
  const [reference, setReference] = useState('');
  if (!compensation) return null;

  const submit = async () => {
    try {
      onChanged(
        await payout.mutateAsync({ id: compensation.id, payoutReference: reference.trim() }),
      );
      setReference('');
      message.success(t('ui.compensationPaidDone'));
    } catch (error) {
      if (!(error instanceof ReauthCancelled)) message.error(errorMessage(error, t));
    }
  };

  return (
    <Drawer
      open
      width={520}
      title={compensation.bottleIdentifier ?? compensation.bottleId}
      onClose={() => {
        setReference('');
        onClose();
      }}
      destroyOnHidden
    >
      <Descriptions column={1} size="small" bordered>
        {compensation.brandName && (
          <Descriptions.Item label={t('ui.payoutBrand')}>
            {compensation.brandName}
          </Descriptions.Item>
        )}
        <Descriptions.Item label={t('ui.compensationProduct')}>
          {compensation.productName ?? '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.compensationInvoice')}>
          {compensation.invoiceNumber ?? '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.compensationPlan')}>
          {compensation.storagePlanName ?? '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.compensationRetailPrice')}>
          {formatVnd(compensation.bottleRetailPrice)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.compensationCoverage')}>
          {compensation.coveragePercent}%
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.compensationAmount')}>
          <Typography.Text strong>{formatVnd(compensation.amount)}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.pricingStatus')}>
          <Tag color={STATUS_COLOR[compensation.status]}>
            {codeLabel(t, 'storageCompensationStatus', compensation.status)}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.compensationDamagedAt')}>
          {formatDateTime(compensation.damagedAt ?? compensation.createdAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.payoutPaidAt')}>
          {formatDateTime(compensation.paidAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.payoutTransferReference')}>
          {compensation.payoutReference ?? '—'}
        </Descriptions.Item>
      </Descriptions>

      {canPayout && compensation.status === 'PENDING' && (
        <div style={{ marginTop: 24 }}>
          <Typography.Title level={5}>{t('ui.compensationPayout')}</Typography.Title>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={t('ui.compensationPayoutHint')}
          />
          <Input
            maxLength={200}
            placeholder={t('ui.payoutTransferReference')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Button
            type="primary"
            style={{ marginTop: 12 }}
            loading={payout.isPending}
            disabled={!reference.trim()}
            onClick={() => void submit()}
          >
            {t('ui.compensationPayout')}
          </Button>
        </div>
      )}
    </Drawer>
  );
}

function DamageTab() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BottleStatus | undefined>();
  const [target, setTarget] = useState<Bottle | null>(null);
  const [reason, setReason] = useState('');
  const bottles = useBottles({ page, pageSize: 20, status }, true);
  const mark = useMarkBottleDamaged();

  const submit = async () => {
    if (!target) return;
    try {
      const result = await mark.mutateAsync({ id: target.id, reason: reason.trim() });
      const c = result.compensation;
      if (c) {
        message.success(t('ui.damageRecordedWithCompensation', { amount: formatVnd(c.amount) }));
      } else {
        message.info(t('ui.damageRecordedNoCompensation'));
      }
      setTarget(null);
      setReason('');
    } catch (error) {
      if (!(error instanceof ReauthCancelled)) message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<Bottle> = [
    {
      title: t('ui.compensationBottle'),
      dataIndex: 'identifier',
      key: 'identifier',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: t('ui.pricingStatus'),
      key: 'status',
      render: (_, b) => (
        <Tag color={b.status === 'DAMAGED' ? 'red' : 'default'}>
          {codeLabel(t, 'bottleStatus', b.status)}
        </Tag>
      ),
    },
    {
      title: t('ui.bottleInstalled'),
      key: 'installed',
      render: (_, b) => (b.installedSlotId ? t('ui.yes') : t('ui.no')),
    },
    {
      title: t('ui.bottleRemainingMl'),
      key: 'remaining',
      render: (_, b) => `${b.currentEstimatedMl} ml`,
    },
    {
      title: t('ui.bottleExpiresAt'),
      key: 'expiresAt',
      render: (_, b) => formatDateTime(b.expiresAt),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, b) =>
        DAMAGEABLE_STATUSES.includes(b.status) ? (
          <Button danger size="small" onClick={() => setTarget(b)}>
            {t('ui.markDamaged')}
          </Button>
        ) : b.status === 'DAMAGED' ? (
          <Typography.Text type="secondary">{b.damageReason ?? '—'}</Typography.Text>
        ) : null,
    },
  ];

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('ui.damageHint')} />
      <Select<BottleStatus | 'ALL'>
        style={{ width: 220, marginBottom: 16 }}
        value={status ?? 'ALL'}
        onChange={(v) => {
          setStatus(v === 'ALL' ? undefined : v);
          setPage(1);
        }}
        options={[
          { value: 'ALL', label: t('ui.allStatuses') },
          ...[...DAMAGEABLE_STATUSES, 'DAMAGED' as const].map((s) => ({
            value: s,
            label: codeLabel(t, 'bottleStatus', s),
          })),
        ]}
      />
      <Table
        rowKey="id"
        loading={bottles.isLoading}
        columns={columns}
        dataSource={bottles.data?.items ?? []}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: bottles.data?.meta.total ?? 0,
          onChange: setPage,
        }}
      />
      <Modal
        open={target !== null}
        title={t('ui.markDamagedTitle', { bottle: target?.identifier ?? '' })}
        okText={t('ui.markDamaged')}
        okButtonProps={{ danger: true, disabled: !reason.trim(), loading: mark.isPending }}
        cancelText={t('ui.cancel')}
        onOk={() => void submit()}
        onCancel={() => {
          setTarget(null);
          setReason('');
        }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">{t('ui.markDamagedHint')}</Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={2000}
          placeholder={t('ui.damageReasonPlaceholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </>
  );
}

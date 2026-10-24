import { WarningOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { ReauthCancelled, useAuth } from '@/shared/auth';
import { codeLabel } from '@/shared/codes';
import { formatDateTime, formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type BrandPayout,
  type BrandPayoutStatus,
  useBrandNames,
  useBrandPayouts,
  useDisputeBrandPayout,
  usePayBrandPayout,
  useRespondBrandPayoutDispute,
} from './api';

const STATUS_COLOR: Record<BrandPayoutStatus, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PAID: 'green',
};

/** `2026-10-01` → `10/2026`. */
function periodLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split('-');
  return `${month}/${year}`;
}

/**
 * Kỳ chi trả doanh thu (FR-SLT-52..54, ADR-0013). Brand Admin xem kỳ của mình và khiếu nại kỳ đã chốt;
 * Super Admin xem mọi thương hiệu, trả lời khiếu nại và ghi nhận chuyển khoản. Nút chỉ hiện theo trạng
 * thái máy chủ trả về — máy chủ vẫn là nơi quyết định (FE5).
 */
export default function BrandPayoutsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isSuperAdmin = user?.roles.includes('PLATFORM_SUPER_ADMIN') ?? false;

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BrandPayoutStatus | undefined>();
  const [brandId, setBrandId] = useState<string | undefined>();
  const [selected, setSelected] = useState<BrandPayout | null>(null);

  const payouts = useBrandPayouts({ page, pageSize: 20, status, brandId });
  const brands = useBrandNames(isSuperAdmin);
  const brandName = useMemo(() => {
    const names = new Map((brands.data?.items ?? []).map((b) => [b.id, b.name]));
    return (id: string) => names.get(id) ?? id;
  }, [brands.data]);

  const columns: ColumnsType<BrandPayout> = [
    {
      title: t('ui.payoutPeriod'),
      key: 'period',
      render: (_, p) => <Typography.Text strong>{periodLabel(p.periodMonth)}</Typography.Text>,
    },
    ...(isSuperAdmin
      ? [
          {
            title: t('ui.payoutBrand'),
            key: 'brand',
            render: (_: unknown, p: BrandPayout) => brandName(p.brandId),
          },
        ]
      : []),
    {
      title: t('ui.pricingStatus'),
      key: 'status',
      render: (_, p) => (
        <Space>
          <Tag color={STATUS_COLOR[p.status]}>{codeLabel(t, 'brandPayoutStatus', p.status)}</Tag>
          {p.disputedAt && !p.disputeResolvedAt && (
            <Tag color="orange" icon={<WarningOutlined />}>
              {t('ui.payoutDisputed')}
            </Tag>
          )}
        </Space>
      ),
    },
    { title: t('ui.payoutOrderCount'), dataIndex: 'orderCount', key: 'orderCount' },
    { title: t('ui.payoutAmount'), key: 'amount', render: (_, p) => formatVnd(p.amount) },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, p) => (
        <Button type="link" size="small" onClick={() => setSelected(p)}>
          {t('ui.payoutDetail')}
        </Button>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'BRAND_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.brandPayouts')}</Typography.Title>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('ui.payoutHint')} />
        <Space style={{ marginBottom: 16 }} wrap>
          <Select<BrandPayoutStatus | 'ALL'>
            style={{ width: 200 }}
            value={status ?? 'ALL'}
            onChange={(v) => {
              setStatus(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.allStatuses') },
              ...(Object.keys(STATUS_COLOR) as BrandPayoutStatus[]).map((s) => ({
                value: s,
                label: codeLabel(t, 'brandPayoutStatus', s),
              })),
            ]}
          />
          {isSuperAdmin && (
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
          loading={payouts.isLoading}
          columns={columns}
          dataSource={payouts.data?.items ?? []}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: payouts.data?.meta.total ?? 0,
            onChange: setPage,
          }}
        />
        <PayoutDrawer
          payout={selected}
          isSuperAdmin={isSuperAdmin}
          brandName={isSuperAdmin ? brandName(selected?.brandId ?? '') : undefined}
          onChanged={setSelected}
          onClose={() => setSelected(null)}
        />
      </div>
    </RequireRole>
  );
}

function PayoutDrawer({
  payout,
  isSuperAdmin,
  brandName,
  onChanged,
  onClose,
}: {
  payout: BrandPayout | null;
  isSuperAdmin: boolean;
  brandName: string | undefined;
  onChanged: (payout: BrandPayout) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const pay = usePayBrandPayout();
  const dispute = useDisputeBrandPayout();
  const respond = useRespondBrandPayoutDispute();
  const [text, setText] = useState('');
  if (!payout) return null;

  const openDispute = payout.disputedAt !== null && payout.disputeResolvedAt === null;
  const canDispute = !isSuperAdmin && payout.status === 'CONFIRMED' && !payout.disputedAt;
  const canRespond = isSuperAdmin && openDispute;
  const canPay = isSuperAdmin && payout.status === 'CONFIRMED' && !openDispute;

  const run = async (action: () => Promise<BrandPayout>, done: string) => {
    try {
      onChanged(await action());
      setText('');
      message.success(done);
    } catch (error) {
      if (!(error instanceof ReauthCancelled)) message.error(errorMessage(error, t));
    }
  };

  return (
    <Drawer
      open
      width={520}
      title={`${t('ui.payoutPeriod')} ${periodLabel(payout.periodMonth)}`}
      onClose={() => {
        setText('');
        onClose();
      }}
      destroyOnHidden
    >
      {payout.status === 'DRAFT' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('ui.payoutDraftHint')}
        />
      )}
      <Descriptions column={1} size="small" bordered>
        {brandName && (
          <Descriptions.Item label={t('ui.payoutBrand')}>{brandName}</Descriptions.Item>
        )}
        <Descriptions.Item label={t('ui.pricingStatus')}>
          <Tag color={STATUS_COLOR[payout.status]}>
            {codeLabel(t, 'brandPayoutStatus', payout.status)}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.payoutOrderCount')}>{payout.orderCount}</Descriptions.Item>
        <Descriptions.Item label={t('ui.payoutAmount')}>
          {formatVnd(payout.amount)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.payoutConfirmedAt')}>
          {formatDateTime(payout.confirmedAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.payoutPaidAt')}>
          {formatDateTime(payout.paidAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.payoutTransferReference')}>
          {payout.transferReference ?? '—'}
        </Descriptions.Item>
        {payout.disputeNote && (
          <Descriptions.Item label={t('ui.payoutDisputeNote')}>
            {payout.disputeNote}
          </Descriptions.Item>
        )}
        {payout.disputeResponse && (
          <Descriptions.Item label={t('ui.payoutDisputeResponse')}>
            {payout.disputeResponse}
          </Descriptions.Item>
        )}
      </Descriptions>

      {canDispute && (
        <ActionBox
          title={t('ui.payoutDispute')}
          placeholder={t('ui.payoutDisputePlaceholder')}
          value={text}
          onChange={setText}
          loading={dispute.isPending}
          onSubmit={() =>
            run(
              () => dispute.mutateAsync({ id: payout.id, note: text.trim() }),
              t('ui.payoutDisputeSent'),
            )
          }
        />
      )}
      {canRespond && (
        <ActionBox
          title={t('ui.payoutRespond')}
          placeholder={t('ui.payoutResponsePlaceholder')}
          value={text}
          onChange={setText}
          loading={respond.isPending}
          onSubmit={() =>
            run(
              () => respond.mutateAsync({ id: payout.id, response: text.trim() }),
              t('ui.payoutResponded'),
            )
          }
        />
      )}
      {canPay && (
        <ActionBox
          title={t('ui.payoutPay')}
          hint={t('ui.payoutPayHint')}
          placeholder={t('ui.payoutTransferReference')}
          singleLine
          value={text}
          onChange={setText}
          loading={pay.isPending}
          onSubmit={() =>
            run(
              () => pay.mutateAsync({ id: payout.id, transferReference: text.trim() }),
              t('ui.payoutPaidDone'),
            )
          }
        />
      )}
    </Drawer>
  );
}

function ActionBox({
  title,
  hint,
  placeholder,
  singleLine = false,
  value,
  onChange,
  loading,
  onSubmit,
}: {
  title: string;
  hint?: string;
  placeholder: string;
  singleLine?: boolean;
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <Typography.Title level={5}>{title}</Typography.Title>
      {hint && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={hint} />}
      {singleLine ? (
        <Input
          maxLength={100}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input.TextArea
          rows={3}
          maxLength={2000}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <Button
        type="primary"
        style={{ marginTop: 12 }}
        loading={loading}
        disabled={!value.trim()}
        onClick={onSubmit}
      >
        {title}
      </Button>
    </div>
  );
}

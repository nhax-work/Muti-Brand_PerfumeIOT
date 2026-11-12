import { BarChartOutlined, TrophyOutlined } from '@ant-design/icons';
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type ProductRankingItem,
  type RentalSalesGroupBy,
  type RentalSalesReport,
  useLocationOptions,
  useMachineOptions,
  useProductRanking,
  useRentalSales,
} from './api';

type Range = readonly [string, string] | undefined;

/** Khoảng ngày chọn trên lịch → `[from, to)` ISO: từ đầu ngày đầu tới đầu ngày sau ngày cuối. */
function RangeFilter({ onChange }: { onChange: (range: Range) => void }) {
  return (
    <DatePicker.RangePicker
      onChange={(dates) =>
        onChange(
          dates?.[0] && dates[1]
            ? [
                dates[0].startOf('day').toISOString(),
                dates[1].add(1, 'day').startOf('day').toISOString(),
              ]
            : undefined,
        )
      }
    />
  );
}

/**
 * Báo cáo (FR-RPT-06, FR-SLT-47). Xếp hạng sản phẩm cho Super Admin và Brand Admin — Brand Admin chỉ
 * nhận sản phẩm của mình, máy chủ lọc (FR-RPT-10). Doanh thu bán gói chỉ Super Admin (`revenue.manage`,
 * FR-RPT-15). Mọi con số do máy chủ tính (FE5).
 */
export default function ReportsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;
  const isPlatform = user?.brandId == null;

  const tabs = [
    ...(can('report.brand')
      ? [
          {
            key: 'ranking',
            label: (
              <span>
                <TrophyOutlined /> {t('ui.productRanking')}
              </span>
            ),
            children: <RankingTab isPlatform={isPlatform} />,
          },
        ]
      : []),
    ...(can('revenue.manage') && isPlatform
      ? [
          {
            key: 'rental-sales',
            label: (
              <span>
                <BarChartOutlined /> {t('ui.rentalSales')}
              </span>
            ),
            children: <RentalSalesTab />,
          },
        ]
      : []),
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'BRAND_ADMIN']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('ui.reports')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('ui.reportsSubtitle')}</Typography.Text>
        </div>
        <Card>
          <Tabs items={tabs} />
        </Card>
      </Space>
    </RequireRole>
  );
}

function PlaceFilters({
  machineId,
  locationId,
  onMachine,
  onLocation,
}: {
  machineId: string | undefined;
  locationId: string | undefined;
  onMachine: (id: string | undefined) => void;
  onLocation: (id: string | undefined) => void;
}) {
  const { t } = useI18n();
  const machines = useMachineOptions(true);
  const locations = useLocationOptions(true);
  return (
    <>
      <Select<string>
        style={{ width: 220 }}
        value={machineId ?? 'ALL'}
        showSearch
        optionFilterProp="label"
        onChange={(v) => onMachine(v === 'ALL' ? undefined : v)}
        options={[
          { value: 'ALL', label: t('ui.allMachines') },
          ...(machines.data?.items ?? []).map((m) => ({ value: m.id, label: m.displayName })),
        ]}
      />
      <Select<string>
        style={{ width: 220 }}
        value={locationId ?? 'ALL'}
        showSearch
        optionFilterProp="label"
        onChange={(v) => onLocation(v === 'ALL' ? undefined : v)}
        options={[
          { value: 'ALL', label: t('ui.allLocations') },
          ...(locations.data?.items ?? []).map((l) => ({ value: l.id, label: l.name })),
        ]}
      />
    </>
  );
}

function RankingTab({ isPlatform }: { isPlatform: boolean }) {
  const { t } = useI18n();
  const [range, setRange] = useState<Range>();
  const [machineId, setMachineId] = useState<string | undefined>();
  const [locationId, setLocationId] = useState<string | undefined>();
  const ranking = useProductRanking({ from: range?.[0], to: range?.[1], machineId, locationId });

  const columns: ColumnsType<ProductRankingItem> = [
    { title: '#', key: 'rank', width: 60, render: (_, __, index) => index + 1 },
    { title: t('ui.compensationProduct'), dataIndex: 'productName', key: 'productName' },
    { title: t('ui.rankingSelections'), dataIndex: 'selectionCount', key: 'selections' },
    {
      title: t('ui.rankingImpressions'),
      key: 'impressions',
      render: (_, r) => r.impressionCount ?? 0,
    },
    {
      title: t('ui.rankingConversion'),
      key: 'conversion',
      render: (_, r) =>
        r.impressionCount ? `${Math.round((r.selectionCount / r.impressionCount) * 100)}%` : '—',
    },
    { title: t('ui.rankingOrders'), key: 'orders', render: (_, r) => r.orderCount ?? 0 },
  ];

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('ui.rankingHint')} />
      <Space style={{ marginBottom: 16 }} wrap>
        <RangeFilter onChange={setRange} />
        {isPlatform && (
          <PlaceFilters
            machineId={machineId}
            locationId={locationId}
            onMachine={setMachineId}
            onLocation={setLocationId}
          />
        )}
      </Space>
      {ranking.error && <Alert type="error" showIcon message={errorMessage(ranking.error, t)} />}
      <Table
        rowKey="fragranceProductId"
        loading={ranking.isLoading}
        columns={columns}
        dataSource={ranking.data ?? []}
        pagination={false}
        locale={{ emptyText: t('ui.rankingEmpty') }}
      />
    </>
  );
}

const GROUPS: readonly RentalSalesGroupBy[] = ['PACKAGE', 'STORAGE_PLAN', 'MACHINE', 'LOCATION'];

function RentalSalesTab() {
  const { t } = useI18n();
  const [range, setRange] = useState<Range>();
  const [groupBy, setGroupBy] = useState<RentalSalesGroupBy>('PACKAGE');
  const [machineId, setMachineId] = useState<string | undefined>();
  const [locationId, setLocationId] = useState<string | undefined>();
  const sales = useRentalSales(
    { from: range?.[0], to: range?.[1], groupBy, machineId, locationId },
    true,
  );
  const report = sales.data;

  const groupLabel: Record<RentalSalesGroupBy, string> = {
    PACKAGE: t('ui.rentalSalesByPackage'),
    STORAGE_PLAN: t('ui.rentalSalesByPlan'),
    MACHINE: t('ui.rentalSalesByMachine'),
    LOCATION: t('ui.rentalSalesByLocation'),
  };

  const columns: ColumnsType<RentalSalesReport['items'][number]> = [
    { title: groupLabel[groupBy], dataIndex: 'label', key: 'label' },
    { title: t('ui.rentalSalesInvoices'), dataIndex: 'invoiceCount', key: 'invoices' },
    { title: t('ui.rentalSalesRent'), key: 'rent', render: (_, r) => formatVnd(r.rentAmount) },
    {
      title: t('ui.rentalSalesStorage'),
      key: 'storage',
      render: (_, r) => formatVnd(r.storageAmount),
    },
    {
      title: t('ui.rentalSalesGraceFee'),
      key: 'grace',
      render: (_, r) => formatVnd(r.graceFeeAmount),
    },
    {
      title: t('ui.rentalSalesTotal'),
      key: 'total',
      render: (_, r) => <Typography.Text strong>{formatVnd(r.totalAmount)}</Typography.Text>,
    },
  ];

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('ui.rentalSalesHint')} />
      <Space style={{ marginBottom: 16 }} wrap>
        <RangeFilter onChange={setRange} />
        <PlaceFilters
          machineId={machineId}
          locationId={locationId}
          onMachine={setMachineId}
          onLocation={setLocationId}
        />
        <Segmented<RentalSalesGroupBy>
          value={groupBy}
          onChange={setGroupBy}
          options={GROUPS.map((g) => ({ value: g, label: groupLabel[g] }))}
        />
      </Space>
      {sales.error && <Alert type="error" showIcon message={errorMessage(sales.error, t)} />}
      {report && (
        <>
          <Typography.Paragraph type="secondary">
            {t('ui.revenuePeriod', {
              from: new Date(report.from).toLocaleDateString('vi-VN'),
              to: new Date(new Date(report.to).getTime() - 1).toLocaleDateString('vi-VN'),
            })}
          </Typography.Paragraph>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} md={6}>
              <Statistic
                title={t('ui.rentalSalesTotal')}
                value={formatVnd(report.totals.totalAmount)}
              />
            </Col>
            <Col xs={24} md={6}>
              <Statistic
                title={t('ui.rentalSalesRent')}
                value={formatVnd(report.totals.rentAmount)}
              />
            </Col>
            <Col xs={24} md={6}>
              <Statistic
                title={t('ui.rentalSalesStorage')}
                value={formatVnd(report.totals.storageAmount)}
              />
            </Col>
            <Col xs={24} md={6}>
              <Statistic
                title={t('ui.rentalSalesGraceFee')}
                value={formatVnd(report.totals.graceFeeAmount)}
              />
            </Col>
          </Row>
        </>
      )}
      <Table
        rowKey="key"
        loading={sales.isLoading}
        columns={columns}
        dataSource={report?.items ?? []}
        pagination={false}
        locale={{ emptyText: t('ui.rentalSalesEmpty') }}
      />
    </>
  );
}

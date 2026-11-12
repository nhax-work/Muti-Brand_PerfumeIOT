import {
  AppstoreAddOutlined,
  InteractionOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { RequireRole } from '@/app/guards/RequireRole';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  HELD_STAGES,
  type BrandSlotReportItem,
  type MachineMapSlot,
  type RentalInvoice,
  type RentalInvoiceStage,
  type SlotRental,
  useBrandSlotReport,
  useInvoices,
  useMachineMaps,
  useMyRentals,
} from './api';
import { periodRange, type PeriodKey } from './period';

const STAGE_TAGS: Partial<Record<RentalInvoiceStage, { color: string; label: MessageKey }>> = {
  AWAITING_STOCK: { color: 'cyan', label: 'ui.stageAwaitingStock' },
  ACTIVE: { color: 'green', label: 'ui.stageActive' },
  EXPIRING: { color: 'gold', label: 'ui.stageExpiring' },
  GRACE: { color: 'magenta', label: 'ui.stageGrace' },
};

const PERIODS: readonly { value: PeriodKey; label: MessageKey }[] = [
  { value: 'thisMonth', label: 'ui.periodThisMonth' },
  { value: 'lastMonth', label: 'ui.periodLastMonth' },
  { value: 'last30Days', label: 'ui.periodLast30Days' },
  { value: 'all', label: 'ui.periodAll' },
];

/** Một dòng của bảng: hóa đơn đang giữ slot, ghép chi tiết, sơ đồ máy và báo cáo kỳ. */
export interface MySlotRow {
  readonly rental: SlotRental;
  readonly invoice: RentalInvoice | undefined;
  readonly map: MachineMapSlot | undefined;
  readonly report: BrandSlotReportItem | undefined;
}

/**
 * "Slot của tôi" — Brand Admin xem từng slot thương hiệu đang thuê: đang bán hay tạm ngưng, lượt
 * xịt còn lại, số đơn và doanh thu trong kỳ (FR-RPT-08, FR-RPT-12), và đi tới phần cấu hình sản
 * phẩm, giá ở hóa đơn (FR-SLT-27, FR-SLT-08). Mọi số liệu do máy chủ lọc theo thương hiệu
 * (FR-RPT-10); màn hình chỉ ghép và hiển thị (FE5).
 */
export default function MySlotsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>('thisMonth');
  const range = useMemo(() => periodRange(period), [period]);

  const rentals = useMyRentals();
  const held = useMemo(
    () => (rentals.data?.items ?? []).filter((r) => r.stage && HELD_STAGES.includes(r.stage)),
    [rentals.data],
  );
  const invoices = useInvoices(held.map((r) => r.id));
  const machineIds = useMemo(
    () => [...new Set(held.map((r) => r.machineId).filter(Boolean))],
    [held],
  ) as string[];
  const maps = useMachineMaps(machineIds);
  const report = useBrandSlotReport(range.from, range.to);

  const rows: MySlotRow[] = useMemo(() => {
    const mapBySlot = new Map<string, MachineMapSlot>();
    for (const q of maps) for (const s of q.data ?? []) if (s.slotId) mapBySlot.set(s.slotId, s);
    const reportByRental = new Map((report.data ?? []).map((r) => [r.slotRentalId, r]));
    return held.map((rental, i) => ({
      rental,
      invoice: invoices[i]?.data,
      map: mapBySlot.get(rental.slotId),
      report: reportByRental.get(rental.id),
    }));
  }, [held, invoices, maps, report.data]);

  const totalOrders = (report.data ?? []).reduce((sum, r) => sum + r.orderCount, 0);
  const totalRevenue = (report.data ?? []).reduce((sum, r) => sum + Number(r.revenue), 0);

  const sellingTag = (row: MySlotRow) => {
    const { rental, map } = row;
    if (rental.stage === 'AWAITING_STOCK') {
      return <Tag color="cyan">{t('ui.stageAwaitingStock')}</Tag>;
    }
    if (!rental.pricePerSpray || !rental.fragranceProductId) {
      return (
        <Tooltip title={t('ui.mySlotsNotConfiguredHint')}>
          <Tag color="orange">{t('ui.mySlotsNotConfigured')}</Tag>
        </Tooltip>
      );
    }
    return map?.available ? (
      <Tag color="green">{t('ui.mySlotsOnSale')}</Tag>
    ) : (
      <Tag>{t('ui.mySlotsPaused')}</Tag>
    );
  };

  const columns: ColumnsType<MySlotRow> = [
    {
      title: t('ui.mySlotsSlot'),
      key: 'slot',
      render: (_, { invoice, rental }) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {invoice ? `${invoice.machineDisplayName ?? ''} · Slot #${invoice.slotNumber}` : '…'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {invoice?.locationName ?? ''}
            {rental.stage && STAGE_TAGS[rental.stage] && (
              <Tag color={STAGE_TAGS[rental.stage]!.color} style={{ marginLeft: 8 }}>
                {t(STAGE_TAGS[rental.stage]!.label)}
              </Tag>
            )}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.mySlotsProduct'),
      key: 'product',
      render: (_, { map, report: r }) => map?.productName ?? r?.productName ?? '—',
    },
    {
      title: t('ui.pricePerSpray'),
      key: 'price',
      render: (_, { rental }) => formatVnd(rental.pricePerSpray),
    },
    { title: t('ui.mySlotsSelling'), key: 'selling', render: (_, row) => sellingTag(row) },
    {
      title: t('ui.mySlotsRemainingSprays'),
      key: 'remaining',
      render: (_, { map }) => (
        <Space size={4}>
          {map?.estimatedRemainingSprays ?? '—'}
          {map?.lowStock && <Tag color="volcano">{t('ui.mySlotsLowStock')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('ui.mySlotsOrders'),
      key: 'orders',
      render: (_, { report: r }) => r?.orderCount ?? 0,
    },
    {
      title: t('ui.mySlotsRevenue'),
      key: 'revenue',
      render: (_, { report: r }) => formatVnd(r?.revenue ?? '0'),
    },
    {
      title: t('ui.mySlotsRentalEnds'),
      key: 'ends',
      render: (_, { rental }) =>
        rental.stage === 'AWAITING_STOCK'
          ? '—'
          : new Date(rental.endsAt).toLocaleDateString('vi-VN'),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, { rental, map }) => (
        <Space size={0} wrap>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => void navigate(`/rentals/${rental.id}`)}
          >
            {t('ui.mySlotsConfigure')}
          </Button>
          {/* FR-RFQ-03: máy chủ gắn cờ sắp hết, màn hình gợi ý tạo yêu cầu điền sẵn slot. */}
          {map?.lowStock && (
            <Button
              type="link"
              size="small"
              danger
              icon={<InteractionOutlined />}
              onClick={() => void navigate(`/refill-requests?rentalId=${rental.id}`)}
            >
              {t('ui.mySlotsRequestRefill')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <RequireRole allow={['BRAND_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('ui.mySlots')}
          </Typography.Title>
          <Space>
            <Button
              icon={<AppstoreAddOutlined />}
              type="primary"
              onClick={() => void navigate('/rentals/available')}
            >
              {t('ui.rentNewSlot')}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void rentals.refetch();
                void report.refetch();
              }}
            />
          </Space>
        </Row>
        <Typography.Paragraph type="secondary">{t('ui.mySlotsIntro')}</Typography.Paragraph>

        <Space style={{ marginBottom: 16 }}>
          <Typography.Text>{t('ui.mySlotsPeriod')}:</Typography.Text>
          <Segmented<PeriodKey>
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p.value, label: t(p.label) }))}
          />
        </Space>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title={t('ui.mySlotsTotalSlots')} value={held.length} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title={t('ui.mySlotsOrders')}
                value={totalOrders}
                loading={report.isLoading}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title={t('ui.mySlotsRevenue')}
                value={totalRevenue}
                suffix="VND"
                loading={report.isLoading}
              />
            </Card>
          </Col>
        </Row>

        <Card>
          <Table
            rowKey={(row) => row.rental.id}
            loading={rentals.isLoading}
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1100 }}
            locale={{ emptyText: <Empty description={t('ui.mySlotsEmpty')} /> }}
          />
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            showIcon
            message={t('ui.mySlotsRevenueNote')}
          />
        </Card>
      </div>
    </RequireRole>
  );
}

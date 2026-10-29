import {
  AlertOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  LineChartOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Radio,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/shared/auth';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { type TimeSeriesPoint, useOrdersTimeseries, usePlatformDashboard } from './api';

const { RangePicker } = DatePicker;

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const isSuperAdmin = user?.roles.includes('PLATFORM_SUPER_ADMIN') ?? false;
  const isOpsStaff = user?.roles.includes('OPERATIONS_STAFF') ?? false;
  const isPlatformUser = isSuperAdmin || isOpsStaff;

  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([
    dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ]);
  const [granularity, setGranularity] = useState<'DAY' | 'WEEK' | 'MONTH'>('DAY');

  const {
    data: platformData,
    isLoading: loadingPlatform,
    refetch: refetchPlatform,
  } = usePlatformDashboard(
    isPlatformUser ? dateRange[0] : undefined,
    isPlatformUser ? dateRange[1] : undefined,
  );

  const {
    data: timeseriesData,
    isLoading: loadingTimeseries,
    refetch: refetchTimeseries,
  } = useOrdersTimeseries(dateRange[0], dateRange[1], granularity);

  const orders = platformData?.orders;
  const dispense = platformData?.dispense;
  const machineBreakdown = platformData?.machineBreakdown ?? [];

  const onlineMachines = platformData?.machinesByConnectionStatus?.['ONLINE'] ?? 0;
  const offlineMachines = platformData?.machinesByConnectionStatus?.['OFFLINE'] ?? 0;
  const totalMachines = Object.values(platformData?.machinesByConnectionStatus ?? {}).reduce(
    (acc, count) => acc + count,
    0,
  );

  const handleDatePreset = (days: number | 'all') => {
    if (days === 'all') {
      setDateRange([undefined, undefined]);
    } else if (days === 0) {
      const today = dayjs().format('YYYY-MM-DD');
      setDateRange([today, today]);
    } else {
      setDateRange([
        dayjs()
          .subtract(days - 1, 'day')
          .format('YYYY-MM-DD'),
        dayjs().format('YYYY-MM-DD'),
      ]);
    }
  };

  const timeseriesPoints = useMemo(() => timeseriesData ?? [], [timeseriesData]);

  const timeseriesColumns: ColumnsType<TimeSeriesPoint> = [
    {
      title: t('ui.period') ?? 'Thời gian',
      dataIndex: 'bucket',
      key: 'bucket',
      render: (bucket: string) => <strong>{bucket}</strong>,
    },
    {
      title: t('ui.totalOrders') ?? 'Số đơn hàng',
      dataIndex: 'orderCount',
      key: 'orderCount',
      align: 'right',
      render: (count: number) => count.toLocaleString(),
    },
    {
      title: t('ui.totalRevenue') ?? 'Doanh thu (VND)',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      render: (rev: string) => (
        <span style={{ fontWeight: 600, color: '#3f8600' }}>{formatVnd(rev)}</span>
      ),
    },
  ];

  type BreakdownItem = NonNullable<typeof machineBreakdown>[number];

  const breakdownColumns: ColumnsType<BreakdownItem> = [
    {
      title: t('ui.machine') ?? 'Máy Kiosk',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (_: unknown, record) => (
        <div>
          <span style={{ fontWeight: 600 }}>{record.displayName}</span>
          <div style={{ fontSize: 12, color: '#888' }}>
            {record.serialNumber} • {record.locationName}
          </div>
        </div>
      ),
    },
    {
      title: t('ui.connectionStatus') ?? 'Kết nối',
      dataIndex: 'connectionStatus',
      key: 'connectionStatus',
      render: (status: string) =>
        status === 'ONLINE' ? (
          <Tag color="success">ONLINE</Tag>
        ) : (
          <Tag color="default">OFFLINE</Tag>
        ),
    },
    {
      title: t('ui.operatingMode') ?? 'Chế độ',
      dataIndex: 'operatingMode',
      key: 'operatingMode',
      render: (mode: string) => {
        const color = mode === 'NORMAL' ? 'blue' : mode === 'MAINTENANCE' ? 'orange' : 'magenta';
        return <Tag color={color}>{mode}</Tag>;
      },
    },
    {
      title: t('ui.paidOrders') ?? 'Đơn đã thanh toán',
      dataIndex: 'totalPaidOrders',
      key: 'totalPaidOrders',
      align: 'right',
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.totalPaidOrders - b.totalPaidOrders,
    },
    {
      title: (
        <span>
          {t('ui.successDispenses') ?? 'Thành công'}{' '}
          <Tooltip title={t('ui.forfeitedNotice') ?? 'Không tính đơn khách bỏ qua vào lỗi'}>
            <QuestionCircleOutlined />
          </Tooltip>
        </span>
      ),
      dataIndex: 'successCount',
      key: 'successCount',
      align: 'right',
      render: (val: number) => <span style={{ color: '#3f8600' }}>{val.toLocaleString()}</span>,
    },
    {
      title: (
        <span>
          {t('ui.forfeitedOrders') ?? 'Khách bỏ qua'}{' '}
          <Tooltip title={t('ui.forfeitedAlertNotice') ?? 'Cảnh báo nếu tỉ lệ bỏ qua vượt 10%'}>
            <WarningOutlined style={{ color: '#faad14' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'forfeitedCount',
      key: 'forfeitedCount',
      align: 'right',
      render: (val: number, record) => (
        <Space>
          <span>{val.toLocaleString()}</span>
          {record.forfeitedAlert && (
            <Tag color="warning" icon={<AlertOutlined />}>
              &gt;10%
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('ui.techFailures') ?? 'Lỗi kỹ thuật',
      dataIndex: 'failureCount',
      key: 'failureCount',
      align: 'right',
      render: (val: number) => (
        <span style={{ color: val > 0 ? '#cf1322' : '#888' }}>{val.toLocaleString()}</span>
      ),
    },
    {
      title: t('ui.dispenseSuccessRate') ?? 'Tỉ lệ thành công',
      dataIndex: 'successRate',
      key: 'successRate',
      align: 'right',
      render: (rate: number) => {
        const pct = (rate * 100).toFixed(1);
        const color = rate >= 0.95 ? '#3f8600' : rate >= 0.8 ? '#faad14' : '#cf1322';
        return <strong style={{ color }}>{pct}%</strong>;
      },
      sorter: (a, b) => a.successRate - b.successRate,
    },
    {
      title: t('ui.forfeitedRate') ?? 'Tỉ lệ bỏ qua',
      dataIndex: 'forfeitedRate',
      key: 'forfeitedRate',
      align: 'right',
      render: (rate: number, record) => {
        const pct = (rate * 100).toFixed(1);
        return (
          <span
            style={{
              color: record.forfeitedAlert ? '#cf1322' : '#888',
              fontWeight: record.forfeitedAlert ? 600 : 400,
            }}
          >
            {pct}%
          </span>
        );
      },
      sorter: (a, b) => a.forfeitedRate - b.forfeitedRate,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header Bar */}
      <Card size="small">
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {isPlatformUser
                ? (t('ui.platformOverview') ?? 'Tổng quan nền tảng')
                : (t('ui.brandOverview') ?? 'Tổng quan thương hiệu')}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t('ui.dashboardWelcome', { fullName: user?.fullName ?? '' })}
            </Typography.Text>
          </Col>
          <Col>
            <Space wrap>
              <Radio.Group
                defaultValue="30"
                onChange={(e) =>
                  handleDatePreset(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
              >
                <Radio.Button value="0">{t('ui.today') ?? 'Hôm nay'}</Radio.Button>
                <Radio.Button value="7">{t('ui.last7Days') ?? '7 ngày'}</Radio.Button>
                <Radio.Button value="30">{t('ui.last30Days') ?? '30 ngày'}</Radio.Button>
                <Radio.Button value="all">{t('ui.allTime') ?? 'Tất cả'}</Radio.Button>
              </Radio.Group>
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
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void refetchPlatform();
                  void refetchTimeseries();
                }}
                loading={loadingPlatform || loadingTimeseries}
              >
                {t('ui.refresh') ?? 'Làm mới'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Super Admin & Ops Staff KPIs */}
      {isPlatformUser && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title={t('ui.totalRevenue') ?? 'Tổng doanh thu'}
                  value={orders ? formatVnd(orders.revenue) : '-'}
                  prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
                  loading={loadingPlatform}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title={t('ui.totalOrders') ?? 'Tổng số đơn hàng'}
                  value={orders?.total ?? 0}
                  prefix={<ShoppingCartOutlined style={{ color: '#1890ff' }} />}
                  loading={loadingPlatform}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title={
                    <span>
                      {t('ui.dispenseSuccessRate') ?? 'Tỉ lệ xịt thành công'}{' '}
                      <Tooltip
                        title={t('ui.forfeitedNotice') ?? 'Khách bỏ qua không tính là lỗi kỹ thuật'}
                      >
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  value={dispense ? (dispense.successRate * 100).toFixed(1) : 0}
                  suffix="%"
                  styles={{
                    content: {
                      color: (dispense?.successRate ?? 0) >= 0.95 ? '#3f8600' : '#faad14',
                    },
                  }}
                  prefix={<CheckCircleOutlined />}
                  loading={loadingPlatform}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title={t('ui.machineStatusOverview') ?? 'Máy Kiosk Online'}
                  value={totalMachines > 0 ? `${onlineMachines} / ${totalMachines}` : '-'}
                  suffix={
                    offlineMachines > 0 ? (
                      <span style={{ fontSize: 13, color: '#cf1322' }}>
                        ({offlineMachines} offline)
                      </span>
                    ) : undefined
                  }
                  prefix={<ShopOutlined style={{ color: '#722ed1' }} />}
                  loading={loadingPlatform}
                />
              </Card>
            </Col>
          </Row>

          {/* Quick Notice Alert if tickets or warnings exist */}
          {((platformData?.openAlerts ?? 0) > 0 || (platformData?.openTickets ?? 0) > 0) && (
            <Alert
              type="warning"
              showIcon
              icon={<AlertOutlined />}
              title={
                <Space size="large">
                  <span>
                    {t('ui.activeIncidents') ?? 'Sự cố đang mở'}:{' '}
                    <strong>{platformData?.openAlerts ?? 0}</strong>
                  </span>
                  <span>
                    {t('ui.maintenanceTickets') ?? 'Phiếu bảo trì cần xử lý'}:{' '}
                    <strong>{platformData?.openTickets ?? 0}</strong>
                  </span>
                  <Link to="/maintenance-tickets">
                    <Button size="small" type="primary" icon={<ToolOutlined />}>
                      {t('ui.viewMaintenanceTickets') ?? 'Xem phiếu bảo trì'}
                    </Button>
                  </Link>
                </Space>
              }
            />
          )}

          {/* Machine Dispense Outcomes Breakdown (FR-RPT-04 & ADR-0015) */}
          <Card
            title={
              <Space>
                <LineChartOutlined />
                <span>
                  {t('ui.machineOutcomeTable') ??
                    'Tỉ lệ thành công, thất bại và bỏ qua theo từng máy'}
                </span>
              </Space>
            }
          >
            <div style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary">
                {t('ui.forfeitedNotice') ??
                  'Lưu ý: Các đơn hàng khách đã thanh toán nhưng không bấm nút xịt (FORFEITED) được ghi nhận riêng và không tính là lỗi kỹ thuật của máy (ADR-0015).'}
              </Typography.Text>
            </div>
            <Table<BreakdownItem>
              rowKey="machineId"
              columns={breakdownColumns}
              dataSource={machineBreakdown}
              loading={loadingPlatform}
              pagination={{ pageSize: 10, showSizeChanger: true }}
            />
          </Card>
        </>
      )}

      {/* Orders Timeseries Table for both Platform & Brand Admin */}
      <Card
        title={
          <Row justify="space-between" align="middle" style={{ width: '100%' }}>
            <Col>
              <Space>
                <LineChartOutlined />
                <span>
                  {t('ui.revenueTimeseries') ?? 'Diễn biến doanh thu & đơn hàng theo thời gian'}
                </span>
              </Space>
            </Col>
            <Col>
              <Radio.Group
                value={granularity}
                onChange={(e) => setGranularity(e.target.value)}
                size="small"
              >
                <Radio.Button value="DAY">{t('ui.day') ?? 'Ngày'}</Radio.Button>
                <Radio.Button value="WEEK">{t('ui.week') ?? 'Tuần'}</Radio.Button>
                <Radio.Button value="MONTH">{t('ui.month') ?? 'Tháng'}</Radio.Button>
              </Radio.Group>
            </Col>
          </Row>
        }
      >
        <Table<TimeSeriesPoint>
          rowKey="bucket"
          columns={timeseriesColumns}
          dataSource={timeseriesPoints}
          loading={loadingTimeseries}
          pagination={{ pageSize: 15, showSizeChanger: true }}
        />
      </Card>
    </Space>
  );
}

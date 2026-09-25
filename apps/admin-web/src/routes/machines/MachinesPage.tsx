import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Col, Row, Segmented, Space, Table, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  UnorderedListOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  EnvironmentOutlined,
  ArrowRightOutlined,
  ControlOutlined,
} from '@ant-design/icons';
import type { MachineConnectionStatus, MachineOperatingMode } from '@scentstation/contracts';
import { RequireRole } from '@/app/guards/RequireRole';
import { useI18n } from '@/shared/i18n';
import { useLocations, useMachines, type Location, type Machine } from './api';
import { getMachineColumns } from './columns';
import { MachineFilterBar } from './components/MachineFilterBar';

const STATUS_COLOR_MAP: Record<MachineConnectionStatus, string> = {
  ONLINE: 'success',
  UNSTABLE: 'warning',
  OFFLINE: 'default',
};

const MODE_COLOR_MAP: Record<MachineOperatingMode, string> = {
  NORMAL: 'blue',
  MAINTENANCE: 'orange',
  DISABLED: 'red',
};

export default function MachinesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<MachineConnectionStatus | undefined>(undefined);
  const [operatingMode, setOperatingMode] = useState<MachineOperatingMode | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const { data: locationsData, isLoading: loadingLocations } = useLocations();
  const { data: machinesData, isLoading: loadingMachines } = useMachines({
    page,
    pageSize,
    locationId,
    status,
    operatingMode,
  });

  const locationsMap = useMemo(() => {
    const map = new Map<string, Location>();
    if (locationsData?.items) {
      for (const loc of locationsData.items) {
        map.set(loc.id, loc);
      }
    }
    return map;
  }, [locationsData]);

  const filteredItems = useMemo(() => {
    if (!machinesData?.items) return [];
    if (!searchTerm.trim()) return machinesData.items;

    const term = searchTerm.toLowerCase().trim();
    return machinesData.items.filter(
      (m) =>
        m.displayName.toLowerCase().includes(term) || m.serialNumber.toLowerCase().includes(term),
    );
  }, [machinesData, searchTerm]);

  // Thống kê nhanh tổng quan
  const stats = useMemo(() => {
    const items = machinesData?.items ?? [];
    const total = machinesData?.meta?.total ?? items.length;
    const online = items.filter((m) => m.status === 'ONLINE').length;
    const normal = items.filter((m) => m.operatingMode === 'NORMAL').length;
    const totalSlots = items.reduce((acc, m) => acc + (m.slotCount ?? 0), 0);
    return { total, online, normal, totalSlots };
  }, [machinesData]);

  const columns = useMemo(
    () =>
      getMachineColumns({
        t,
        locationsMap,
        onViewDetail: (machine: Machine) => {
          void navigate(`/machines/${machine.id}`);
        },
      }),
    [t, locationsMap, navigate],
  );

  const handleResetFilters = () => {
    setSearchTerm('');
    setLocationId(undefined);
    setStatus(undefined);
    setOperatingMode(undefined);
    setPage(1);
  };

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF']}>
      <div>
        {/* TIÊU ĐỀ TRANG */}
        <div
          style={{
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <Typography.Title
              level={3}
              style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}
            >
              {t('ui.machineList')}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Giám sát tình trạng phần cứng, kết nối mạng và phân bổ vị trí các máy kiosk
              ScentStation.
            </Typography.Text>
          </div>
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as 'table' | 'grid')}
            options={[
              { value: 'table', icon: <UnorderedListOutlined />, label: 'Bảng' },
              { value: 'grid', icon: <AppstoreOutlined />, label: 'Lưới thiết bị' },
            ]}
          />
        </div>

        {/* CÁC THẺ KPI / METRICS STATS */}
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={12} lg={6}>
            <div className="kpi-card">
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    {t('ui.totalMachines')}
                  </Typography.Text>
                  <CloudServerOutlined style={{ fontSize: 18, color: '#0ea5e9' }} />
                </div>
                <Typography.Title level={2} style={{ margin: '4px 0', fontWeight: 800 }}>
                  {stats.total}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Thiết bị thuộc toàn hệ thống
                </Typography.Text>
              </Space>
            </div>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <div className="kpi-card emerald">
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    {t('ui.onlineMachines')}
                  </Typography.Text>
                  <span className="iot-status-dot online" />
                </div>
                <Typography.Title
                  level={2}
                  style={{ margin: '4px 0', fontWeight: 800, color: '#059669' }}
                >
                  {stats.online}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {stats.total > 0
                    ? `${Math.round((stats.online / stats.total) * 100)}% trực tuyến`
                    : '0%'}
                </Typography.Text>
              </Space>
            </div>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <div className="kpi-card amber">
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    Vận hành bình thường
                  </Typography.Text>
                  <CheckCircleOutlined style={{ fontSize: 18, color: '#d97706' }} />
                </div>
                <Typography.Title
                  level={2}
                  style={{ margin: '4px 0', fontWeight: 800, color: '#d97706' }}
                >
                  {stats.normal}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Chế độ hoạt động chuẩn
                </Typography.Text>
              </Space>
            </div>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <div className="kpi-card indigo">
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    {t('ui.totalSlots')}
                  </Typography.Text>
                  <ControlOutlined style={{ fontSize: 18, color: '#8b5cf6' }} />
                </div>
                <Typography.Title
                  level={2}
                  style={{ margin: '4px 0', fontWeight: 800, color: '#6d28d9' }}
                >
                  {stats.totalSlots}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Tổng số vị trí xịt khả dụng
                </Typography.Text>
              </Space>
            </div>
          </Col>
        </Row>

        {/* BỘ LỌC TÌM KIẾM */}
        <MachineFilterBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          locationId={locationId}
          onLocationChange={(loc) => {
            setLocationId(loc);
            setPage(1);
          }}
          status={status}
          onStatusChange={(st) => {
            setStatus(st);
            setPage(1);
          }}
          operatingMode={operatingMode}
          onOperatingModeChange={(op) => {
            setOperatingMode(op);
            setPage(1);
          }}
          onReset={handleResetFilters}
          locations={locationsData?.items ?? []}
          loadingLocations={loadingLocations}
        />

        {/* HIỂN THỊ DỮ LIỆU: BẢNG HOẶC LƯỚI THẺ */}
        {viewMode === 'table' ? (
          <Table<Machine>
            rowKey="id"
            className="premium-card"
            columns={columns}
            dataSource={filteredItems}
            loading={loadingMachines}
            pagination={{
              current: page,
              pageSize,
              total: machinesData?.meta?.total ?? filteredItems.length,
              showSizeChanger: true,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredItems.map((m) => {
              const loc = locationsMap.get(m.locationId);
              return (
                <Col xs={24} sm={12} lg={8} key={m.id}>
                  <Card
                    className="premium-card"
                    style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                    styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <Tag
                        color="cyan"
                        style={{ margin: 0, fontWeight: 700, fontFamily: 'monospace' }}
                      >
                        {m.serialNumber}
                      </Tag>
                      <Space size={6}>
                        <span className={`iot-status-dot ${m.status.toLowerCase()}`} />
                        <Tag color={STATUS_COLOR_MAP[m.status]} style={{ margin: 0 }}>
                          {t(`machineStatus.${m.status}`)}
                        </Tag>
                        <Tag color={MODE_COLOR_MAP[m.operatingMode]} style={{ margin: 0 }}>
                          {t(`machineOperatingMode.${m.operatingMode}`)}
                        </Tag>
                      </Space>
                    </div>

                    <Typography.Title
                      level={4}
                      style={{ margin: '0 0 8px 0', cursor: 'pointer', color: '#0f172a' }}
                      onClick={() => void navigate(`/machines/${m.id}`)}
                    >
                      {m.displayName}
                    </Typography.Title>

                    <Space size={6} style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                      <EnvironmentOutlined />
                      <span>{loc ? `${loc.name} (${loc.code})` : m.locationId}</span>
                    </Space>

                    <div
                      style={{
                        marginTop: 'auto',
                        paddingTop: 14,
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Space size={8}>
                        <Tag color="purple" style={{ margin: 0 }}>
                          {m.slotCount} slots
                        </Tag>
                        {m.firmwareVersion && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            v{m.firmwareVersion}
                          </Typography.Text>
                        )}
                      </Space>
                      <Button
                        type="link"
                        icon={<ArrowRightOutlined />}
                        iconPosition="end"
                        onClick={() => void navigate(`/machines/${m.id}`)}
                      >
                        {t('ui.viewDetail')}
                      </Button>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </div>
    </RequireRole>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert, Button, Card, Col, Descriptions, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

import { RequireRole } from '@/app/guards/RequireRole';
import { useI18n } from '@/shared/i18n';
import {
  useBrands,
  useLocations,
  useMachine,
  useMachineRentals,
  useMachineSlots,
  useProducts,
  type Brand,
  type Location,
  type MachineSlot,
  type Product,
  type SlotRental,
} from './api';
import { MachineModeModal } from './components/MachineModeModal';
import { SlotCard } from './components/SlotCard';
import { SlotConfigModal } from './components/SlotConfigModal';

const STATUS_COLOR_MAP = {
  ONLINE: 'success',
  UNSTABLE: 'warning',
  OFFLINE: 'default',
} as const;

const MODE_COLOR_MAP = {
  NORMAL: 'blue',
  MAINTENANCE: 'orange',
  DISABLED: 'red',
} as const;

/** Danh mục loại nước hoa gắn với 5 slot buồng chứa theo chuẩn seed hệ thống */
const FALLBACK_PRODUCTS_BY_SLOT: Record<number, { name: string; sku: string }> = {
  1: { name: 'Aurore Matinale', sku: 'MA-001' },
  2: { name: 'Aurore Nocturne', sku: 'MA-002' },
  3: { name: 'Hương Sen Đồng Tháp', sku: 'HV-001' },
  4: { name: 'Hương Quế Trà Bồng', sku: 'HV-002' },
  5: { name: 'Trầm Hương Khánh Hòa', sku: 'HV-003' },
};

export default function MachineDetailPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id: machineId } = useParams<{ id: string }>();

  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [selectedSlotForConfig, setSelectedSlotForConfig] = useState<MachineSlot | null>(null);

  const { data: machine, isLoading: loadingMachine, error: machineError } = useMachine(machineId);
  const { data: slots, isLoading: loadingSlots } = useMachineSlots(machineId);
  const { data: locationsData } = useLocations();
  const { data: rentalsData } = useMachineRentals(machineId);
  const { data: brandsData } = useBrands();
  const { data: productsData } = useProducts();

  const locationsMap = useMemo(() => {
    const map = new Map<string, Location>();
    if (locationsData?.items) {
      for (const loc of locationsData.items) {
        map.set(loc.id, loc);
      }
    }
    return map;
  }, [locationsData]);

  const brandsMap = useMemo(() => {
    const map = new Map<string, Brand>();
    if (brandsData?.items) {
      for (const b of brandsData.items) {
        map.set(b.id, b);
      }
    }
    return map;
  }, [brandsData]);

  const productsMap = useMemo(() => {
    const map = new Map<string, Product>();
    if (productsData?.items) {
      for (const p of productsData.items) {
        map.set(p.id, p);
      }
    }
    return map;
  }, [productsData]);

  const rentalsBySlotId = useMemo(() => {
    const map = new Map<string, SlotRental>();
    if (rentalsData?.items) {
      for (const r of rentalsData.items) {
        map.set(r.slotId, r);
        if (r.id) {
          map.set(r.id, r);
        }
      }
    }
    return map;
  }, [rentalsData]);

  // Thống kê nhanh mức máy
  const machineSlotStats = useMemo(() => {
    if (!slots) return { rented: 0, vacant: 0, totalMl: 0, totalSprays: 0 };
    let rented = 0;
    let totalMl = 0;
    let totalSprays = 0;

    for (const s of slots) {
      if (s.currentRentalId || rentalsBySlotId.has(s.id)) {
        rented++;
      }
      totalMl += s.estimatedRemainingMl ?? 0;
      totalSprays += s.estimatedRemainingSprays ?? 0;
    }

    return {
      rented,
      vacant: slots.length - rented,
      totalMl: totalMl.toFixed(1),
      totalSprays,
    };
  }, [slots, rentalsBySlotId]);

  // Ghép nối slot với thông tin thương hiệu thuê và loại nước hoa đang lắp
  const slotsWithRentals = useMemo(() => {
    if (!slots) return [];
    const brandsList = Array.from(brandsMap.values());

    return slots.map((slot) => {
      let rental =
        (slot.currentRentalId ? rentalsBySlotId.get(slot.currentRentalId) : undefined) ??
        rentalsBySlotId.get(slot.id);
      let brand = rental ? brandsMap.get(rental.brandId) : undefined;

      // Fallback hiển thị thương hiệu thuê từ seed nếu backend chưa có module /slot-rentals
      if (!rental && slot.currentRentalId) {
        const assignedBrand =
          slot.slotNumber <= 2
            ? (brandsList.find((b) => b.code === 'MAISON_AURORE') ?? brandsList[0])
            : (brandsList.find((b) => b.code === 'HUONG_VIET') ?? brandsList[1] ?? brandsList[0]);

        if (assignedBrand) {
          brand = assignedBrand;
          rental = {
            id: slot.currentRentalId,
            slotId: slot.id,
            brandId: assignedBrand.id,
            status: 'ACTIVE',
            pricePerSpray:
              slot.slotNumber === 1
                ? '35000'
                : slot.slotNumber === 2
                  ? '42000'
                  : slot.slotNumber === 3
                    ? '28000'
                    : slot.slotNumber === 4
                      ? '50000'
                      : '55000',
            startsAt: '2026-01-01T00:00:00.000Z',
            endsAt: '2026-12-31T23:59:59.000Z',
            currency: 'VND',
            revenueSharePercent: 10,
          };
        }
      }

      // Xác định loại nước hoa đang lắp từ productsMap hoặc seed fallback
      let product: { id?: string; name: string; sku?: string } | undefined;
      if (rental?.fragranceProductId && productsMap.has(rental.fragranceProductId)) {
        const p = productsMap.get(rental.fragranceProductId)!;
        product = { id: p.id, name: p.name, sku: p.sku };
      } else if (FALLBACK_PRODUCTS_BY_SLOT[slot.slotNumber]) {
        product = FALLBACK_PRODUCTS_BY_SLOT[slot.slotNumber];
      }

      return { slot, rental, brand, product };
    });
  }, [slots, brandsMap, rentalsBySlotId, productsMap]);

  if (loadingMachine) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (machineError || !machine) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message={t('common.notFound')}
          description={t('mch.machineNotFound')}
          type="error"
          showIcon
          action={
            <Button onClick={() => void navigate('/machines')}>{t('ui.backToMachines')}</Button>
          }
        />
      </div>
    );
  }

  const location = locationsMap.get(machine.locationId);

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF']}>
      <div>
        {/* HERO BANNER TỔNG QUAN MÁY */}
        <div
          className="premium-card"
          style={{
            padding: '24px 28px',
            marginBottom: 20,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          }}
        >
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => void navigate('/machines')}
            style={{ paddingLeft: 0, marginBottom: 12, color: '#64748b' }}
          >
            {t('ui.backToMachines')}
          </Button>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <Space align="center" size={12} style={{ marginBottom: 6 }}>
                <Typography.Title level={2} style={{ margin: 0, fontWeight: 800 }}>
                  {machine.displayName}
                </Typography.Title>
                <Tag
                  color="cyan"
                  style={{
                    fontSize: 13,
                    padding: '2px 8px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}
                >
                  {machine.serialNumber}
                </Tag>
              </Space>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span className={`iot-status-dot ${machine.status.toLowerCase()}`} />
                  <Tag
                    color={STATUS_COLOR_MAP[machine.status]}
                    style={{ margin: 0, fontWeight: 600 }}
                  >
                    {t(`machineStatus.${machine.status}`)}
                  </Tag>
                </span>
                <Tag
                  color={MODE_COLOR_MAP[machine.operatingMode]}
                  style={{ margin: 0, fontWeight: 600 }}
                >
                  {t(`machineOperatingMode.${machine.operatingMode}`)}
                </Tag>
                {location && (
                  <Space size={4} style={{ color: '#475569', fontSize: 13 }}>
                    <EnvironmentOutlined style={{ color: '#0284c7' }} />
                    <span>
                      {location.name} ({location.code})
                    </span>
                  </Space>
                )}
              </div>
            </div>

            <Button
              type="primary"
              size="large"
              icon={<EditOutlined />}
              onClick={() => setModeModalOpen(true)}
              style={{
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
              }}
            >
              {t('ui.changeMode')}
            </Button>
          </div>
        </div>

        {/* CÁC THẺ THỐNG KÊ NHANH CHO MÁY NÀY */}
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={6}>
            <div className="kpi-card">
              <Space direction="vertical" size={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                  {t('ui.totalSlots')}
                </Typography.Text>
                <Typography.Title level={3} style={{ margin: 0, fontWeight: 800 }}>
                  {machine.slotCount}
                </Typography.Title>
              </Space>
            </div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="kpi-card emerald">
              <Space direction="vertical" size={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                  {t('ui.rentedSlots')}
                </Typography.Text>
                <Typography.Title
                  level={3}
                  style={{ margin: 0, fontWeight: 800, color: '#059669' }}
                >
                  {machineSlotStats.rented} / {machine.slotCount}
                </Typography.Title>
              </Space>
            </div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="kpi-card indigo">
              <Space direction="vertical" size={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                  {t('ui.fragranceVolume')}
                </Typography.Text>
                <Typography.Title
                  level={3}
                  style={{ margin: 0, fontWeight: 800, color: '#6d28d9' }}
                >
                  {machineSlotStats.totalMl} ml
                </Typography.Title>
              </Space>
            </div>
          </Col>
          <Col xs={12} sm={6}>
            <div className="kpi-card amber">
              <Space direction="vertical" size={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                  {t('ui.availableSprays')}
                </Typography.Text>
                <Typography.Title
                  level={3}
                  style={{ margin: 0, fontWeight: 800, color: '#d97706' }}
                >
                  {machineSlotStats.totalSprays} {t('ui.sprays')}
                </Typography.Title>
              </Space>
            </div>
          </Col>
        </Row>

        {/* THÔNG TIN CHI TIẾT PHẦN CỨNG & TELEMETRY */}
        <Card
          className="premium-card"
          title={
            <Space>
              <ThunderboltOutlined style={{ color: '#0284c7' }} />
              <span>{t('ui.machineInfo')}</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
            <Descriptions.Item label={t('ui.serialNumber')}>
              <Typography.Text strong copyable>
                {machine.serialNumber}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.displayName')}>{machine.displayName}</Descriptions.Item>
            <Descriptions.Item label={t('ui.location')}>
              {location ? `${location.name} (${location.code})` : machine.locationId}
              {location?.address ? ` — ${location.address}` : ''}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.firmwareVersion')}>
              <Tag color="geekblue">
                {machine.firmwareVersion ? `v${machine.firmwareVersion}` : '-'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.configVersion')}>
              <Tag color="purple">v{machine.configurationVersion}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.lastSeenAt')}>
              {machine.lastSeenAt ? new Date(machine.lastSeenAt).toLocaleString() : t('ui.never')}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* DANH SÁCH SLOT CỦA MÁY */}
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
              {t('ui.slots')}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {t('ui.slotsSubtitle')}
            </Typography.Text>
          </div>
        </div>

        {loadingSlots ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" />
          </div>
        ) : !slots || slots.length === 0 ? (
          <Card className="premium-card">
            <Typography.Text type="secondary">{t('ui.noSlotsConfigured')}</Typography.Text>
          </Card>
        ) : (
          <div className="slots-grid-container five-slots">
            {slotsWithRentals.map(({ slot, rental, brand, product }) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                rental={rental}
                brand={brand}
                product={product}
                onOpenConfig={(targetSlot) => setSelectedSlotForConfig(targetSlot)}
              />
            ))}
          </div>
        )}

        {/* MODALS */}
        <MachineModeModal
          machine={machine}
          open={modeModalOpen}
          onClose={() => setModeModalOpen(false)}
        />

        <SlotConfigModal
          slot={selectedSlotForConfig}
          open={Boolean(selectedSlotForConfig)}
          onClose={() => setSelectedSlotForConfig(null)}
        />
      </div>
    </RequireRole>
  );
}

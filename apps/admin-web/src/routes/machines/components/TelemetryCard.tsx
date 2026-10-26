import { DashboardOutlined } from '@ant-design/icons';
import { Card, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type DeviceEvent,
  type MachineSlot,
  type SensorReading,
  useDeviceEvents,
  useSensorReadings,
} from '../api';

/** Loại số đo backend ghi từ bản tin telemetry (`iot.service.ts`, spec/contracts/mqtt.md). */
const READING_TYPES = [
  'LOAD_CELL_G',
  'ESTIMATED_REMAINING_ML',
  'ACTUATOR_STATUS',
  'DOOR_OPEN',
  'POWER_STATUS',
] as const;

/** Sự kiện cần người vận hành chú ý. */
const ERROR_EVENTS = new Set(['SENSOR_ERROR', 'DISPENSE_ERROR']);

/**
 * Telemetry và sự kiện thiết bị của máy (FR-IOT-04, 05, FR-MNT-08) — dữ liệu chẩn đoán cho Operations
 * Staff. Giá trị hiển thị nguyên văn máy chủ trả về (FE5).
 */
export function TelemetryCard({
  machineId,
  slots,
}: {
  machineId: string;
  slots: readonly MachineSlot[];
}) {
  const { t } = useI18n();
  const slotNumber = new Map(slots.map((s) => [s.id, s.slotNumber]));

  return (
    <Card
      className="premium-card"
      style={{ marginTop: 24 }}
      title={
        <Space>
          <DashboardOutlined style={{ color: '#0284c7' }} />
          <span>{t('ui.telemetryTitle')}</span>
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'readings',
            label: t('ui.telemetryReadings'),
            children: <ReadingsTab machineId={machineId} slotNumber={slotNumber} slots={slots} />,
          },
          {
            key: 'events',
            label: t('ui.telemetryEvents'),
            children: <EventsTab machineId={machineId} />,
          },
        ]}
      />
    </Card>
  );
}

function ReadingsTab({
  machineId,
  slots,
  slotNumber,
}: {
  machineId: string;
  slots: readonly MachineSlot[];
  slotNumber: ReadonlyMap<string, number>;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [slotId, setSlotId] = useState<string | undefined>();
  const [readingType, setReadingType] = useState<string | undefined>();
  const { data, isLoading } = useSensorReadings(machineId, {
    page,
    ...(slotId ? { slotId } : {}),
    ...(readingType ? { readingType } : {}),
  });

  const columns: ColumnsType<SensorReading> = [
    { title: t('ui.telemetryAt'), key: 'at', render: (_, r) => formatDateTime(r.measuredAt) },
    {
      title: t('ui.mySlotsSlot'),
      key: 'slot',
      render: (_, r) =>
        r.slotId ? `#${slotNumber.get(r.slotId) ?? '?'}` : t('ui.telemetryMachine'),
    },
    { title: t('ui.telemetryType'), dataIndex: 'readingType', key: 'type' },
    {
      title: t('ui.telemetryValue'),
      key: 'value',
      render: (_, r) =>
        r.numericValue === null || r.numericValue === undefined
          ? '—'
          : `${r.numericValue}${r.unit ? ` ${r.unit}` : ''}`,
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select<string>
          style={{ width: 160 }}
          value={slotId ?? 'ALL'}
          onChange={(v) => {
            setSlotId(v === 'ALL' ? undefined : v);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: t('ui.telemetryAllSlots') },
            ...slots.map((s) => ({ value: s.id, label: `Slot #${s.slotNumber}` })),
          ]}
        />
        <Select<string>
          style={{ width: 240 }}
          value={readingType ?? 'ALL'}
          onChange={(v) => {
            setReadingType(v === 'ALL' ? undefined : v);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: t('ui.telemetryAllTypes') },
            ...READING_TYPES.map((type) => ({ value: type, label: type })),
          ]}
        />
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        locale={{ emptyText: t('ui.telemetryEmpty') }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.meta.total ?? 0,
          onChange: setPage,
        }}
      />
    </>
  );
}

function EventsTab({ machineId }: { machineId: string }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDeviceEvents(machineId, page);

  const columns: ColumnsType<DeviceEvent> = [
    { title: t('ui.telemetryAt'), key: 'at', render: (_, e) => formatDateTime(e.occurredAt) },
    {
      title: t('ui.telemetryType'),
      key: 'type',
      render: (_, e) => (
        <Tag color={ERROR_EVENTS.has(e.eventType) ? 'red' : 'blue'}>{e.eventType}</Tag>
      ),
    },
    {
      title: t('ui.telemetryPayload'),
      key: 'payload',
      render: (_, e) =>
        e.payload && Object.keys(e.payload).length > 0 ? (
          <Typography.Text code style={{ fontSize: 12 }}>
            {JSON.stringify(e.payload)}
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: t('ui.telemetryReceivedAt'),
      key: 'received',
      render: (_, e) => formatDateTime(e.receivedAt),
    },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      loading={isLoading}
      columns={columns}
      dataSource={data?.items ?? []}
      locale={{ emptyText: t('ui.telemetryEventsEmpty') }}
      pagination={{ current: page, pageSize: 20, total: data?.meta.total ?? 0, onChange: setPage }}
    />
  );
}

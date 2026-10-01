import { Button, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MachineConnectionStatus, MachineOperatingMode } from '@scentstation/contracts';
import type { MessageKey, MessageParams } from '@scentstation/i18n';
import type { Location, Machine } from './api';

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

export function getMachineColumns({
  t,
  locationsMap,
  onViewDetail,
}: {
  t: (key: MessageKey, params?: MessageParams) => string;
  locationsMap: ReadonlyMap<string, Location>;
  onViewDetail: (machine: Machine) => void;
}): ColumnsType<Machine> {
  return [
    {
      title: t('ui.serialNumber'),
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      render: (val: string) => <Typography.Text strong>{val}</Typography.Text>,
    },
    {
      title: t('ui.displayName'),
      dataIndex: 'displayName',
      key: 'displayName',
    },
    {
      title: t('ui.location'),
      dataIndex: 'locationId',
      key: 'locationId',
      render: (locId: string) => {
        const loc = locationsMap.get(locId);
        return loc ? `${loc.name} (${loc.code})` : locId;
      },
    },
    {
      title: t('ui.slotCount'),
      dataIndex: 'slotCount',
      key: 'slotCount',
      align: 'center',
    },
    {
      title: t('ui.connectionStatus'),
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      render: (status: MachineConnectionStatus) => (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span className={`iot-status-dot ${status.toLowerCase()}`} />
          <Tag color={STATUS_COLOR_MAP[status]} style={{ margin: 0, fontWeight: 500 }}>
            {t(`machineStatus.${status}`)}
          </Tag>
        </span>
      ),
    },

    {
      title: t('ui.operatingMode'),
      dataIndex: 'operatingMode',
      key: 'operatingMode',
      align: 'center',
      render: (mode: MachineOperatingMode) => (
        <Tag color={MODE_COLOR_MAP[mode]}>{t(`machineOperatingMode.${mode}`)}</Tag>
      ),
    },
    {
      title: t('ui.lastSeenAt'),
      dataIndex: 'lastSeenAt',
      key: 'lastSeenAt',
      render: (val: string | null) =>
        val ? (
          new Date(val).toLocaleString()
        ) : (
          <Typography.Text type="secondary">{t('ui.never')}</Typography.Text>
        ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      align: 'center',
      render: (_, record) => (
        <Space orientation="horizontal" size="small">
          <Button type="primary" size="small" onClick={() => onViewDetail(record)}>
            {t('ui.viewDetail')}
          </Button>
        </Space>
      ),
    },
  ];
}

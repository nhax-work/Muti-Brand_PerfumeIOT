import { Button, Card, Col, Input, Row, Select } from 'antd';
import type { MachineConnectionStatus, MachineOperatingMode } from '@scentstation/contracts';
import { useI18n } from '@/shared/i18n';
import type { Location } from '../api';

interface MachineFilterBarProps {
  readonly searchTerm: string;
  readonly onSearchChange: (value: string) => void;
  readonly locationId: string | undefined;
  readonly onLocationChange: (value: string | undefined) => void;
  readonly status: MachineConnectionStatus | undefined;
  readonly onStatusChange: (value: MachineConnectionStatus | undefined) => void;
  readonly operatingMode: MachineOperatingMode | undefined;
  readonly onOperatingModeChange: (value: MachineOperatingMode | undefined) => void;
  readonly onReset: () => void;
  readonly locations: readonly Location[];
  readonly loadingLocations: boolean;
}

export function MachineFilterBar({
  searchTerm,
  onSearchChange,
  locationId,
  onLocationChange,
  status,
  onStatusChange,
  operatingMode,
  onOperatingModeChange,
  onReset,
  locations,
  loadingLocations,
}: MachineFilterBarProps) {
  const { t } = useI18n();

  const locationOptions = [
    { value: '', label: t('ui.allLocations') },
    ...locations.map((loc) => ({ value: loc.id, label: `${loc.name} (${loc.code})` })),
  ];

  const statusOptions = [
    { value: '', label: t('ui.allStatuses') },
    { value: 'ONLINE', label: t('machineStatus.ONLINE') },
    { value: 'UNSTABLE', label: t('machineStatus.UNSTABLE') },
    { value: 'OFFLINE', label: t('machineStatus.OFFLINE') },
  ];

  const modeOptions = [
    { value: '', label: t('ui.allModes') },
    { value: 'NORMAL', label: t('machineOperatingMode.NORMAL') },
    { value: 'MAINTENANCE', label: t('machineOperatingMode.MAINTENANCE') },
    { value: 'DISABLED', label: t('machineOperatingMode.DISABLED') },
  ];

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 12]} align="middle">
        <Col xs={24} sm={12} md={6}>
          <Input.Search
            placeholder={t('ui.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Select
            style={{ width: '100%' }}
            placeholder={t('ui.location')}
            value={locationId ?? ''}
            onChange={(val) => onLocationChange(val || undefined)}
            options={locationOptions}
            loading={loadingLocations}
          />
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Select
            style={{ width: '100%' }}
            placeholder={t('ui.connectionStatus')}
            value={status ?? ''}
            onChange={(val) => onStatusChange((val as MachineConnectionStatus) || undefined)}
            options={statusOptions}
          />
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Select
            style={{ width: '100%' }}
            placeholder={t('ui.operatingMode')}
            value={operatingMode ?? ''}
            onChange={(val) => onOperatingModeChange((val as MachineOperatingMode) || undefined)}
            options={modeOptions}
          />
        </Col>
        <Col xs={24} sm={8} md={2} style={{ textAlign: 'right' }}>
          <Button onClick={onReset}>{t('ui.reset')}</Button>
        </Col>
      </Row>
    </Card>
  );
}

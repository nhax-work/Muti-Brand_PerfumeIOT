import {
  CheckOutlined,
  DownOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import type { AvailableSlot } from './api';
import type { RentMachine } from './rentMachines';

interface Props {
  readonly machine: RentMachine;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly selectedSlotIds: ReadonlySet<string>;
  readonly onToggleSlot: (slot: AvailableSlot) => void;
  /** Phần chọn gói cho các slot đã chọn trên máy này, hiện dưới dãy ô. */
  readonly children?: ReactNode;
}

/**
 * Thẻ một máy: đầu thẻ tóm tắt số ô trống, bấm để mở mặt trước máy với dãy ô slot nằm ngang. Ô không
 * có trong danh sách trống chỉ hiện "Không khả dụng" — không tên, sản phẩm, giá hay tooltip (BR-012).
 */
export function RentMachineCard({
  machine,
  expanded,
  onToggleExpanded,
  selectedSlotIds,
  onToggleSlot,
  children,
}: Props) {
  const { t } = useI18n();
  const bays = Array.from({ length: machine.bayCount }, (_, i) => i + 1);
  const freeCount = machine.freeSlots.size;
  const selectedHere = [...machine.freeSlots.values()].filter((s) =>
    selectedSlotIds.has(s.slotId),
  ).length;
  const minPrice = Math.min(
    ...[...machine.freeSlots.values()].map((s) => Number(s.monthlyRentPrice)),
  );
  const bodyId = `rent-machine-${machine.machineId}`;

  const bayState = (n: number) => {
    const slot = machine.freeSlots.get(n);
    if (!slot) return { slot, state: 'unavailable' as const };
    return {
      slot,
      state: selectedSlotIds.has(slot.slotId) ? ('selected' as const) : ('free' as const),
    };
  };

  return (
    <section className={`rent-machine${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="rent-machine-head"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggleExpanded}
      >
        <span className="rent-machine-icon" aria-hidden>
          <ExperimentOutlined />
        </span>
        <span className="rent-machine-info">
          <Typography.Text strong className="rent-machine-name">
            {machine.machineName}
          </Typography.Text>
          <Typography.Text type="secondary" className="rent-machine-location">
            <EnvironmentOutlined /> {machine.locationName}
          </Typography.Text>
          <span className="rent-machine-strip" aria-hidden>
            {bays.map((n) => (
              <span key={n} className={`rent-machine-strip-cell is-${bayState(n).state}`} />
            ))}
          </span>
        </span>
        <span className="rent-machine-summary">
          <Tag color="green">
            {t('ui.rentFreeOfTotal', { free: freeCount, total: machine.bayCount })}
          </Tag>
          <Typography.Text type="secondary" className="rent-machine-price">
            {t('ui.rentPriceFrom', { price: formatVnd(String(minPrice)) })}
          </Typography.Text>
          {selectedHere > 0 && (
            <Tag color="blue">{t('ui.rentSelectedOnMachine', { count: selectedHere })}</Tag>
          )}
        </span>
        <DownOutlined className="rent-machine-chevron" aria-hidden />
      </button>

      {expanded && (
        <div id={bodyId} className="rent-machine-body">
          <div className="rent-machine-front">
            <div className="rent-machine-brandbar" aria-hidden>
              <span>ScentStation</span>
            </div>
            <div
              className="rent-machine-bays"
              // Số cột = số ô của máy, để mọi ô cùng bề rộng như mặt trước máy thật.
              style={{ '--bays': machine.bayCount } as CSSProperties}
            >
              {bays.map((n) => {
                const { slot, state } = bayState(n);
                const label = t('ui.slotNumber', { slotNumber: n });
                if (state === 'unavailable' || !slot) {
                  return (
                    <div key={n} className="rent-bay is-unavailable" aria-disabled>
                      <span className="rent-bay-number">{label}</span>
                      <span className="rent-bay-window" aria-hidden>
                        <LockOutlined />
                      </span>
                      <span className="rent-bay-status">{t('ui.rentSlotUnavailable')}</span>
                      <span className="rent-bay-light" aria-hidden />
                    </div>
                  );
                }
                const selected = state === 'selected';
                return (
                  <button
                    key={n}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={`${label} — ${selected ? t('ui.rentSlotSelected') : t('ui.rentSlotFree')}`}
                    className={`rent-bay is-${state}`}
                    onClick={() => onToggleSlot(slot)}
                  >
                    <span className="rent-bay-number">{label}</span>
                    <span className="rent-bay-window" aria-hidden>
                      {selected ? <CheckOutlined /> : <ExperimentOutlined />}
                    </span>
                    <span className="rent-bay-status">
                      {selected ? t('ui.rentSlotSelected') : t('ui.rentSlotFree')}
                    </span>
                    <span className="rent-bay-price">
                      {t('ui.pricePerMonth', { price: formatVnd(slot.monthlyRentPrice) })}
                    </span>
                    <span className="rent-bay-light" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rent-legend">
            <span>
              <span className="rent-legend-dot is-free" aria-hidden />
              {t('ui.rentSlotFree')}
            </span>
            <span>
              <span className="rent-legend-dot is-selected" aria-hidden />
              {t('ui.rentSlotSelected')}
            </span>
            <span>
              <span className="rent-legend-dot is-unavailable" aria-hidden />
              {t('ui.rentSlotUnavailable')}
            </span>
            <Typography.Text type="secondary" className="rent-legend-hint">
              {t('ui.rentPickHint')}
            </Typography.Text>
          </div>

          {children}
        </div>
      )}
    </section>
  );
}

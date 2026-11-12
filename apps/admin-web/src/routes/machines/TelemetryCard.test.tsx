import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import { TelemetryCard } from './components/TelemetryCard';

const readingsQuery = vi.fn();
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useSensorReadings: (machineId: string, params: unknown) => {
    readingsQuery(machineId, params);
    return {
      isLoading: false,
      data: {
        items: [
          {
            id: 'r-1',
            machineId: 'm-1',
            slotId: 's-1',
            readingType: 'ESTIMATED_REMAINING_ML',
            numericValue: 48.2,
            unit: 'ml',
            measuredAt: '2026-10-26T03:00:00Z',
          },
          {
            id: 'r-2',
            machineId: 'm-1',
            slotId: null,
            readingType: 'DOOR_OPEN',
            numericValue: 0,
            unit: null,
            measuredAt: '2026-10-26T03:00:00Z',
          },
        ],
        meta: { page: 1, pageSize: 20, total: 2 },
      },
    };
  },
  useDeviceEvents: () => ({
    isLoading: false,
    data: {
      items: [
        {
          id: 'e-1',
          machineId: 'm-1',
          deviceEventId: 'EVT-1',
          eventType: 'SENSOR_ERROR',
          payload: { sensor: 'door_switch' },
          occurredAt: '2026-10-26T02:00:00Z',
          receivedAt: '2026-10-26T02:00:01Z',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    },
  }),
}));

const SLOTS = [{ id: 's-1', slotNumber: 1 }] as never[];

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  readingsQuery.mockClear();
});

describe('TelemetryCard (FR-IOT-04, 05)', () => {
  it('test_FR_IOT_04_list_sensor_readings — số đo hiện slot, loại, giá trị kèm đơn vị; số đo mức máy ghi "Cả máy"', () => {
    renderScreen(<TelemetryCard machineId="m-1" slots={SLOTS} />);
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('48.2 ml')).toBeTruthy();
    expect(screen.getByText('Cả máy')).toBeTruthy();
    expect(readingsQuery).toHaveBeenCalledWith('m-1', { page: 1 });
  });

  it('test_FR_IOT_05_list_device_events — sự kiện lỗi hiện kèm chi tiết payload', () => {
    renderScreen(<TelemetryCard machineId="m-1" slots={SLOTS} />);
    fireEvent.click(screen.getByText('Sự kiện thiết bị'));
    expect(screen.getByText('SENSOR_ERROR')).toBeTruthy();
    expect(screen.getByText('{"sensor":"door_switch"}')).toBeTruthy();
  });
});

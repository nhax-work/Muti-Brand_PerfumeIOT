import { describe, expect, it } from 'vitest';
import {
  EventMessage,
  HeartbeatMessage,
  TelemetryMessage,
} from '../../apps/api/src/modules/iot/iot.messages.js';

const common = { schema_version: 1, machine_serial: 'M001', ts: '2026-10-09T10:00:00Z' };
describe('MQTT device payload validation', () => {
  it('rejects invalid schema, timestamps and operating modes', () => {
    const heartbeat = {
      ...common,
      firmware_version: '1.0',
      configuration_version: 1,
      operating_mode: 'NORMAL',
    };
    expect(HeartbeatMessage.safeParse(heartbeat).success).toBe(true);
    for (const fields of [
      { schema_version: 2 },
      { ts: 'not-a-date' },
      { operating_mode: 'OTHER' },
    ]) {
      expect(HeartbeatMessage.safeParse({ ...heartbeat, ...fields }).success).toBe(false);
    }
  });
  it('rejects duplicate slots and invalid actuator status', () => {
    const slot = { slot_number: 1, actuator_status: 'IDLE' };
    const telemetry = { ...common, door_open: false, power_status: 'AC', slots: [slot] };
    expect(TelemetryMessage.safeParse(telemetry).success).toBe(true);
    expect(TelemetryMessage.safeParse({ ...telemetry, slots: [slot, slot] }).success).toBe(false);
    expect(
      TelemetryMessage.safeParse({ ...telemetry, slots: [{ ...slot, actuator_status: 'UNKNOWN' }] })
        .success,
    ).toBe(false);
  });
  it('requires a stable event identifier and a supported event type', () => {
    expect(
      EventMessage.safeParse({ ...common, device_event_id: 'M001-1-1', event_type: 'BOOT' })
        .success,
    ).toBe(true);
    expect(EventMessage.safeParse({ ...common, event_type: 'BOOT' }).success).toBe(false);
    expect(
      EventMessage.safeParse({ ...common, device_event_id: 'M001-1-1', event_type: 'BUTTON_WRONG' })
        .success,
    ).toBe(false);
  });
});

import { z } from 'zod';

const Common = z.object({
  schema_version: z.literal(1),
  machine_serial: z.string().min(1).max(100),
  ts: z.string().datetime({ offset: true }),
});

export const HeartbeatMessage = Common.extend({
  firmware_version: z.string().min(1).max(100),
  configuration_version: z.number().int().nonnegative(),
  operating_mode: z.enum(['NORMAL', 'MAINTENANCE', 'DISABLED']),
  uptime_sec: z.number().int().nonnegative().optional(),
});

export const TelemetryMessage = Common.extend({
  door_open: z.boolean(),
  power_status: z.enum(['AC', 'BATTERY', 'LOW_BATTERY']),
  slots: z
    .array(
      z.object({
        slot_number: z.number().int().positive(),
        actuator_status: z.enum(['IDLE', 'RUNNING', 'FAULT']),
        estimated_remaining_ml: z.number().finite().nonnegative().optional(),
      }),
    )
    .max(100)
    .refine(
      (slots) => new Set(slots.map((s) => s.slot_number)).size === slots.length,
      'Duplicate slot numbers',
    ),
});

export const EventMessage = Common.extend({
  device_event_id: z.string().min(1).max(150),
  event_type: z.enum([
    'BOOT',
    'SHUTDOWN',
    'RECONNECTED',
    'MODE_CHANGED',
    'SENSOR_ERROR',
    'DISPENSE_ERROR',
    'DOOR_OPENED',
    'DOOR_CLOSED',
  ]),
  payload: z.record(z.unknown()).optional(),
});

export type Heartbeat = z.infer<typeof HeartbeatMessage>;
export type Telemetry = z.infer<typeof TelemetryMessage>;
export type DeviceEvent = z.infer<typeof EventMessage>;

/**
 * SQL đọc của module IOT — telemetry và sự kiện thiết bị (FR-IOT-04, 05, FR-MNT-08). Chỉ module iot
 * được import file này (QT3, ADR-0003). Đường ghi (nhận bản tin MQTT) nằm ở `iot.service.ts`.
 *
 * Hai bảng này không có `brand_id` (loại B, `shared/scoping`) và chỉ tài khoản nền tảng có
 * `machine.view` đọc được, nên không lọc theo thương hiệu.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DATABASE, type Database } from '../../shared/db/index.js';

type SensorReading = Schema<'SensorReading'>;
type DeviceEvent = Schema<'DeviceEvent'>;

export interface TelemetryFilter {
  readonly page: number;
  readonly pageSize: number;
  /** Bao gồm. */
  readonly from?: Date | undefined;
  /** Không bao gồm. */
  readonly to?: Date | undefined;
}

@Injectable()
export class IotQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async machineExists(machineId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('machines')
      .select('id')
      .where('id', '=', machineId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async sensorReadings(
    machineId: string,
    filter: TelemetryFilter & {
      readonly slotId?: string | undefined;
      readonly readingType?: string | undefined;
    },
  ): Promise<{ items: SensorReading[]; total: number }> {
    const base = this.db
      .selectFrom('sensor_readings')
      .where('machine_id', '=', machineId)
      .$if(filter.from !== undefined, (qb) => qb.where('measured_at', '>=', filter.from!))
      .$if(filter.to !== undefined, (qb) => qb.where('measured_at', '<', filter.to!))
      .$if(filter.slotId !== undefined, (qb) => qb.where('slot_id', '=', filter.slotId!))
      .$if(filter.readingType !== undefined, (qb) =>
        qb.where('reading_type', '=', filter.readingType!),
      );
    const [rows, count] = await Promise.all([
      base
        .select([
          'id',
          'machine_id',
          'slot_id',
          'reading_type',
          'numeric_value',
          'unit',
          'measured_at',
        ])
        .orderBy('measured_at', 'desc')
        .orderBy('id', 'asc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        machineId: r.machine_id,
        slotId: r.slot_id,
        readingType: r.reading_type,
        numericValue: r.numeric_value === null ? null : Number(r.numeric_value),
        unit: r.unit,
        measuredAt: r.measured_at.toISOString(),
      })),
      total: Number(count.total),
    };
  }

  async deviceEvents(
    machineId: string,
    filter: TelemetryFilter,
  ): Promise<{ items: DeviceEvent[]; total: number }> {
    const base = this.db
      .selectFrom('device_events')
      .where('machine_id', '=', machineId)
      .$if(filter.from !== undefined, (qb) => qb.where('occurred_at', '>=', filter.from!))
      .$if(filter.to !== undefined, (qb) => qb.where('occurred_at', '<', filter.to!));
    const [rows, count] = await Promise.all([
      base
        .select([
          'id',
          'machine_id',
          'device_event_id',
          'event_type',
          'payload',
          'occurred_at',
          'received_at',
        ])
        .orderBy('occurred_at', 'desc')
        .orderBy('id', 'asc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        machineId: r.machine_id,
        deviceEventId: r.device_event_id,
        eventType: r.event_type,
        payload: (r.payload as Record<string, unknown> | null) ?? null,
        occurredAt: r.occurred_at.toISOString(),
        receivedAt: r.received_at.toISOString(),
      })),
      total: Number(count.total),
    };
  }
}

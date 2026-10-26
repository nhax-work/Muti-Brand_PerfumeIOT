/** Nhận dữ liệu thiết bị vào các bảng IOT đã có; thời gian kết nối dùng đồng hồ server. */
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import type {
  DB,
  MachineConnectionStatus,
  MachineOperatingMode,
} from '../../shared/db/types.generated.js';
import type { Transaction } from 'kysely';
import type { DeviceEvent, Heartbeat, Telemetry } from './iot.messages.js';

export interface DeviceConfiguration {
  readonly machineSerial: string;
  readonly payload: {
    schema_version: 1;
    machine_serial: string;
    ts: string;
    configuration_version: number;
    heartbeat_interval_sec: number;
    telemetry_interval_sec: number;
    operating_mode: string;
    press_window_sec: number;
    slots: {
      slot_number: number;
      enabled: boolean;
      calibrated_dosage_ml: number | null;
      actuator_run_ms: number;
    }[];
  };
}

@Injectable()
export class IotService {
  // Chỉ cache nội dung đã publish thành công; version và dữ liệu nguồn vẫn nằm trong DB.
  private readonly published = new Map<string, string>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async heartbeat(message: Heartbeat): Promise<boolean> {
    return this.db.transaction().execute(async (tx) => {
      const machine = await tx
        .selectFrom('machines')
        .select(['id', 'status', 'configuration_version', 'operating_mode'])
        .where('serial_number', '=', message.machine_serial)
        .forUpdate()
        .executeTakeFirst();
      if (!machine) return false;
      const now = this.clock.now();
      await tx
        .updateTable('machines')
        .set({
          status: 'ONLINE',
          last_seen_at: now,
          firmware_version: message.firmware_version,
          updated_at: now,
        })
        .where('id', '=', machine.id)
        .execute();
      if (machine.status !== 'ONLINE') {
        await this.history(tx, machine.id, machine.status, 'ONLINE', now);
      }
      if (
        message.configuration_version !== machine.configuration_version ||
        message.operating_mode !== deviceOperatingMode(machine.operating_mode)
      ) {
        this.published.delete(machine.id);
      }
      // Chế độ/version trong heartbeat là dữ liệu báo cáo, không được ghi đè cấu hình quản trị.
      return true;
    });
  }

  async telemetry(message: Telemetry): Promise<boolean> {
    return this.db.transaction().execute(async (tx) => {
      const machine = await tx
        .selectFrom('machines')
        .select('id')
        .where('serial_number', '=', message.machine_serial)
        .executeTakeFirst();
      if (!machine) return false;
      const slots = await tx
        .selectFrom('machine_slots')
        .select(['id', 'slot_number'])
        .where('machine_id', '=', machine.id)
        .execute();
      const ids = new Map(slots.map((s) => [s.slot_number, s.id]));
      // Không ghi một phần bản tin khi thiết bị khai báo slot không thuộc máy.
      if (message.slots.some((s) => !ids.has(s.slot_number))) return false;
      const measuredAt = new Date(message.ts);
      const receivedAt = this.clock.now();
      const readings: {
        machine_id: string;
        slot_id: string | null;
        reading_type: string;
        numeric_value: string | null;
        unit: string | null;
        payload: string;
        measured_at: Date;
        received_at: Date;
      }[] = [];
      const add = (
        type: string,
        slot: string | null,
        value: number | null,
        unit: string | null,
        payload: unknown,
      ) => {
        readings.push({
          machine_id: machine.id,
          slot_id: slot,
          reading_type: type,
          numeric_value: value === null ? null : String(value),
          unit,
          payload: JSON.stringify(payload),
          measured_at: measuredAt,
          received_at: receivedAt,
        });
      };
      add('DOOR_OPEN', null, message.door_open ? 1 : 0, null, { door_open: message.door_open });
      add('POWER_STATUS', null, null, null, { power_status: message.power_status });
      for (const slot of message.slots) {
        const id = ids.get(slot.slot_number)!;
        add('ACTUATOR_STATUS', id, null, null, slot);
        if (slot.load_cell_g !== undefined) add('LOAD_CELL_G', id, slot.load_cell_g, 'g', slot);
        if (slot.estimated_remaining_ml !== undefined) {
          add('ESTIMATED_REMAINING_ML', id, slot.estimated_remaining_ml, 'ml', slot);
        }
      }
      await tx.insertInto('sensor_readings').values(readings).execute();
      // Telemetry không ghi đè tồn kho: số đo và ước tính bán hàng là hai nguồn khác nhau.
      return true;
    });
  }

  async event(message: DeviceEvent): Promise<boolean> {
    const machine = await this.db
      .selectFrom('machines')
      .select('id')
      .where('serial_number', '=', message.machine_serial)
      .executeTakeFirst();
    if (!machine) return false;
    await this.db
      .insertInto('device_events')
      .values({
        machine_id: machine.id,
        device_event_id: message.device_event_id,
        event_type: message.event_type,
        occurred_at: new Date(message.ts),
        received_at: this.clock.now(),
        payload: JSON.stringify(message.payload ?? {}),
      })
      .onConflict((oc) => oc.columns(['machine_id', 'device_event_id']).doNothing())
      .execute();
    return true;
  }

  async sweepConnections(): Promise<number> {
    const now = this.clock.now();
    const unstableMs =
      this.config.constraint('HEARTBEAT_INTERVAL_SEC') *
      this.config.constraint('MACHINE_UNSTABLE_MISSED') *
      1000;
    const offlineMs = this.config.constraint('MACHINE_OFFLINE_SEC') * 1000;
    return this.db.transaction().execute(async (tx) => {
      const machines = await tx
        .selectFrom('machines')
        .select(['id', 'status', 'last_seen_at'])
        .where('simulator_enabled', '=', false)
        .forUpdate()
        .execute();
      let count = 0;
      for (const machine of machines) {
        const elapsed = machine.last_seen_at
          ? now.getTime() - new Date(machine.last_seen_at).getTime()
          : Infinity;
        const next =
          elapsed >= offlineMs ? 'OFFLINE' : elapsed >= unstableMs ? 'UNSTABLE' : 'ONLINE';
        if (machine.status === next) continue;
        await tx
          .updateTable('machines')
          .set({ status: next, updated_at: now })
          .where('id', '=', machine.id)
          .execute();
        await this.history(tx, machine.id, machine.status, next, now);
        if (next === 'OFFLINE') {
          await tx
            .insertInto('alerts')
            .values({
              machine_id: machine.id,
              type: 'MACHINE_OFFLINE',
              severity: 'HIGH',
              deduplication_key: `machine-offline:${machine.id}`,
              title: 'Machine offline',
              first_occurred_at: now,
              last_occurred_at: now,
            })
            .onConflict((oc) =>
              oc
                .column('deduplication_key')
                .where('status', 'in', ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'])
                .doUpdateSet({
                  last_occurred_at: now,
                  occurrence_count: sql`alerts.occurrence_count + 1`,
                }),
            )
            .execute();
        }
        count++;
      }
      return count;
    });
  }

  /** Đồng bộ config từ DB; tăng version bằng DB, không lấy version do thiết bị báo làm nguồn sự thật. */
  async syncConfigurations(
    publish: (message: DeviceConfiguration) => Promise<void>,
  ): Promise<void> {
    const machines = await this.db
      .selectFrom('machines')
      .select(['id', 'serial_number', 'operating_mode'])
      .where('simulator_enabled', '=', false)
      .execute();
    for (const machine of machines) {
      const content = await this.configurationContent(machine);
      const fingerprint = JSON.stringify(content);
      if (this.published.get(machine.id) === fingerprint) continue;
      await this.publishConfiguration(machine, content, publish);
    }
  }

  /**
   * FR-IOT-06: đẩy lại cấu hình của một máy NGAY, kể cả khi nội dung không đổi — tăng
   * `configuration_version` để thiết bị chắc chắn áp bản mới (mqtt.md §7). Khác `syncConfigurations`,
   * không bỏ qua máy mô phỏng: người vận hành chủ động yêu cầu.
   *
   * @param publish `null` khi chưa nối broker — version vẫn tăng, và cache được xóa để nhịp đồng bộ kế
   *   tiếp publish lại ngay khi có kết nối.
   * @returns version mới, hoặc `null` nếu máy không tồn tại
   */
  async pushConfiguration(
    machineId: string,
    publish: ((message: DeviceConfiguration) => Promise<void>) | null,
  ): Promise<number | null> {
    const machine = await this.db
      .selectFrom('machines')
      .select(['id', 'serial_number', 'operating_mode'])
      .where('id', '=', machineId)
      .executeTakeFirst();
    if (!machine) return null;
    if (!publish) {
      const version = await this.bumpConfigurationVersion(machine.id);
      this.published.delete(machine.id);
      return version;
    }
    return this.publishConfiguration(machine, await this.configurationContent(machine), publish);
  }

  private async configurationContent(machine: {
    id: string;
    operating_mode: MachineOperatingMode;
  }) {
    const slots = await this.db
      .selectFrom('machine_slots')
      .select(['slot_number', 'status', 'active_bottle_id', 'calibrated_dosage_ml'])
      .where('machine_id', '=', machine.id)
      .orderBy('slot_number')
      .execute();
    return {
      heartbeat_interval_sec: this.config.constraint('HEARTBEAT_INTERVAL_SEC'),
      telemetry_interval_sec: this.config.constraint('HEARTBEAT_INTERVAL_SEC') * 2,
      operating_mode: deviceOperatingMode(machine.operating_mode),
      press_window_sec: this.config.constraint('DISPENSE_PRESS_WINDOW_SEC'),
      slots: slots.map((s) => ({
        slot_number: s.slot_number,
        enabled:
          s.status === 'AVAILABLE' &&
          s.active_bottle_id !== null &&
          s.calibrated_dosage_ml !== null,
        calibrated_dosage_ml:
          s.calibrated_dosage_ml === null ? null : Number(s.calibrated_dosage_ml),
        actuator_run_ms: this.config.constraint('ACTUATOR_RUN_MS'),
      })),
    };
  }

  private async bumpConfigurationVersion(machineId: string): Promise<number> {
    const row = await this.db
      .updateTable('machines')
      .set((eb) => ({ configuration_version: eb('configuration_version', '+', 1) }))
      .where('id', '=', machineId)
      .returning('configuration_version')
      .executeTakeFirstOrThrow();
    return row.configuration_version;
  }

  private async publishConfiguration(
    machine: { id: string; serial_number: string },
    content: Awaited<ReturnType<IotService['configurationContent']>>,
    publish: (message: DeviceConfiguration) => Promise<void>,
  ): Promise<number> {
    const version = await this.bumpConfigurationVersion(machine.id);
    await publish({
      machineSerial: machine.serial_number,
      payload: {
        schema_version: 1,
        machine_serial: machine.serial_number,
        ts: this.clock.now().toISOString(),
        configuration_version: version,
        ...content,
      },
    });
    this.published.set(machine.id, JSON.stringify(content));
    return version;
  }

  private async history(
    tx: Transaction<DB>,
    id: string,
    from: MachineConnectionStatus,
    to: MachineConnectionStatus,
    at: Date,
  ): Promise<void> {
    await tx
      .insertInto('machine_status_histories')
      .values({
        machine_id: id,
        from_connection_status: from,
        to_connection_status: to,
        source: 'DEVICE',
        occurred_at: at,
      })
      .execute();
  }
}

/**
 * Chế độ gửi xuống thiết bị (mqtt.md §7). DRAINING chỉ tồn tại ở backend (ADR-0015 mục 7): thiết bị
 * phải tiếp tục xử lý lệnh của đơn đã trả tiền nên vẫn nhận NORMAL, tới khi máy thật sự MAINTENANCE.
 * Heartbeat cũng so theo giá trị này — so với DRAINING thô thì mọi heartbeat đều "lệch" và cấu hình bị
 * publish lại liên tục.
 */
export function deviceOperatingMode(
  mode: MachineOperatingMode,
): Exclude<MachineOperatingMode, 'DRAINING'> {
  return mode === 'DRAINING' ? 'NORMAL' : mode;
}

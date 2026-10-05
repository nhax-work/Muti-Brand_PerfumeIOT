/**
 * SQL của module DSP: `dispense_commands`, `dispense_results`.
 *
 * Phía thiết bị là luồng hệ thống, không có người dùng nên không qua bộ lọc phạm vi thương hiệu
 * (QT4 chỉ áp cho truy vấn phục vụ người dùng). Hàm nhận `executor` chạy được trong transaction của
 * người gọi.
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type { CommandStatus, Json } from '../../shared/db/types.generated.js';
import { ACTIVE_COMMAND_STATUSES } from './dispense-outcome.js';

type Executor = Kysely<DB>;

/** Đơn PAID cũ nhất của một máy đang rảnh — ứng viên để ghi lệnh xịt. */
export interface ArmableOrder {
  readonly orderId: string;
  readonly machineSerial: string;
  readonly slotNumber: number;
  /** `null` khi slot chưa hiệu chuẩn (FR-MCH-06). */
  readonly dosageMl: string | null;
}

export interface NewCommand {
  readonly brandId: string;
  readonly orderId: string;
  readonly machineId: string;
  readonly slotId: string;
  readonly commandToken: string;
  readonly signature: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

/** Lệnh kèm đủ dữ liệu dựng bản tin `command` (spec/contracts/mqtt.md §5). */
export interface OutgoingCommand {
  readonly id: string;
  readonly commandToken: string;
  readonly commandType: 'CUSTOMER' | 'DIAGNOSTIC';
  readonly machineSerial: string;
  readonly slotNumber: number;
  /** `null` khi slot chưa hiệu chuẩn (FR-MCH-06). */
  readonly dosageMl: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface LockedCommand {
  readonly id: string;
  readonly orderId: string | null;
  readonly brandId: string | null;
  readonly status: CommandStatus;
  readonly acknowledgedAt: Date | null;
}

export interface NewResult {
  readonly commandId: string;
  readonly brandId: string | null;
  readonly success: boolean;
  readonly resultCode: string | null;
  readonly failureCode: string | null;
  readonly executedAt: Date | null;
  readonly measuredQuantityMl: number | null;
  readonly sensorSnapshot: Json | null;
  readonly rawPayload: Json;
  readonly deviceEventId: string | null;
}

/** Lệnh quá hạn chờ phản hồi — xem `DspService.sweepTimeouts`. */
export interface StaleCommand {
  readonly id: string;
  readonly orderId: string | null;
  readonly commandToken: string;
  readonly status: CommandStatus;
}

@Injectable()
export class DspQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  /**
   * Mỗi máy ONLINE/NORMAL chưa có lệnh CUSTOMER hiệu lực: đơn PAID trả tiền sớm nhất (FR-DSP-26 —
   * đơn trả sau "chờ lượt"). Máy mất kết nối hay bảo trì thì đơn giữ PAID, không ghi lệnh vô ích.
   */
  async listArmableOrders(): Promise<ArmableOrder[]> {
    const rows = await this.db
      .selectFrom('orders as o')
      .innerJoin('machines as m', 'm.id', 'o.machine_id')
      .innerJoin('machine_slots as ms', 'ms.id', 'o.slot_id')
      .select(['o.id', 'm.serial_number', 'ms.slot_number', 'ms.calibrated_dosage_ml'])
      .distinctOn('o.machine_id')
      .where('o.status', '=', 'PAID')
      .where('m.status', '=', 'ONLINE')
      .where('m.operating_mode', '=', 'NORMAL')
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('dispense_commands as dc')
              .select('dc.id')
              .whereRef('dc.machine_id', '=', 'o.machine_id')
              .where('dc.command_type', '=', 'CUSTOMER')
              .where('dc.status', 'in', [...ACTIVE_COMMAND_STATUSES]),
          ),
        ),
      )
      .orderBy('o.machine_id')
      .orderBy('o.paid_at')
      .orderBy('o.created_at')
      .execute();
    return rows.map((r) => ({
      orderId: r.id,
      machineSerial: r.serial_number,
      slotNumber: r.slot_number,
      dosageMl: r.calibrated_dosage_ml,
    }));
  }

  async insertCommand(command: NewCommand, executor: Executor): Promise<string> {
    const row = await executor
      .insertInto('dispense_commands')
      .values({
        brand_id: command.brandId,
        order_id: command.orderId,
        machine_id: command.machineId,
        slot_id: command.slotId,
        command_type: 'CUSTOMER',
        command_token: command.commandToken,
        signature: command.signature,
        status: 'CREATED',
        expires_at: command.expiresAt,
        created_at: command.createdAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** Lệnh CREATED còn hạn — chờ được publish. */
  async listUnsentCommands(now: Date): Promise<OutgoingCommand[]> {
    const rows = await this.db
      .selectFrom('dispense_commands as dc')
      .innerJoin('machines as m', 'm.id', 'dc.machine_id')
      .innerJoin('machine_slots as ms', 'ms.id', 'dc.slot_id')
      .select([
        'dc.id',
        'dc.command_token',
        'dc.command_type',
        'm.serial_number',
        'ms.slot_number',
        'ms.calibrated_dosage_ml',
        'dc.expires_at',
        'dc.created_at',
      ])
      .where('dc.status', '=', 'CREATED')
      .where('dc.expires_at', '>', now)
      .orderBy('dc.created_at')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      commandToken: r.command_token,
      commandType: r.command_type,
      machineSerial: r.serial_number,
      slotNumber: r.slot_number,
      dosageMl: r.calibrated_dosage_ml,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  }

  /**
   * Đánh dấu đã publish. ACK có thể về TRƯỚC câu lệnh này (thiết bị nhanh hơn round-trip CSDL) —
   * khi đó giữ nguyên ACKNOWLEDGED, chỉ điền `sent_at`.
   */
  async markSent(commandId: string, signature: string, at: Date): Promise<void> {
    await this.db
      .updateTable('dispense_commands')
      .set({
        status: sql<CommandStatus>`case when status = 'CREATED' then 'SENT'::command_status else status end`,
        sent_at: sql<Date>`coalesce(sent_at, ${at})`,
        signature,
      })
      .where('id', '=', commandId)
      .execute();
  }

  /** Khóa lệnh theo token, chỉ khi token thuộc đúng máy gửi bản tin (chống máy này báo thay máy khác). */
  async lockCommandByToken(
    machineSerial: string,
    commandToken: string,
    executor: Executor,
  ): Promise<LockedCommand | null> {
    const row = await executor
      .selectFrom('dispense_commands as dc')
      .innerJoin('machines as m', 'm.id', 'dc.machine_id')
      .select(['dc.id', 'dc.order_id', 'dc.brand_id', 'dc.status', 'dc.acknowledged_at'])
      .where('dc.command_token', '=', commandToken)
      .where('m.serial_number', '=', machineSerial)
      .forUpdate('dc')
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.order_id,
      brandId: row.brand_id,
      status: row.status,
      acknowledgedAt: row.acknowledged_at,
    };
  }

  async acknowledge(commandId: string, at: Date, executor: Executor): Promise<void> {
    await executor
      .updateTable('dispense_commands')
      .set({ status: 'ACKNOWLEDGED', acknowledged_at: at })
      .where('id', '=', commandId)
      .execute();
  }

  async close(
    commandId: string,
    status: CommandStatus,
    at: Date,
    executor: Executor,
  ): Promise<void> {
    await executor
      .updateTable('dispense_commands')
      .set({ status, completed_at: at })
      .where('id', '=', commandId)
      .execute();
  }

  /** Không nhận được phản hồi đúng hạn (FR-DSP-18) — chưa kết thúc nên không điền `completed_at`. */
  async markUnknown(commandId: string, executor: Executor): Promise<void> {
    await executor
      .updateTable('dispense_commands')
      .set({ status: 'UNKNOWN' })
      .where('id', '=', commandId)
      .execute();
  }

  /** `UNIQUE (command_id)` — RESULT gửi lại không tạo hàng thứ hai (FR-IOT-07). */
  async insertResult(result: NewResult, executor: Executor): Promise<void> {
    await executor
      .insertInto('dispense_results')
      .values({
        command_id: result.commandId,
        brand_id: result.brandId,
        success: result.success,
        result_code: result.resultCode,
        failure_code: result.failureCode,
        executed_at: result.executedAt,
        measured_quantity_ml: result.measuredQuantityMl,
        sensor_snapshot:
          result.sensorSnapshot === null ? null : JSON.stringify(result.sensorSnapshot),
        raw_payload: JSON.stringify(result.rawPayload),
        device_event_id: result.deviceEventId,
      })
      .onConflict((oc) => oc.column('command_id').doNothing())
      .execute();
  }

  /**
   * Lệnh quá hạn (spec/contracts/mqtt.md §6):
   *   - CREATED đã qua `expires_at` mà chưa publish được (broker mất kết nối) — thiết bị chắc chắn
   *     chưa nhận;
   *   - SENT chưa ACK sau `resultTimeoutSec` kể từ lúc gửi;
   *   - ACKNOWLEDGED chưa kết quả sau `pressWindowSec + resultTimeoutSec` kể từ ACK.
   */
  async listStaleCommands(
    now: Date,
    resultTimeoutSec: number,
    pressWindowSec: number,
  ): Promise<StaleCommand[]> {
    const sentBefore = new Date(now.getTime() - resultTimeoutSec * 1000);
    const ackedBefore = new Date(now.getTime() - (pressWindowSec + resultTimeoutSec) * 1000);
    const rows = await this.db
      .selectFrom('dispense_commands')
      .select(['id', 'order_id', 'command_token', 'status'])
      .where((eb) =>
        eb.or([
          eb.and([eb('status', '=', 'CREATED'), eb('expires_at', '<=', now)]),
          eb.and([eb('status', '=', 'SENT'), eb('sent_at', '<=', sentBefore)]),
          eb.and([eb('status', '=', 'ACKNOWLEDGED'), eb('acknowledged_at', '<=', ackedBefore)]),
        ]),
      )
      .execute();
    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      commandToken: r.command_token,
      status: r.status,
    }));
  }

  /** Khóa lại một lệnh quá hạn; `null` nếu trạng thái đã đổi kể từ lúc liệt kê. */
  async lockIfStatus(
    commandId: string,
    status: CommandStatus,
    executor: Executor,
  ): Promise<{ readonly id: string } | null> {
    const row = await executor
      .selectFrom('dispense_commands')
      .select('id')
      .where('id', '=', commandId)
      .where('status', '=', status)
      .forUpdate()
      .executeTakeFirst();
    return row ?? null;
  }
}

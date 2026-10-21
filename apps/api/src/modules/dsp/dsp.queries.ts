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
import {
  brandScopedByColumn,
  brandScopedOrders,
  HOLDING_RENTAL_STATUSES,
  type BrandScope,
} from '../../shared/scoping/index.js';
import type {
  CommandStatus,
  DispenseType,
  Json,
  SlotStatus,
} from '../../shared/db/types.generated.js';
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
  /** NULL với lệnh DIAGNOSTIC trên slot không có hóa đơn đang khai thác. */
  readonly brandId: string | null;
  /** NULL với lệnh DIAGNOSTIC (FR-DSP-20). */
  readonly orderId: string | null;
  readonly commandType: DispenseType;
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
  readonly slotId: string;
  readonly commandType: DispenseType;
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

/** Slot đích của lượt xịt chẩn đoán, kèm máy (đã khóa) và thương hiệu đang khai thác slot. */
export interface DiagnosticTarget {
  readonly machineId: string;
  readonly machineSerial: string;
  readonly machineStatus: string;
  readonly slotId: string;
  readonly slotNumber: number;
  readonly dosageMl: string | null;
  readonly brandId: string | null;
}

/** Hàng `dispense_commands` kèm kết quả (nếu có) — dữ liệu cho schema `DispenseCommand`. */
export interface CommandRecord {
  readonly id: string;
  readonly orderId: string | null;
  readonly brandId: string | null;
  readonly machineId: string;
  readonly slotId: string;
  readonly commandType: DispenseType;
  readonly commandToken: string;
  readonly status: CommandStatus;
  readonly expiresAt: Date;
  readonly sentAt: Date | null;
  readonly acknowledgedAt: Date | null;
  readonly completedAt: Date | null;
  readonly retryCount: number;
  readonly createdAt: Date;
  readonly result: {
    readonly success: boolean;
    readonly resultCode: string | null;
    readonly failureCode: string | null;
    readonly executedAt: Date | null;
    readonly measuredQuantityMl: string | null;
    readonly receivedAt: Date;
  } | null;
}

export interface CommandSearchFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly machineId?: string | undefined;
  readonly commandType?: DispenseType | undefined;
  readonly status?: CommandStatus | undefined;
}

/** Lệnh quá hạn chờ phản hồi — xem `DspService.sweepTimeouts`. */
export interface StaleCommand {
  readonly id: string;
  readonly orderId: string | null;
  readonly brandId: string | null;
  readonly slotId: string;
  readonly commandType: DispenseType;
  readonly commandToken: string;
  readonly status: CommandStatus;
}

/** Lệnh CUSTOMER đã kết thúc trên một slot, mới nhất trước — đếm lỗi liên tiếp (FR-ALR-04). */
export interface FinishedCustomerCommand {
  readonly commandToken: string;
  readonly status: CommandStatus;
  /** `orders.failure_code` — phân biệt REJECTED vì khách không bấm (PRESS_TIMEOUT) với lỗi máy. */
  readonly orderFailureCode: string | null;
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
        command_type: command.commandType,
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
      .select([
        'dc.id',
        'dc.order_id',
        'dc.brand_id',
        'dc.slot_id',
        'dc.command_type',
        'dc.status',
        'dc.acknowledged_at',
      ])
      .where('dc.command_token', '=', commandToken)
      .where('m.serial_number', '=', machineSerial)
      .forUpdate('dc')
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.order_id,
      brandId: row.brand_id,
      slotId: row.slot_id,
      commandType: row.command_type,
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
      .select(['id', 'order_id', 'brand_id', 'slot_id', 'command_type', 'command_token', 'status'])
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
      brandId: r.brand_id,
      slotId: r.slot_id,
      commandType: r.command_type,
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

  // -----------------------------------------------------------------------------------
  // Dừng bán an toàn (ADR-0015)
  // -----------------------------------------------------------------------------------

  /** FR-ORD-34: đơn PAID trả tiền từ trước `paidBefore` mà vẫn chưa có lệnh — cũ nhất trước. */
  async listQueueTimedOutOrderIds(paidBefore: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('orders')
      .select('id')
      .where('status', '=', 'PAID')
      .where('paid_at', '<=', paidBefore)
      .orderBy('paid_at')
      .limit(limit)
      .execute();
    return rows.map((r) => r.id);
  }

  /**
   * Lệnh CUSTOMER đã kết thúc trên slot, tạo sau `since`, mới nhất trước. Bỏ EXPIRED: lệnh chưa tới
   * được thiết bị (broker mất kết nối) không nói gì về tình trạng slot.
   */
  async listFinishedCustomerCommands(
    slotId: string,
    since: Date | null,
    limit: number,
    executor: Executor,
  ): Promise<FinishedCustomerCommand[]> {
    let query = executor
      .selectFrom('dispense_commands as dc')
      .leftJoin('orders as o', 'o.id', 'dc.order_id')
      .select(['dc.command_token', 'dc.status', 'o.failure_code'])
      .where('dc.slot_id', '=', slotId)
      .where('dc.command_type', '=', 'CUSTOMER')
      .where('dc.status', 'in', ['SUCCEEDED', 'FAILED', 'REJECTED', 'UNKNOWN']);
    if (since) query = query.where('dc.created_at', '>', since);
    const rows = await query.orderBy('dc.created_at', 'desc').limit(limit).execute();
    return rows.map((r) => ({
      commandToken: r.command_token,
      status: r.status,
      orderFailureCode: r.failure_code,
    }));
  }

  /**
   * Lần gần nhất slot bị tự tắt vì lỗi liên tiếp. Chuỗi lỗi đếm lại từ mốc này, nên slot vừa được
   * Operations Staff bật lại không bị tắt ngay ở lượt lỗi kế tiếp chỉ vì ba lỗi cũ.
   */
  async lastAutoMaintenanceAt(
    slotId: string,
    action: string,
    executor: Executor,
  ): Promise<Date | null> {
    const row = await executor
      .selectFrom('audit_logs')
      .select((eb) => eb.fn.max('occurred_at').as('at'))
      .where('target_type', '=', 'machine_slot')
      .where('target_id', '=', slotId)
      .where('action', '=', action)
      .executeTakeFirst();
    return row?.at ?? null;
  }

  /**
   * FR-MCH-18: đưa slot sang MAINTENANCE nếu đang bán được hoặc tạm tắt. Slot đã MAINTENANCE/DISABLED
   * giữ nguyên. Trả trạng thái cũ, hoặc `null` khi không đổi gì.
   */
  async putSlotInMaintenance(
    slotId: string,
    executor: Executor,
  ): Promise<{ readonly machineId: string; readonly from: SlotStatus } | null> {
    const slot = await executor
      .selectFrom('machine_slots')
      .select(['machine_id', 'status'])
      .where('id', '=', slotId)
      .forUpdate()
      .executeTakeFirst();
    if (!slot || (slot.status !== 'AVAILABLE' && slot.status !== 'UNAVAILABLE')) return null;
    await executor
      .updateTable('machine_slots')
      .set((eb) => ({ status: 'MAINTENANCE', version: eb('version', '+', 1) }))
      .where('id', '=', slotId)
      .execute();
    return { machineId: slot.machine_id, from: slot.status };
  }

  /**
   * Cảnh báo FR-ALR-04. Chống trùng bằng `uq_alert_dedup_unresolved` (FR-ALR-07): còn cảnh báo chưa
   * xử lý cùng slot thì không tạo thêm.
   */
  async raiseConsecutiveFailAlert(
    alert: {
      readonly brandId: string | null;
      readonly machineId: string;
      readonly slotId: string;
      readonly title: string;
      readonly description: string;
      readonly at: Date;
    },
    executor: Executor,
  ): Promise<void> {
    await sql`
      INSERT INTO alerts (brand_id, machine_id, slot_id, type, severity, deduplication_key, title,
                          description, first_occurred_at, last_occurred_at)
      VALUES (${alert.brandId}, ${alert.machineId}, ${alert.slotId}, 'CONSECUTIVE_DISPENSE_FAILURES',
              'HIGH', ${`CONSECUTIVE_DISPENSE_FAILURES:${alert.slotId}`}, ${alert.title},
              ${alert.description}, ${alert.at}, ${alert.at})
      ON CONFLICT DO NOTHING`.execute(executor);
  }

  // -----------------------------------------------------------------------------------
  // Lượt xịt chẩn đoán và tra cứu lệnh (FR-MNT-09, FR-DSP-20)
  // -----------------------------------------------------------------------------------

  /**
   * Khóa hàng máy rồi đọc slot đích. Khóa máy để hai lượt chẩn đoán gửi cùng lúc trên một máy không
   * cùng lọt qua bước kiểm "máy rảnh" — CSDL không có index nào chặn lệnh DIAGNOSTIC.
   *
   * `brandId` là thương hiệu đang KHAI THÁC slot (`HOLDING_RENTAL_STATUSES`, không gồm LIQUIDATED):
   * lệnh trên slot đã thanh lý không được hiện cho thương hiệu cũ (FR-EXP-20).
   */
  async lockDiagnosticTarget(
    machineId: string,
    slotId: string,
    executor: Executor,
  ): Promise<DiagnosticTarget | null> {
    const machine = await executor
      .selectFrom('machines')
      .select(['id', 'serial_number', 'status'])
      .where('id', '=', machineId)
      .forUpdate()
      .executeTakeFirst();
    if (!machine) return null;
    const slot = await executor
      .selectFrom('machine_slots as ms')
      .leftJoin('slot_rentals as sr', (join) =>
        join.onRef('sr.slot_id', '=', 'ms.id').on('sr.status', 'in', [...HOLDING_RENTAL_STATUSES]),
      )
      .select(['ms.id', 'ms.slot_number', 'ms.calibrated_dosage_ml', 'sr.brand_id'])
      .where('ms.id', '=', slotId)
      .where('ms.machine_id', '=', machineId)
      .executeTakeFirst();
    if (!slot) return null;
    return {
      machineId: machine.id,
      machineSerial: machine.serial_number,
      machineStatus: machine.status,
      slotId: slot.id,
      slotNumber: slot.slot_number,
      dosageMl: slot.calibrated_dosage_ml,
      brandId: slot.brand_id,
    };
  }

  /**
   * Máy đang bận phục vụ: còn lệnh hiệu lực (mọi loại) hoặc đơn đã trả tiền chờ lượt. Thiết bị chỉ
   * xử lý một lệnh mỗi lúc và lặng lẽ bỏ qua lệnh tới khi đang bận, nên lệnh chẩn đoán gửi lúc này sẽ
   * thành UNKNOWN; còn đơn chờ lượt thì được ưu tiên vì khách đã trả tiền.
   */
  async machineIsBusy(machineId: string, executor: Executor): Promise<boolean> {
    const command = await executor
      .selectFrom('dispense_commands')
      .select('id')
      .where('machine_id', '=', machineId)
      .where('status', 'in', [...ACTIVE_COMMAND_STATUSES])
      .limit(1)
      .executeTakeFirst();
    if (command) return true;
    const queued = await executor
      .selectFrom('orders')
      .select('id')
      .where('machine_id', '=', machineId)
      .where('status', '=', 'PAID')
      .limit(1)
      .executeTakeFirst();
    return queued !== undefined;
  }

  /**
   * FR-DSP-20: tra cứu lệnh. Phạm vi thương hiệu đi theo hai nhánh: lệnh CUSTOMER lọc qua đơn của nó
   * (`brandScopedOrders` — loại đơn doanh thu PLATFORM sau thanh lý, FR-REV-06); lệnh DIAGNOSTIC không
   * có đơn nên lọc theo `brand_id` chụp lúc tạo.
   */
  async searchCommands(
    scope: BrandScope,
    filter: CommandSearchFilter,
  ): Promise<{ items: CommandRecord[]; total: number }> {
    let base = this.db
      .selectFrom('dispense_commands as dc')
      .leftJoin('orders as o', 'o.id', 'dc.order_id')
      .leftJoin('dispense_results as r', 'r.command_id', 'dc.id')
      .where((eb) =>
        eb.or([
          eb.and([eb('dc.order_id', 'is', null), brandScopedByColumn(scope, 'dc.brand_id')]),
          eb.and([eb('dc.order_id', 'is not', null), brandScopedOrders(scope, 'o')]),
        ]),
      );
    if (filter.from) base = base.where('dc.created_at', '>=', filter.from);
    if (filter.to) base = base.where('dc.created_at', '<', filter.to);
    if (filter.machineId) base = base.where('dc.machine_id', '=', filter.machineId);
    if (filter.commandType) base = base.where('dc.command_type', '=', filter.commandType);
    if (filter.status) base = base.where('dc.status', '=', filter.status);

    const [count, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
      base
        .select(COMMAND_COLUMNS)
        .orderBy('dc.created_at', 'desc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
    ]);
    return { items: rows.map(toCommandRecord), total: Number(count.total) };
  }

  /** Lệnh mới nhất của đơn. Người gọi đã kiểm phạm vi trên chính đơn. */
  async findLatestCommandForOrder(orderId: string): Promise<CommandRecord | null> {
    const row = await this.db
      .selectFrom('dispense_commands as dc')
      .leftJoin('dispense_results as r', 'r.command_id', 'dc.id')
      .select(COMMAND_COLUMNS)
      .where('dc.order_id', '=', orderId)
      .orderBy('dc.created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? toCommandRecord(row) : null;
  }

  async findCommandById(commandId: string, executor: Executor): Promise<CommandRecord | null> {
    const row = await executor
      .selectFrom('dispense_commands as dc')
      .leftJoin('dispense_results as r', 'r.command_id', 'dc.id')
      .select(COMMAND_COLUMNS)
      .where('dc.id', '=', commandId)
      .executeTakeFirst();
    return row ? toCommandRecord(row) : null;
  }
}

/** Cột của `dispense_commands as dc` nối trái `dispense_results as r` — một lệnh có tối đa một kết quả. */
const COMMAND_COLUMNS = [
  'dc.id',
  'dc.order_id',
  'dc.brand_id',
  'dc.machine_id',
  'dc.slot_id',
  'dc.command_type',
  'dc.command_token',
  'dc.status',
  'dc.expires_at',
  'dc.sent_at',
  'dc.acknowledged_at',
  'dc.completed_at',
  'dc.retry_count',
  'dc.created_at',
  'r.success as result_success',
  'r.result_code as result_code',
  'r.failure_code as result_failure_code',
  'r.executed_at as result_executed_at',
  'r.measured_quantity_ml as result_measured_quantity_ml',
  'r.received_at as result_received_at',
] as const;

interface CommandRow {
  readonly id: string;
  readonly order_id: string | null;
  readonly brand_id: string | null;
  readonly machine_id: string;
  readonly slot_id: string;
  readonly command_type: DispenseType;
  readonly command_token: string;
  readonly status: CommandStatus;
  readonly expires_at: Date;
  readonly sent_at: Date | null;
  readonly acknowledged_at: Date | null;
  readonly completed_at: Date | null;
  readonly retry_count: number;
  readonly created_at: Date;
  readonly result_success: boolean | null;
  readonly result_code: string | null;
  readonly result_failure_code: string | null;
  readonly result_executed_at: Date | null;
  readonly result_measured_quantity_ml: string | null;
  readonly result_received_at: Date | null;
}

function toCommandRecord(r: CommandRow): CommandRecord {
  return {
    id: r.id,
    orderId: r.order_id,
    brandId: r.brand_id,
    machineId: r.machine_id,
    slotId: r.slot_id,
    commandType: r.command_type,
    commandToken: r.command_token,
    status: r.status,
    expiresAt: r.expires_at,
    sentAt: r.sent_at,
    acknowledgedAt: r.acknowledged_at,
    completedAt: r.completed_at,
    retryCount: r.retry_count,
    createdAt: r.created_at,
    // received_at NOT NULL trong bảng — NULL ở đây nghĩa là chưa có hàng kết quả.
    result:
      r.result_received_at === null
        ? null
        : {
            success: r.result_success === true,
            resultCode: r.result_code,
            failureCode: r.result_failure_code,
            executedAt: r.result_executed_at,
            measuredQuantityMl: r.result_measured_quantity_ml,
            receivedAt: r.result_received_at,
          },
  };
}

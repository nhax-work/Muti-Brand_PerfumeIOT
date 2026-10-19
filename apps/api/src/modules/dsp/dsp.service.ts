/**
 * Lệnh xịt (FR-DSP-01..19, FR-DSP-21..26, ADR-0007).
 *
 * Không biết MQTT (QT2, ADR-0003): dựng bản tin và nhận bản tin đã giải mã; publish/subscribe là việc
 * của `dsp.mqtt.ts`, nhịp chạy là việc của `dsp.jobs.ts`.
 *
 * Luồng outbox — lệnh KHÔNG được publish trong transaction webhook, vì transaction rollback sau khi
 * máy đã xịt là vi phạm BR-002:
 *   webhook ─tx─▶ đơn PAID
 *   armQueuedOrders ─tx─▶ dispense_commands CREATED + đơn DISPENSE_REQUESTED
 *   listOutgoing → publish → markSent (SENT)
 *   handleDeviceResult ─tx─▶ ACKNOWLEDGED | SUCCEEDED/FAILED/REJECTED + đơn DISPENSED/FAILED/FORFEITED
 *   sweepTimeouts ─tx─▶ UNKNOWN (FR-DSP-18) | EXPIRED
 *   failQueueTimeouts ─tx─▶ đơn PAID chờ lượt quá PAID_QUEUE_MAX_SEC → FAILED QUEUE_TIMEOUT (FR-ORD-34)
 *
 * Mỗi lần lệnh CUSTOMER kết thúc bằng lỗi máy, cùng transaction đó đếm chuỗi lỗi liên tiếp trên slot;
 * đủ CONSECUTIVE_FAIL_ALERT thì cảnh báo và tự tắt slot (FR-ALR-04, FR-MCH-18, ADR-0015 mục 5).
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { createCommandSigner, type CommandSigner } from '../../adapters/mqtt/command-signature.js';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import type { DB } from '../../shared/db/index.js';
import type { CommandStatus, Json } from '../../shared/db/types.generated.js';
import { OrdService } from '../ord/index.js';
import {
  ACKNOWLEDGEABLE_STATUSES,
  CLOSABLE_STATUSES,
  outcomeOf,
  PRESS_TIMEOUT,
  type DeviceStage,
} from './dispense-outcome.js';
import { DspQueries, type OutgoingCommand } from './dsp.queries.js';

/** Bản tin `command` đã ký, sẵn sàng publish (spec/contracts/mqtt.md §5). */
export interface CommandMessage {
  readonly commandId: string;
  readonly machineSerial: string;
  readonly payload: CommandPayload;
}

export interface CommandPayload {
  readonly schema_version: 1;
  readonly machine_serial: string;
  readonly ts: string;
  readonly command_token: string;
  readonly command_type: 'DISPENSE';
  readonly dispense_type: 'CUSTOMER' | 'DIAGNOSTIC';
  readonly slot_number: number;
  readonly dosage_ml: number | null;
  readonly expires_at: string;
  readonly signature: string;
}

/** Bản tin `command/result` đã kiểm hình dạng ở cửa vào MQTT (spec/contracts/mqtt.md §6). */
export interface DeviceResultInput {
  readonly commandToken: string;
  readonly stage: DeviceStage;
  readonly success?: boolean | undefined;
  readonly failureCode?: string | null | undefined;
  readonly resultCode?: string | null | undefined;
  readonly executedAt?: Date | null | undefined;
  readonly deviceEventId?: string | null | undefined;
  readonly measuredQuantityMl?: number | null | undefined;
  readonly sensorSnapshot?: Json | null | undefined;
  readonly raw: Json;
}

export type DeviceResultHandling = 'APPLIED' | 'IGNORED' | 'UNKNOWN_COMMAND';

/** Mã lỗi Postgres khi vi phạm unique — ở đây là `uq_machine_active_customer_command`/`uq_order_active_command`. */
const UNIQUE_VIOLATION = '23505';

/** Hành động AuditLog khi slot tự tắt — cũng là mốc đếm lại chuỗi lỗi (DspQueries.lastAutoMaintenanceAt). */
export const SLOT_AUTO_MAINTENANCE_ACTION = 'dsp.slot.auto_maintenance';

/** Số đơn tối đa xử lý mỗi nhịp của job chờ lượt — nhịp sau làm tiếp phần còn lại. */
const QUEUE_TIMEOUT_BATCH = 200;

/** Lệnh vừa kết thúc trên slot, kèm đủ dữ liệu để đếm lỗi liên tiếp. */
interface FinishedCommand {
  readonly slotId: string;
  readonly brandId: string | null;
  readonly commandType: 'CUSTOMER' | 'DIAGNOSTIC';
  readonly status: CommandStatus;
  readonly failureCode: string | null;
}

@Injectable()
export class DspService {
  private readonly logger = new Logger('DSP');
  private readonly signer: CommandSigner;

  constructor(
    @Inject(DspQueries) private readonly queries: DspQueries,
    @Inject(OrdService) private readonly orders: OrdService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.signer = createCommandSigner(config.dispenseSigningKey);
  }

  /**
   * FR-DSP-01, FR-DSP-26: ghi lệnh CUSTOMER cho đơn PAID cũ nhất của mỗi máy đang rảnh.
   *
   * @returns số lệnh đã ghi
   */
  async armQueuedOrders(): Promise<number> {
    let armed = 0;
    for (const candidate of await this.queries.listArmableOrders()) {
      try {
        const created = await this.queries.transaction(async (tx) => {
          if (candidate.dosageMl === null) {
            // Slot mất hiệu chuẩn sau khi khách trả tiền: lệnh không có liều để gửi (mqtt.md §5).
            if (await this.orders.failBeforeDispense(tx, candidate.orderId, 'SLOT_UNAVAILABLE')) {
              this.logger.warn(
                `Đơn ${candidate.orderId} FAILED: slot ${candidate.slotNumber} máy ${candidate.machineSerial} chưa hiệu chuẩn`,
              );
            }
            return false;
          }
          const order = await this.orders.startDispense(tx, candidate.orderId);
          if (!order) return false;
          const now = this.clock.now();
          const draft: OutgoingCommand = {
            id: '',
            commandToken: `cmd_${randomUUID()}`,
            commandType: 'CUSTOMER',
            machineSerial: candidate.machineSerial,
            slotNumber: candidate.slotNumber,
            dosageMl: candidate.dosageMl,
            expiresAt: new Date(
              now.getTime() + this.config.constraint('DISPENSE_CMD_TTL_SEC') * 1000,
            ),
            createdAt: now,
          };
          await this.queries.insertCommand(
            {
              brandId: order.brandId,
              orderId: order.id,
              machineId: order.machineId,
              slotId: order.slotId,
              commandToken: draft.commandToken,
              signature: this.buildPayload(draft).signature,
              expiresAt: draft.expiresAt,
              createdAt: now,
            },
            tx,
          );
          this.logger.log(
            `Ghi lệnh ${draft.commandToken} cho đơn ${order.id} (máy ${candidate.machineSerial}, slot ${candidate.slotNumber})`,
          );
          return true;
        });
        if (created) armed++;
      } catch (error) {
        // Tiến trình khác vừa ghi lệnh cho cùng máy/đơn — unique index chặn, đơn chờ vòng sau.
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) continue;
        throw error;
      }
    }
    return armed;
  }

  /** Lệnh CREATED còn hạn, đã ký, chờ publish. */
  async listOutgoing(): Promise<CommandMessage[]> {
    const commands = await this.queries.listUnsentCommands(this.clock.now());
    return commands.map((command) => ({
      commandId: command.id,
      machineSerial: command.machineSerial,
      payload: this.buildPayload(command),
    }));
  }

  async markSent(message: CommandMessage): Promise<void> {
    await this.queries.markSent(message.commandId, message.payload.signature, this.clock.now());
  }

  /**
   * FR-DSP-11, FR-DSP-16, FR-DSP-17, FR-DSP-24: áp bản tin `command/result`. Gửi lại hay đến trễ đều
   * an toàn — trạng thái nguồn được kiểm dưới khóa hàng.
   *
   * @param machineSerial serial lấy từ TOPIC — lệnh phải thuộc đúng máy này
   */
  async handleDeviceResult(
    machineSerial: string,
    input: DeviceResultInput,
  ): Promise<DeviceResultHandling> {
    return this.queries.transaction(async (tx) => {
      const command = await this.queries.lockCommandByToken(machineSerial, input.commandToken, tx);
      if (!command) return 'UNKNOWN_COMMAND';
      const now = this.clock.now();
      const outcome = outcomeOf(input, command.acknowledgedAt !== null);
      if (outcome.kind === 'IGNORED') return 'IGNORED';

      if (outcome.kind === 'ACKNOWLEDGED') {
        if (!(ACKNOWLEDGEABLE_STATUSES as readonly string[]).includes(command.status)) {
          return 'IGNORED';
        }
        await this.queries.acknowledge(command.id, now, tx);
        return 'APPLIED';
      }

      if (!(CLOSABLE_STATUSES as readonly string[]).includes(command.status)) return 'IGNORED';
      await this.queries.close(command.id, outcome.commandStatus, now, tx);
      if (input.stage === 'RESULT') {
        await this.queries.insertResult(
          {
            commandId: command.id,
            brandId: command.brandId,
            success: input.success === true,
            resultCode: input.resultCode ?? null,
            failureCode: input.failureCode ?? null,
            executedAt: input.executedAt ?? null,
            measuredQuantityMl: input.measuredQuantityMl ?? null,
            sensorSnapshot: input.sensorSnapshot ?? null,
            rawPayload: input.raw,
            deviceEventId: input.deviceEventId ?? null,
          },
          tx,
        );
      }
      if (command.orderId) {
        await this.orders.finishDispense(tx, command.orderId, {
          ...outcome.order,
          resolvesUnknown: command.status === 'UNKNOWN',
          commandToken: input.commandToken,
          at: input.executedAt ?? now,
        });
      }
      // Kết quả đến trễ cho lệnh đã UNKNOWN thì lệnh đó đã được đếm lúc quét — không đếm hai lần.
      if (command.status !== 'UNKNOWN') {
        await this.afterCommandFinished(
          tx,
          { ...command, status: outcome.commandStatus, failureCode: outcome.order.failureCode },
          now,
        );
      }
      return 'APPLIED';
    });
  }

  /**
   * FR-DSP-18: lệnh không phản hồi đúng hạn → UNKNOWN + đơn cần kiểm tra thủ công. Lệnh UNKNOWN
   * không còn hiệu lực nên máy được nhận đơn tiếp theo; đơn của nó KHÔNG bao giờ được ghi lệnh mới
   * (FR-DSP-19) vì đơn đã rời PAID.
   *
   * Lệnh CREATED quá hạn mà chưa publish được (broker mất kết nối) → EXPIRED, đơn FAILED: thiết bị
   * chắc chắn chưa nhận nên không có nguy cơ xịt.
   *
   * @returns số lệnh đã xử lý
   */
  async sweepTimeouts(): Promise<number> {
    const now = this.clock.now();
    const stale = await this.queries.listStaleCommands(
      now,
      this.config.constraint('DISPENSE_RESULT_TIMEOUT_SEC'),
      this.config.constraint('DISPENSE_PRESS_WINDOW_SEC'),
    );
    let handled = 0;
    for (const command of stale) {
      const done = await this.queries.transaction(async (tx) => {
        if (!(await this.queries.lockIfStatus(command.id, command.status, tx))) return false;
        if (command.status === 'CREATED') {
          await this.queries.close(command.id, 'EXPIRED', now, tx);
          if (command.orderId) {
            await this.orders.finishDispense(tx, command.orderId, {
              to: 'FAILED',
              failureCode: 'CMD_EXPIRED',
              manualReview: true,
              commandToken: command.commandToken,
              at: now,
            });
          }
        } else {
          await this.queries.markUnknown(command.id, tx);
          if (command.orderId) await this.orders.flagOrderForReview(tx, command.orderId);
          await this.afterCommandFinished(
            tx,
            { ...command, status: 'UNKNOWN', failureCode: null },
            now,
          );
        }
        return true;
      });
      if (done) {
        handled++;
        this.logger.warn(
          `Lệnh ${command.commandToken} quá hạn ở ${command.status} → ${command.status === 'CREATED' ? 'EXPIRED' : 'UNKNOWN'}`,
        );
      }
    }
    return handled;
  }

  /**
   * FR-ORD-34 (ADR-0015 mục 2): đơn đã trả tiền chờ lượt quá PAID_QUEUE_MAX_SEC kể từ `paid_at` mà
   * chưa ghi được lệnh → FAILED `QUEUE_TIMEOUT` + kiểm tra thủ công; kiosk hiện màn sự cố kèm QR
   * khiếu nại. Quét theo `paid_at <= now - hạn` nên bù được đơn lỡ trong lúc hệ thống ngừng chạy.
   *
   * @returns số đơn đã chuyển FAILED
   */
  async failQueueTimeouts(): Promise<number> {
    const now = this.clock.now();
    const paidBefore = new Date(
      now.getTime() - this.config.constraint('PAID_QUEUE_MAX_SEC') * 1000,
    );
    const orderIds = await this.queries.listQueueTimedOutOrderIds(paidBefore, QUEUE_TIMEOUT_BATCH);
    let failed = 0;
    for (const orderId of orderIds) {
      // failBeforeDispense khóa đơn và chỉ đổi khi đơn còn PAID — vòng ghi lệnh vừa nhặt thì bỏ qua.
      const done = await this.queries.transaction((tx) =>
        this.orders.failBeforeDispense(tx, orderId, 'QUEUE_TIMEOUT'),
      );
      if (done) {
        failed++;
        this.logger.warn(`Đơn ${orderId} chờ lượt quá PAID_QUEUE_MAX_SEC → FAILED QUEUE_TIMEOUT`);
      }
    }
    return failed;
  }

  /**
   * FR-ALR-04, FR-MCH-18: gọi trong transaction đã khép lệnh. Lệnh CUSTOMER kết thúc bằng lỗi máy
   * có thể là lỗi thứ CONSECUTIVE_FAIL_ALERT liên tiếp của slot → cảnh báo + slot MAINTENANCE +
   * AuditLog. Lệnh thành công hoặc khách không bấm (PRESS_TIMEOUT) cắt chuỗi.
   */
  private async afterCommandFinished(
    tx: Kysely<DB>,
    command: FinishedCommand,
    now: Date,
  ): Promise<void> {
    if (command.commandType !== 'CUSTOMER') return;
    if (!isMachineFailure(command.status, command.failureCode)) return;

    const threshold = this.config.constraint('CONSECUTIVE_FAIL_ALERT');
    const since = await this.queries.lastAutoMaintenanceAt(
      command.slotId,
      SLOT_AUTO_MAINTENANCE_ACTION,
      tx,
    );
    const recent = await this.queries.listFinishedCustomerCommands(
      command.slotId,
      since,
      threshold,
      tx,
    );
    const streak =
      recent.length === threshold &&
      recent.every((c) => isMachineFailure(c.status, c.orderFailureCode));
    if (!streak) return;

    const changed = await this.queries.putSlotInMaintenance(command.slotId, tx);
    if (!changed) return;
    const tokens = recent.map((c) => c.commandToken);
    await this.queries.raiseConsecutiveFailAlert(
      {
        brandId: command.brandId,
        machineId: changed.machineId,
        slotId: command.slotId,
        title: `${threshold} lượt xịt lỗi liên tiếp — slot đã tự tắt`,
        description: `Slot ${command.slotId} chuyển MAINTENANCE sau các lệnh ${tokens.join(', ')} (FR-ALR-04, FR-MCH-18).`,
        at: now,
      },
      tx,
    );
    await this.audit.log(
      {
        actorType: 'SYSTEM',
        action: SLOT_AUTO_MAINTENANCE_ACTION,
        targetType: 'machine_slot',
        targetId: command.slotId,
        severity: 'HIGH',
        before: { status: changed.from },
        after: { status: 'MAINTENANCE' },
        metadata: { reason: 'CONSECUTIVE_FAIL_ALERT', threshold, commandTokens: tokens },
      },
      tx,
    );
    this.logger.warn(`Slot ${command.slotId}: ${threshold} lệnh lỗi liên tiếp → MAINTENANCE`);
  }

  private buildPayload(command: OutgoingCommand): CommandPayload {
    const unsigned = {
      schema_version: 1 as const,
      machine_serial: command.machineSerial,
      ts: command.createdAt.toISOString(),
      command_token: command.commandToken,
      command_type: 'DISPENSE' as const,
      dispense_type: command.commandType,
      slot_number: command.slotNumber,
      dosage_ml: command.dosageMl === null ? null : Number(command.dosageMl),
      expires_at: command.expiresAt.toISOString(),
    };
    return { ...unsigned, signature: this.signer.sign(unsigned) };
  }
}

/**
 * Lệnh kết thúc vì máy có vấn đề (FR-ALR-04): FAILED, UNKNOWN, hoặc REJECTED mà không phải do khách
 * không bấm. CMD_DUPLICATE không bao giờ khép lệnh nên không xuất hiện ở đây (ADR-0011).
 */
function isMachineFailure(status: CommandStatus, failureCode: string | null): boolean {
  if (status === 'FAILED' || status === 'UNKNOWN') return true;
  return status === 'REJECTED' && failureCode !== PRESS_TIMEOUT;
}

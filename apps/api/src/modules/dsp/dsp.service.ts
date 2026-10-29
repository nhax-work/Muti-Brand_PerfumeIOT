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
 *   completeDraining ─tx─▶ máy DRAINING hết việc → MAINTENANCE + thông báo Brand Admin (FR-MNT-05, 07)
 *
 * Mỗi lần lệnh CUSTOMER kết thúc bằng lỗi máy, cùng transaction đó đếm chuỗi lỗi liên tiếp trên slot;
 * đủ CONSECUTIVE_FAIL_ALERT thì cảnh báo và tự tắt slot (FR-ALR-04, FR-MCH-18, ADR-0015 mục 5).
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import type { Kysely } from 'kysely';
import { createCommandSigner, type CommandSigner } from '../../adapters/mqtt/command-signature.js';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import type { DB } from '../../shared/db/index.js';
import type { CommandStatus, Json } from '../../shared/db/types.generated.js';
import { AppError } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { OrdService } from '../ord/index.js';
import {
  ACKNOWLEDGEABLE_STATUSES,
  CLOSABLE_STATUSES,
  outcomeOf,
  PRESS_TIMEOUT,
  type DeviceStage,
} from './dispense-outcome.js';
import { DOSE_CONSUMER, type DoseConsumer } from './dose-consumption.port.js';
import {
  DspQueries,
  type CommandRecord,
  type CommandSearchFilter,
  type OutgoingCommand,
} from './dsp.queries.js';

type DispenseCommand = Schema<'DispenseCommand'>;

export interface DiagnosticDispenseInput {
  readonly slotId: string;
  readonly note?: string | undefined;
}

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
  readonly sensorSnapshot?: Json | null | undefined;
  readonly raw: Json;
}

export type DeviceResultHandling = 'APPLIED' | 'IGNORED' | 'UNKNOWN_COMMAND';

/** Mã lỗi Postgres khi vi phạm unique — ở đây là `uq_machine_active_customer_command`/`uq_order_active_command`. */
const UNIQUE_VIOLATION = '23505';

/** Hành động AuditLog khi slot tự tắt — cũng là mốc đếm lại chuỗi lỗi (DspQueries.lastAutoMaintenanceAt). */
export const SLOT_AUTO_MAINTENANCE_ACTION = 'dsp.slot.auto_maintenance';

/** Lý do ghi vào lịch sử trạng thái và AuditLog khi máy tự hết DRAINING (FR-MNT-05 AC2). */
const DRAINING_COMPLETED = 'DRAINING_COMPLETED';

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
    @Inject(DOSE_CONSUMER) private readonly inventory: DoseConsumer,
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
              commandType: 'CUSTOMER',
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

  /**
   * FR-MNT-09, FR-DSP-20, FR-DSP-27: lượt xịt chẩn đoán. Lệnh DIAGNOSTIC được ký và có TTL như lệnh
   * khách (FR-DSP-02..06) nhưng không gắn đơn nên không bao giờ vào doanh thu; thiết bị xịt ngay, không
   * chờ bấm nút (ADR-0007). Lệnh chỉ được ghi ở đây — vòng publish của `DspJobs` gửi đi như mọi lệnh
   * CREATED, kể cả khi máy đang MAINTENANCE (checklist sau bảo trì, FR-MNT-11).
   *
   * Lượt thành công trừ lượng còn lại qua `handleDeviceResult` như lượt khách (FR-INV-10 AC2).
   */
  async createDiagnostic(
    actor: AuthenticatedUser,
    machineId: string,
    input: DiagnosticDispenseInput,
  ): Promise<DispenseCommand> {
    const record = await this.queries.transaction(async (tx) => {
      const target = await this.queries.lockDiagnosticTarget(machineId, input.slotId, tx);
      if (!target) throw new AppError('NOT_FOUND', 'dsp.slotNotFound');
      if (target.machineStatus !== 'ONLINE') {
        throw new AppError('MACHINE_OFFLINE', 'dsp.machineOffline');
      }
      // Lệnh không có liều để gửi (mqtt.md §5) — cùng lý do armQueuedOrders đánh FAILED đơn khách.
      if (target.dosageMl === null) throw new AppError('SLOT_UNAVAILABLE', 'dsp.slotNotCalibrated');
      if (await this.queries.machineIsBusy(target.machineId, tx)) {
        throw new AppError('MACHINE_BUSY', 'dsp.machineBusy');
      }

      const now = this.clock.now();
      const draft: OutgoingCommand = {
        id: '',
        commandToken: `cmd_${randomUUID()}`,
        commandType: 'DIAGNOSTIC',
        machineSerial: target.machineSerial,
        slotNumber: target.slotNumber,
        dosageMl: target.dosageMl,
        expiresAt: new Date(now.getTime() + this.config.constraint('DISPENSE_CMD_TTL_SEC') * 1000),
        createdAt: now,
      };
      const commandId = await this.queries.insertCommand(
        {
          brandId: target.brandId,
          orderId: null,
          commandType: 'DIAGNOSTIC',
          machineId: target.machineId,
          slotId: target.slotId,
          commandToken: draft.commandToken,
          signature: this.buildPayload(draft).signature,
          expiresAt: draft.expiresAt,
          createdAt: now,
        },
        tx,
      );
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          action: 'dsp.diagnostic.created',
          targetType: 'dispense_command',
          targetId: commandId,
          severity: 'WARNING',
          after: { machineId: target.machineId, slotId: target.slotId, commandType: 'DIAGNOSTIC' },
          metadata: { commandToken: draft.commandToken, note: input.note ?? null },
        },
        tx,
      );
      const created = await this.queries.findCommandById(commandId, tx);
      if (!created) throw new Error(`Lệnh chẩn đoán ${commandId} vừa ghi đã không còn`);
      return created;
    });
    this.logger.log(
      `Ghi lệnh chẩn đoán ${record.commandToken} (máy ${machineId}, slot ${input.slotId})`,
    );
    return toCommandDto(record);
  }

  /** FR-DSP-20: danh sách lệnh trong phạm vi người gọi. */
  async searchCommands(
    scope: BrandScope,
    filter: CommandSearchFilter,
  ): Promise<{ items: DispenseCommand[]; total: number }> {
    const { items, total } = await this.queries.searchCommands(scope, filter);
    return { items: items.map(toCommandDto), total };
  }

  /** FR-DSP-16, FR-IOT-07: lệnh hiện tại của đơn — kiểm phạm vi trên chính đơn trước. */
  async getOrderCommand(
    actor: AuthenticatedUser,
    scope: BrandScope,
    orderId: string,
  ): Promise<DispenseCommand> {
    await this.orders.get(actor, scope, orderId);
    const command = await this.queries.findLatestCommandForOrder(orderId);
    if (!command) throw new AppError('NOT_FOUND', 'dsp.commandNotFound');
    return toCommandDto(command);
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
            sensorSnapshot: input.sensorSnapshot ?? null,
            rawPayload: input.raw,
            deviceEventId: input.deviceEventId ?? null,
          },
          tx,
        );
      }
      // FR-INV-10: lượt xịt đã thực sự diễn ra — kể cả kết quả đến trễ cho lệnh UNKNOWN.
      if (outcome.commandStatus === 'SUCCEEDED') {
        await this.inventory.consumeDose(tx, command.slotId, input.executedAt ?? now);
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
   * FR-MNT-05 AC2, AC3 (ADR-0015 mục 7): máy DRAINING không còn lệnh CUSTOMER hiệu lực, đơn chờ thanh
   * toán hay đơn chờ lượt → tự sang MAINTENANCE, ghi lịch sử nguồn SYSTEM, thông báo Brand Admin có
   * slot trên máy (FR-MNT-07) và AuditLog. Quét theo trạng thái trong CSDL nên bù được sau downtime;
   * máy vừa vào DRAINING mà đã rảnh thì chuyển ngay ở nhịp kế tiếp.
   *
   * @returns số máy đã chuyển
   */
  async completeDraining(): Promise<number> {
    let completed = 0;
    for (const machineId of await this.queries.listDrainedMachineIds()) {
      const done = await this.queries.transaction(async (tx) => {
        const machine = await this.queries.lockDrainedMachine(machineId, tx);
        if (!machine) return false;
        const now = this.clock.now();
        await this.queries.enterMaintenance(machine.id, DRAINING_COMPLETED, now, tx);
        const params = { machine: machine.displayName };
        for (const admin of await this.queries.listAffectedBrandAdmins(machine.id, tx)) {
          await this.queries.insertNotification(
            {
              brandId: admin.brandId,
              recipientUserId: admin.userId,
              type: 'MACHINE_MAINTENANCE',
              subject: translate(DEFAULT_LOCALE, 'dsp.maintenanceSubject', params),
              content: translate(DEFAULT_LOCALE, 'dsp.maintenanceContent', params),
              at: now,
            },
            tx,
          );
        }
        await this.audit.log(
          {
            actorType: 'SYSTEM',
            action: 'dsp.machine.draining_completed',
            targetType: 'machine',
            targetId: machine.id,
            severity: 'WARNING',
            before: { operatingMode: 'DRAINING' },
            after: { operatingMode: 'MAINTENANCE' },
            metadata: { reason: DRAINING_COMPLETED },
          },
          tx,
        );
        return true;
      });
      if (done) {
        completed++;
        this.logger.log(`Máy ${machineId} hết đơn → DRAINING sang MAINTENANCE`);
      }
    }
    return completed;
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

function toCommandDto(c: CommandRecord): DispenseCommand {
  return {
    id: c.id,
    orderId: c.orderId,
    brandId: c.brandId,
    machineId: c.machineId,
    slotId: c.slotId,
    commandType: c.commandType,
    commandToken: c.commandToken,
    status: c.status,
    expiresAt: c.expiresAt.toISOString(),
    sentAt: c.sentAt?.toISOString() ?? null,
    acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    retryCount: c.retryCount,
    createdAt: c.createdAt.toISOString(),
    result: c.result && {
      commandId: c.id,
      success: c.result.success,
      resultCode: c.result.resultCode,
      failureCode: c.result.failureCode,
      executedAt: c.result.executedAt?.toISOString() ?? null,
      receivedAt: c.result.receivedAt.toISOString(),
    },
  };
}

/**
 * Lệnh kết thúc vì máy có vấn đề (FR-ALR-04): FAILED, UNKNOWN, hoặc REJECTED mà không phải do khách
 * không bấm. CMD_DUPLICATE không bao giờ khép lệnh nên không xuất hiện ở đây (ADR-0011).
 */
function isMachineFailure(status: CommandStatus, failureCode: string | null): boolean {
  if (status === 'FAILED' || status === 'UNKNOWN') return true;
  return status === 'REJECTED' && failureCode !== PRESS_TIMEOUT;
}

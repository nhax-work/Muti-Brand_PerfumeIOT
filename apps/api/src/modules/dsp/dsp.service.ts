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
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createCommandSigner, type CommandSigner } from '../../adapters/mqtt/command-signature.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import type { Json } from '../../shared/db/types.generated.js';
import { OrdService } from '../ord/index.js';
import {
  ACKNOWLEDGEABLE_STATUSES,
  CLOSABLE_STATUSES,
  outcomeOf,
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

@Injectable()
export class DspService {
  private readonly logger = new Logger('DSP');
  private readonly signer: CommandSigner;

  constructor(
    @Inject(DspQueries) private readonly queries: DspQueries,
    @Inject(OrdService) private readonly orders: OrdService,
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
          commandToken: input.commandToken,
          at: input.executedAt ?? now,
        });
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

/**
 * Cửa vào MQTT của DSP (ADR-0003): dịch bản tin ↔ dữ liệu rồi gọi DspService, không chứa nghiệp vụ.
 *
 *   publish   scentstation/{serial}/command         QoS 1, không retain (mqtt.md §1 — chống xịt lại
 *                                                    lệnh cũ khi thiết bị khởi động lại)
 *   subscribe scentstation/+/command/result         QoS 1
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { MqttClientAdapter } from '../../adapters/mqtt/mqtt.client.js';
import { allDevicesTopic, deviceTopic, serialFromTopic } from '../../adapters/mqtt/topics.js';
import type { Json } from '../../shared/db/types.generated.js';
import { DspService, type CommandMessage } from './dsp.service.js';

/**
 * Hình dạng `command/result` (mqtt.md §6). Mốc thời gian nhận chuỗi rồi tự đọc: thiết bị chưa đồng
 * bộ NTP gửi mốc hỏng thì vẫn khép được lệnh, chỉ mất `executed_at`.
 */
const CommandResultMessage = z.object({
  machine_serial: z.string().min(1).max(100),
  command_token: z.string().min(1).max(255),
  stage: z.enum(['ACK', 'REJECT', 'RESULT']),
  success: z.boolean().optional(),
  failure_code: z.string().max(100).nullish(),
  result_code: z.string().max(100).nullish(),
  executed_at: z.string().max(64).nullish(),
  device_event_id: z.string().max(150).nullish(),
  measured_quantity_ml: z.number().finite().nullish(),
  sensor_snapshot: z.record(z.unknown()).nullish(),
});

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

@Injectable()
export class DspMqttGateway {
  private readonly logger = new Logger('DSP/MQTT');

  constructor(
    @Inject(MqttClientAdapter) private readonly mqtt: MqttClientAdapter,
    @Inject(DspService) private readonly dsp: DspService,
  ) {}

  get connected(): boolean {
    return this.mqtt.connected;
  }

  start(): void {
    this.mqtt.subscribe(allDevicesTopic('command/result'), 1, (topic, payload) =>
      this.onCommandResult(topic, payload),
    );
  }

  async publishCommand(message: CommandMessage): Promise<void> {
    await this.mqtt.publish(deviceTopic(message.machineSerial, 'command'), message.payload, {
      qos: 1,
      retain: false,
    });
    this.logger.log(
      `→ ${message.machineSerial} slot ${message.payload.slot_number} (${message.payload.command_token})`,
    );
  }

  private async onCommandResult(topic: string, payload: Buffer): Promise<void> {
    const serial = serialFromTopic(topic, 'command/result');
    if (!serial) return;

    let raw: unknown;
    try {
      raw = JSON.parse(payload.toString('utf8'));
    } catch {
      this.logger.warn(`Bỏ bản tin không phải JSON trên ${topic}`);
      return;
    }
    const parsed = CommandResultMessage.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn(
        `Bỏ bản tin sai hình dạng trên ${topic}: ${parsed.error.issues[0]?.message}`,
      );
      return;
    }
    const message = parsed.data;
    // Máy chỉ được báo trên topic của chính nó (mqtt.md §8 ACL) — payload nói khác thì bỏ.
    if (message.machine_serial !== serial) {
      this.logger.warn(
        `Bỏ bản tin: topic ${serial} nhưng machine_serial ${message.machine_serial}`,
      );
      return;
    }

    const handled = await this.dsp.handleDeviceResult(serial, {
      commandToken: message.command_token,
      stage: message.stage,
      success: message.success,
      failureCode: message.failure_code,
      resultCode: message.result_code,
      executedAt: parseInstant(message.executed_at),
      deviceEventId: message.device_event_id,
      measuredQuantityMl: message.measured_quantity_ml,
      sensorSnapshot: (message.sensor_snapshot ?? null) as Json | null,
      raw: raw as Json,
    });
    const detail = message.failure_code ? ` ${message.failure_code}` : '';
    this.logger.log(`← ${serial} ${message.stage}${detail} (${message.command_token}): ${handled}`);
  }
}

/**
 * Cửa vào scheduler của DSP (ADR-0003): một nhịp = ghi lệnh cho đơn chờ → publish lệnh chưa gửi →
 * quét lệnh quá hạn. `entrypoints/scheduler.ts` quyết định chu kỳ.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DspMqttGateway } from './dsp.mqtt.js';
import { DspService } from './dsp.service.js';

@Injectable()
export class DspJobs {
  private readonly logger = new Logger('DSP/jobs');
  private running = false;

  constructor(
    @Inject(DspService) private readonly dsp: DspService,
    @Inject(DspMqttGateway) private readonly gateway: DspMqttGateway,
  ) {}

  /** Bỏ qua nếu nhịp trước chưa xong — tránh hai nhịp cùng publish một lệnh. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Broker mất kết nối thì không ghi lệnh mới: đơn giữ PAID "chờ lượt" thay vì sinh lệnh rồi
      // để nó EXPIRED và đẩy đơn sang FAILED.
      if (this.gateway.connected) {
        await this.dsp.armQueuedOrders();
        for (const message of await this.dsp.listOutgoing()) {
          try {
            await this.gateway.publishCommand(message);
            await this.dsp.markSent(message);
          } catch (error) {
            this.logger.error(`Publish ${message.payload.command_token} lỗi: ${describe(error)}`);
          }
        }
      }
      await this.dsp.sweepTimeouts();
    } catch (error) {
      this.logger.error(`Nhịp điều phối lỗi: ${describe(error)}`);
    } finally {
      this.running = false;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

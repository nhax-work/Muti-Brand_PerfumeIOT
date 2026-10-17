/**
 * Cửa vào scheduler của DSP (ADR-0003): một nhịp = hủy đơn chờ lượt quá hạn → ghi lệnh cho đơn chờ →
 * publish lệnh chưa gửi → quét lệnh quá hạn. `entrypoints/scheduler.ts` quyết định chu kỳ.
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
  async tick(allowDispatch = true): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Trước khi ghi lệnh: đơn chờ lượt đã quá PAID_QUEUE_MAX_SEC thì khách đã đứng chờ quá lâu —
      // FAILED + kiểm tra thủ công, không sáng đèn cho người có thể đã bỏ đi (FR-ORD-34). Chạy cả khi
      // broker mất kết nối: đó chính là lúc đơn bị kẹt.
      await this.dsp.failQueueTimeouts();
      // Broker mất kết nối thì không ghi lệnh mới: đơn giữ PAID "chờ lượt" thay vì sinh lệnh rồi
      // để nó EXPIRED và đẩy đơn sang FAILED.
      if (this.gateway.connected && allowDispatch) {
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

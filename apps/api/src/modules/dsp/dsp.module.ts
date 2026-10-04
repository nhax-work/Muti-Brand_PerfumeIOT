import { Module } from '@nestjs/common';
import { OrdModule } from '../ord/index.js';
import { DspJobs } from './dsp.jobs.js';
import { DspMqttGateway } from './dsp.mqtt.js';
import { DspQueries } from './dsp.queries.js';
import { DspService } from './dsp.service.js';

/**
 * Chưa có controller HTTP: `GET /orders/{id}/dispense-command`, `/dispense-commands` và lệnh chẩn
 * đoán thuộc tuần 5. MqttClientAdapter đến từ MqttModule (@Global) mà AppModule import.
 */
@Module({
  imports: [OrdModule],
  providers: [DspQueries, DspService, DspMqttGateway, DspJobs],
  exports: [DspService, DspMqttGateway, DspJobs],
})
export class DspModule {}

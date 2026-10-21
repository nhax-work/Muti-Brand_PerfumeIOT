import { Module } from '@nestjs/common';
import { OrdModule } from '../ord/index.js';
import { DiagnosticDispenseController, DispenseCommandsController } from './dsp.http.js';
import { DspJobs } from './dsp.jobs.js';
import { DspMqttGateway } from './dsp.mqtt.js';
import { DspQueries } from './dsp.queries.js';
import { DspService } from './dsp.service.js';

/** MqttClientAdapter đến từ MqttModule (@Global) mà AppModule import. */
@Module({
  imports: [OrdModule],
  controllers: [DiagnosticDispenseController, DispenseCommandsController],
  providers: [DspQueries, DspService, DspMqttGateway, DspJobs],
  exports: [DspService, DspMqttGateway, DspJobs],
})
export class DspModule {}

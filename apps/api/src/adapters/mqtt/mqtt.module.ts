import { Global, Module } from '@nestjs/common';
import { MqttClientAdapter } from './mqtt.client.js';

/** Một kết nối broker cho cả tiến trình — module DSP, IOT dùng chung. */
@Global()
@Module({
  providers: [MqttClientAdapter],
  exports: [MqttClientAdapter],
})
export class MqttModule {}

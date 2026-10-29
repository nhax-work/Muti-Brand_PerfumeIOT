import { Module } from '@nestjs/common';
import { MchModule } from '../mch/index.js';
import { IotController } from './iot.http.js';
import { IotMqttGateway } from './iot.mqtt.js';
import { IotQueries } from './iot.queries.js';
import { IotService } from './iot.service.js';

/** MchModule: phản hồi đẩy cấu hình là `Machine` dựng bằng MchService. MCH không import IOT. */
@Module({
  imports: [MchModule],
  controllers: [IotController],
  providers: [IotService, IotMqttGateway, IotQueries],
  exports: [IotService, IotMqttGateway],
})
export class IotModule {}

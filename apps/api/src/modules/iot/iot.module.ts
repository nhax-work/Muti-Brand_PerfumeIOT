import { Module } from '@nestjs/common';
import { IotMqttGateway } from './iot.mqtt.js';
import { IotService } from './iot.service.js';

@Module({ providers: [IotService, IotMqttGateway], exports: [IotService, IotMqttGateway] })
export class IotModule {}

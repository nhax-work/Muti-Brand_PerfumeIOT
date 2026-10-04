/**
 * Cửa vào HTTP (ADR-0003). Cửa vào MQTT (`mqtt.ts`) và scheduler (`scheduler.ts`) hiện chạy chung
 * tiến trình này và dùng chung các service của từng module.
 */

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';
import { APP_CONFIG, type AppConfig } from '../shared/config/index.js';
import { loadEnvFile } from '../shared/config/env-file.js';
import { startMqtt } from './mqtt.js';
import { startScheduler } from './scheduler.js';

// Phải chạy TRƯỚC khi Nest dựng CoreModule, vì loadConfig() đọc process.env lúc khởi tạo.
loadEnvFile();

async function bootstrap(): Promise<void> {
  // rawBody: webhook thanh toán kiểm chữ ký trên đúng byte nhận được (FR-ORD-13).
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    rawBody: true,
  });
  // Khớp `servers` trong spec/contracts/openapi.yaml.
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port, '0.0.0.0');

  if (config.mqttUrl) {
    startMqtt(app, config.mqttUrl);
  } else {
    new Logger('Bootstrap').warn('MQTT_URL trống — không gửi lệnh xịt xuống máy (chỉ chạy HTTP).');
  }
  const stopScheduler = startScheduler(app, { dispense: config.mqttUrl !== null });
  process.once('SIGTERM', stopScheduler);
  process.once('SIGINT', stopScheduler);
}

void bootstrap();

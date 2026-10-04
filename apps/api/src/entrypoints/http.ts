/**
 * Cửa vào HTTP (ADR-0003). Cửa vào MQTT và scheduler sẽ nằm cạnh file này và dùng chung các
 * service của từng module.
 */

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';
import { APP_CONFIG, type AppConfig } from '../shared/config/index.js';
import { loadEnvFile } from '../shared/config/env-file.js';
import { registerSwagger, SWAGGER_ROUTE } from './swagger.js';

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
  // Plugin Fastify phải đăng ký TRƯỚC listen.
  if (config.swaggerEnabled) await registerSwagger(app);
  await app.listen(config.port, '0.0.0.0');

  if (config.swaggerEnabled) {
    new Logger('Swagger').log(`Tài liệu API: http://localhost:${config.port}${SWAGGER_ROUTE}`);
  }
}

void bootstrap();

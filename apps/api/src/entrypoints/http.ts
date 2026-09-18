/**
 * Cửa vào HTTP (ADR-0003). Cửa vào MQTT và scheduler sẽ nằm cạnh file này và dùng chung các
 * service của từng module.
 */

import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';
import { APP_CONFIG, type AppConfig } from '../shared/config/index.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  // Khớp `servers` trong spec/contracts/openapi.yaml.
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();

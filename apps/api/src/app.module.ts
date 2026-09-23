import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CoreModule } from './core.module.js';
import { AuthModule } from './modules/auth/index.js';
import { BndModule } from './modules/bnd/index.js';
import { PrdModule } from './modules/prd/index.js';
import { UsrModule } from './modules/usr/index.js';
import { MchModule } from './modules/mch/index.js';
import { RptModule } from './modules/rpt/index.js';
import { ApiExceptionFilter } from './shared/http/exception.filter.js';

@Module({
  imports: [CoreModule, AuthModule, BndModule, PrdModule, UsrModule, MchModule, RptModule],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}


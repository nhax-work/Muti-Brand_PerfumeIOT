import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CoreModule } from './core.module.js';
import { AuthModule } from './modules/auth/index.js';
import { BndModule } from './modules/bnd/index.js';
import { MchModule } from './modules/mch/index.js';
import { OrdModule, PaymentModule } from './modules/ord/index.js';
import { PrdModule } from './modules/prd/index.js';
import { RptModule } from './modules/rpt/index.js';
import { SltCheckoutPaymentModule, SltModule } from './modules/slt/index.js';
import { UsrModule } from './modules/usr/index.js';
import { ApiExceptionFilter } from './shared/http/exception.filter.js';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    BndModule,
    PrdModule,
    UsrModule,
    MchModule,
    RptModule,
    SltModule,
    // Thanh toán dùng chung (@Global) + handler phiên thuê slot của SLT (@Global) — ADR-0008.
    PaymentModule,
    SltCheckoutPaymentModule,
    OrdModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}

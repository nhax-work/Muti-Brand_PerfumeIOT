import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EmailModule } from './adapters/email/index.js';
import { MqttModule } from './adapters/mqtt/index.js';
import { CoreModule } from './core.module.js';
import { AlrModule } from './modules/alr/index.js';
import { AudModule } from './modules/aud/index.js';
import { AuthModule } from './modules/auth/index.js';
import { BndModule } from './modules/bnd/index.js';
import { DspModule } from './modules/dsp/index.js';
import { MchModule } from './modules/mch/index.js';
import { InvDoseConsumptionModule, InvModule } from './modules/inv/index.js';
import { IotModule } from './modules/iot/iot.module.js';
import { ExpModule } from './modules/exp/index.js';
import { MntModule } from './modules/mnt/index.js';
import { OrdModule, PaymentModule } from './modules/ord/index.js';
import { PrdModule } from './modules/prd/index.js';
import { RevModule } from './modules/rev/index.js';
import { RfqModule } from './modules/rfq/index.js';
import { RptModule } from './modules/rpt/index.js';
import { SltCheckoutPaymentModule, SltModule } from './modules/slt/index.js';
import { UsrModule } from './modules/usr/index.js';
import { ApiExceptionFilter } from './shared/http/exception.filter.js';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    AlrModule,
    BndModule,
    PrdModule,
    UsrModule,
    MchModule,
    InvModule,
    RfqModule,
    RptModule,
    RevModule,
    SltModule,
    MntModule,
    ExpModule,
    // Thanh toán dùng chung (@Global) + handler phiên thuê slot của SLT (@Global) — ADR-0008.
    PaymentModule,
    SltCheckoutPaymentModule,
    OrdModule,
    // Kết nối broker dùng chung (@Global) — chỉ kết nối khi entrypoints/mqtt.ts gọi connect().
    MqttModule,
    // Kênh gửi email dùng chung (@Global) — ALR và AUTH (ADR-0017 mục 4).
    EmailModule,
    // Trừ lượng sau lượt xịt thành công (@Global) — DSP gọi qua cổng DOSE_CONSUMER (ADR-0019).
    InvDoseConsumptionModule,
    DspModule,
    IotModule,
    // Truy vết đơn (FR-AUD-11) — đọc qua ORD và SLT, không module nào phụ thuộc ngược.
    AudModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}

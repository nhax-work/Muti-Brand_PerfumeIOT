import { Module } from '@nestjs/common';
import { KioskController, OrdersController } from './ord.http.js';
import { OrdQueries } from './ord.queries.js';
import { OrdService } from './ord.service.js';
import { PaymentWebhookController } from './payment/payment-webhook.http.js';
import { PaymentWebhookService } from './payment/payment-webhook.service.js';

/**
 * PaymentModule (cổng, bảng payments) và handler phiên thuê slot của SLT đều là module @Global,
 * được AppModule import — OrdModule không import SltModule, nên không có vòng ORD ↔ SLT.
 */
@Module({
  controllers: [KioskController, OrdersController, PaymentWebhookController],
  providers: [OrdQueries, OrdService, PaymentWebhookService],
  exports: [OrdService],
})
export class OrdModule {}

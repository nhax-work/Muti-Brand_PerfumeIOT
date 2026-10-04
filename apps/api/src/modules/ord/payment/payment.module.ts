/**
 * Hạ tầng thanh toán dùng chung: cổng (mock / sandbox), bảng `payments`, `payment_events`.
 *
 * @Global vì CẢ ORD lẫn SLT cần nó (ADR-0008): SLT tạo thanh toán cho phiên thuê slot (FR-SLT-37),
 * ORD tạo thanh toán cho đơn kiosk và nhận webhook. Để ở module riêng thay vì trong OrdModule thì SLT
 * không phải import OrdModule — tránh vòng phụ thuộc ORD ↔ SLT.
 */

import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/index.js';
import { MockPaymentGateway } from './mock-gateway.js';
import { PAYMENT_GATEWAYS, PaymentGatewayRegistry } from './payment-gateway.js';
import { PaymentQueries } from './payment.queries.js';
import { PaymentService } from './payment.service.js';

@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAYS,
      inject: [APP_CONFIG],
      // Tuần 6: thêm cổng sandbox vào mảng này; PAYMENT_PROVIDER chọn cổng tạo thanh toán mới.
      useFactory: (config: AppConfig) =>
        new PaymentGatewayRegistry(
          [new MockPaymentGateway(config.paymentWebhookSecret)],
          config.paymentProvider,
        ),
    },
    PaymentQueries,
    PaymentService,
  ],
  exports: [PAYMENT_GATEWAYS, PaymentQueries, PaymentService],
})
export class PaymentModule {}

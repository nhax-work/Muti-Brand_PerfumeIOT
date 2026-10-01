/**
 * `POST /webhooks/payments/{provider}` (FR-ORD-12, openapi `handlePaymentWebhook`).
 *
 * Cần body THÔ: chữ ký tính trên đúng byte cổng gửi, JSON parse rồi serialize lại có thể khác thứ
 * tự khóa hay khoảng trắng và làm chữ ký sai. `NestFactory.create(..., { rawBody: true })` ở
 * entrypoints/http.ts (và helper test) giữ lại `request.rawBody`.
 */

import { Controller, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { Public } from '../../auth/index.js';
import { PaymentWebhookService } from './payment-webhook.service.js';

interface RawBodyRequest {
  readonly rawBody?: Buffer;
  readonly headers: Record<string, string | string[] | undefined>;
}

@Controller('webhooks/payments')
@Public()
export class PaymentWebhookController {
  constructor(@Inject(PaymentWebhookService) private readonly service: PaymentWebhookService) {}

  /** 200 cả khi đã xử lý trước đó — trả 4xx làm cổng gửi lại vô hạn (spec/errors.md). */
  @Post(':provider')
  @HttpCode(200)
  async handle(@Param('provider') provider: string, @Req() request: RawBodyRequest) {
    if (!request.rawBody) {
      throw new Error('Thiếu request.rawBody — NestFactory.create phải bật { rawBody: true }');
    }
    const result = await this.service.handle(provider, request.rawBody, request.headers);
    return { result };
  }
}

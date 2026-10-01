/**
 * Cổng thanh toán giả (PAYMENT_PROVIDER=mock) — cho dev, test tích hợp, Integration Day và E2E
 * Gate 3 khi chưa có sandbox (tuần 6).
 *
 * Giao thức do nhóm tự định, cố ý giống cổng thật ở hai điểm quan trọng để code webhook không phải
 * viết lại khi đổi cổng:
 *   - Chữ ký HMAC-SHA256 trên ĐÚNG các byte của body, header `X-Mock-Signature: sha256=<hex>`,
 *     khóa là PAYMENT_WEBHOOK_SECRET (FR-ORD-13).
 *   - Mỗi sự kiện có `eventId` riêng; gửi lại cùng sự kiện thì cùng `eventId` (FR-ORD-15).
 *
 * Giả lập khách trả tiền: `npm run pay:mock -- <mã tham chiếu>` (scripts/mock-pay.ts), hoặc tự dựng
 * body bằng `buildMockWebhook` + `signMockPayload` bên dưới.
 *
 * KHÔNG dùng ở production — `loadConfig()` từ chối khởi động nếu APP_ENV=production mà
 * PAYMENT_PROVIDER=mock.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type {
  CreatedPayment,
  CreatePaymentRequest,
  PaymentGateway,
  WebhookHeaders,
  WebhookVerification,
} from './payment-gateway.js';

export const MOCK_PROVIDER = 'mock';
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/** Body webhook của cổng mock. */
export const MockWebhookBody = z.object({
  eventId: z.string().min(1).max(200),
  reference: z.string().min(1).max(200),
  transactionId: z.string().min(1).max(200),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.string().length(3),
  occurredAt: z.string().datetime({ offset: true }),
});
export type MockWebhookBody = z.infer<typeof MockWebhookBody>;

/** `sha256=<hex>` của body — đúng giá trị phải đặt vào header `X-Mock-Signature`. */
export function signMockPayload(secret: string, rawBody: string | Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/** Dựng body webhook mock; các trường không truyền thì sinh mới. */
export function buildMockWebhook(
  input: Pick<MockWebhookBody, 'reference' | 'amount' | 'currency'> &
    Partial<Omit<MockWebhookBody, 'reference' | 'amount' | 'currency'>>,
): MockWebhookBody {
  return {
    eventId: input.eventId ?? `evt_${randomUUID()}`,
    transactionId: input.transactionId ?? `txn_${randomUUID()}`,
    status: input.status ?? 'SUCCEEDED',
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    reference: input.reference,
    amount: input.amount,
    currency: input.currency,
  };
}

export class MockPaymentGateway implements PaymentGateway {
  readonly provider = MOCK_PROVIDER;

  /** @param webhookSecret `null` thì mọi webhook bị coi là sai chữ ký. */
  constructor(private readonly webhookSecret: string | null) {}

  async createPayment(request: CreatePaymentRequest): Promise<CreatedPayment> {
    // Chuỗi đọc được bằng mắt để kiosk và người thử hiểu ngay; cổng thật trả chuỗi VietQR/EMVCo.
    const qrPayload = [
      'SCENTSTATION-MOCK',
      request.reference,
      request.amount,
      request.currency,
      request.expiresAt.toISOString(),
    ].join('|');
    return {
      qrPayload,
      checkoutUrl: null,
      raw: { provider: MOCK_PROVIDER, qrPayload, reference: request.reference },
    };
  }

  verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): WebhookVerification {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { kind: 'MALFORMED', payload: null, reason: 'Body không phải JSON' };
    }

    const header = headers[MOCK_SIGNATURE_HEADER];
    const received = Array.isArray(header) ? header[0] : header;
    if (
      !this.webhookSecret ||
      !received ||
      !safeEqual(received, signMockPayload(this.webhookSecret, rawBody))
    ) {
      return { kind: 'INVALID_SIGNATURE', payload };
    }

    const parsed = MockWebhookBody.safeParse(payload);
    if (!parsed.success) {
      return {
        kind: 'MALFORMED',
        payload,
        reason: parsed.error.issues.map((i) => i.path.join('.')).join(', '),
      };
    }
    return {
      kind: 'VERIFIED',
      payload,
      event: { ...parsed.data, occurredAt: new Date(parsed.data.occurredAt) },
    };
  }
}

/** So chữ ký trong thời gian hằng — không để lộ độ dài đoạn khớp qua thời gian phản hồi. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

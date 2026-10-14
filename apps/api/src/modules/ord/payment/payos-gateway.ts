/**
 * Cổng PayOS (PAYMENT_PROVIDER=payos, ADR-0016) — chuyển khoản VietQR, dùng chung cho đơn kiosk và
 * phiên thuê slot.
 *
 * Theo tài liệu API chính thức (payos.vn/docs):
 *   - Tạo link: `POST /v2/payment-requests`, header `x-client-id`, `x-api-key`; chữ ký HMAC-SHA256
 *     (khóa checksum) trên `amount=…&cancelUrl=…&description=…&orderCode=…&returnUrl=…`.
 *   - Webhook: chữ ký nằm trong body (`signature`), tính trên `data` — khóa sắp xếp theo thứ tự chữ
 *     cái, null → chuỗi rỗng, nối `key=value` bằng `&`, HMAC-SHA256 hex.
 *   - Không có sandbox: chỉ có API thật. Kiểm thử xem docs/PAYOS.md.
 *
 * `orderCode` của PayOS là số nguyên nên adapter tự sinh và trả về làm `providerReference`; mã
 * `ORD-…` / `CHK-…` của hệ thống vẫn là thứ khách và Brand Admin nhìn thấy.
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PayosConfig } from '../../../shared/config/index.js';
import { toMinorUnits } from './money.js';
import type {
  CreatedPayment,
  CreatePaymentRequest,
  PaymentGateway,
  WebhookHeaders,
  WebhookVerification,
} from './payment-gateway.js';

export const PAYOS_PROVIDER = 'payos';

/** Giới hạn mô tả của tài khoản ngân hàng không liên kết qua PayOS. */
const DESCRIPTION_MAX = 9;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Tài khoản ngân hàng của NGƯỜI CHUYỂN — PayOS gửi kèm webhook. Không được lưu (NFR-DAT-04, ADR-0012
 * quy tắc 8): bỏ khỏi dữ liệu trước khi tầng webhook ghi `payment_events`.
 */
const PAYER_ACCOUNT_FIELDS = [
  'counterAccountBankId',
  'counterAccountBankName',
  'counterAccountName',
  'counterAccountNumber',
] as const;

const WebhookData = z.object({
  orderCode: z.number().int().positive(),
  amount: z.number().int().nonnegative(),
  reference: z.string().min(1),
  transactionDateTime: z.string().min(1),
  currency: z.string().length(3),
  code: z.string(),
});

const WebhookBody = z.object({
  code: z.string(),
  success: z.boolean(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string().min(1),
});

const CreateResponse = z.object({
  code: z.string(),
  desc: z.string().optional(),
  data: z
    .object({
      qrCode: z.string().min(1),
      checkoutUrl: z.string().min(1),
      paymentLinkId: z.string().min(1),
      status: z.string().optional(),
    })
    .nullable()
    .optional(),
});

/** Chuỗi ký dữ liệu theo quy tắc PayOS: khóa sắp xếp, null → rỗng, mảng/đối tượng → JSON. */
export function payosSignatureOf(data: Record<string, unknown>, checksumKey: string): string {
  const canonical = Object.keys(data)
    .sort()
    .map((key) => {
      const value = data[key];
      if (value === null || value === undefined || value === 'null' || value === 'undefined') {
        return `${key}=`;
      }
      return `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`;
    })
    .join('&');
  return createHmac('sha256', checksumKey).update(canonical).digest('hex');
}

export class PayosPaymentGateway implements PaymentGateway {
  readonly provider = PAYOS_PROVIDER;

  constructor(
    private readonly config: PayosConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  async createPayment(request: CreatePaymentRequest): Promise<CreatedPayment> {
    const amount = wholeVnd(request.amount);
    const orderCode = newOrderCode();
    const description = shortDescription(request.reference);
    const body = {
      orderCode,
      amount,
      description,
      cancelUrl: this.config.cancelUrl,
      returnUrl: this.config.returnUrl,
      // Quá hạn đơn / hạn giữ chỗ thì PayOS từ chối nhận tiền (P0-3 bản rà soát).
      expiredAt: Math.floor(request.expiresAt.getTime() / 1000),
      signature: payosSignatureOf(
        {
          amount,
          cancelUrl: this.config.cancelUrl,
          description,
          orderCode,
          returnUrl: this.config.returnUrl,
        },
        this.config.checksumKey,
      ),
    };

    const response = await this.http(`${this.config.baseUrl}/v2/payment-requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-id': this.config.clientId,
        'x-api-key': this.config.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const parsed = CreateResponse.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success || parsed.data.code !== '00' || !parsed.data.data) {
      const reason = parsed.success
        ? `${parsed.data.code} ${parsed.data.desc ?? ''}`
        : 'phản hồi lạ';
      throw new Error(`PayOS từ chối tạo link thanh toán (HTTP ${response.status}): ${reason}`);
    }

    const { qrCode, checkoutUrl, paymentLinkId } = parsed.data.data;
    return {
      providerReference: String(orderCode),
      qrPayload: qrCode,
      checkoutUrl,
      raw: { provider: PAYOS_PROVIDER, orderCode, paymentLinkId, reference: request.reference },
    };
  }

  verifyWebhook(rawBody: Buffer, _headers: WebhookHeaders): WebhookVerification {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { kind: 'MALFORMED', payload: null, reason: 'Body không phải JSON' };
    }

    const body = WebhookBody.safeParse(payload);
    if (!body.success) {
      return { kind: 'INVALID_SIGNATURE', payload: withoutPayerAccount(payload) };
    }
    const expected = payosSignatureOf(body.data.data, this.config.checksumKey);
    if (!safeEqual(body.data.signature, expected)) {
      return { kind: 'INVALID_SIGNATURE', payload: withoutPayerAccount(payload) };
    }

    const stored = withoutPayerAccount(payload);
    const data = WebhookData.safeParse(body.data.data);
    const occurredAt = data.success ? vietnamTime(data.data.transactionDateTime) : null;
    if (!data.success || !occurredAt) {
      return {
        kind: 'MALFORMED',
        payload: stored,
        reason: data.success
          ? 'transactionDateTime'
          : data.error.issues.map((i) => i.path.join('.')).join(', '),
      };
    }

    const succeeded = body.data.success && body.data.code === '00' && data.data.code === '00';
    return {
      kind: 'VERIFIED',
      payload: stored,
      event: {
        // Cùng giao dịch ngân hàng gửi lại thì cùng khóa (FR-ORD-15).
        eventId: `${data.data.orderCode}:${data.data.reference}`,
        reference: String(data.data.orderCode),
        transactionId: data.data.reference,
        status: succeeded ? 'SUCCEEDED' : 'FAILED',
        amount: String(data.data.amount),
        currency: data.data.currency,
        occurredAt,
      },
    };
  }
}

/** PayOS chỉ nhận số nguyên VND. */
function wholeVnd(amount: string): number {
  const minor = toMinorUnits(amount);
  if (minor === null || minor % 10_000n !== 0n) {
    throw new Error(`PayOS chỉ nhận số tiền nguyên VND, nhận được ${amount}`);
  }
  return Number(minor / 10_000n);
}

/** Số nguyên dương duy nhất < 2^53: mili giây × 1000 + ngẫu nhiên — uq_payment_provider_reference chặn trùng. */
function newOrderCode(): number {
  return Date.now() * 1000 + randomInt(1000);
}

/** 3 ký tự đầu + 6 ký tự cuối của mã hệ thống, chỉ chữ và số: `ORD-20261014-ABC123` → `ORDABC123`. */
export function shortDescription(reference: string): string {
  const compact = reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return compact.length <= DESCRIPTION_MAX ? compact : compact.slice(0, 3) + compact.slice(-6);
}

/** `YYYY-MM-DD HH:mm:ss` theo giờ Việt Nam; chuỗi đã có múi giờ thì giữ nguyên. */
function vietnamTime(value: string): Date | null {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? value
    : `${value.trim().replace(' ', 'T')}+07:00`;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

function withoutPayerAccount(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return payload;
  const { data, ...rest } = payload as { data: unknown };
  if (!data || typeof data !== 'object') return payload;
  const cleaned = { ...(data as Record<string, unknown>) };
  for (const field of PAYER_ACCOUNT_FIELDS) delete cleaned[field];
  return { ...rest, data: cleaned };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Adapter PayOS (ADR-0016): ký yêu cầu tạo link, kiểm chữ ký webhook, lọc tài khoản người chuyển.
 * Không gọi mạng — `fetch` được thay bằng hàm giả.
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PayosPaymentGateway,
  payosSignatureOf,
  shortDescription,
} from '../../apps/api/src/modules/ord/payment/payos-gateway.js';

const CONFIG = {
  baseUrl: 'https://payos.test.invalid',
  clientId: 'cid',
  apiKey: 'key',
  checksumKey: 'checksum-key',
  returnUrl: 'https://admin.test/return',
  cancelUrl: 'https://admin.test/cancel',
};

function webhookData(overrides: Record<string, unknown> = {}) {
  return {
    orderCode: 1790936400123456,
    amount: 42000,
    description: 'ORDABC123',
    accountNumber: '12345678',
    reference: 'FT26101400001',
    transactionDateTime: '2026-10-14 10:15:30',
    currency: 'VND',
    paymentLinkId: 'plink_1',
    code: '00',
    desc: 'success',
    counterAccountBankId: '970422',
    counterAccountBankName: 'MB Bank',
    counterAccountName: 'NGUYEN VAN A',
    counterAccountNumber: '9704229988776655',
    virtualAccountName: null,
    virtualAccountNumber: null,
    ...overrides,
  };
}

function signedBody(data: Record<string, unknown>, key = CONFIG.checksumKey, top = {}) {
  return Buffer.from(
    JSON.stringify({
      code: '00',
      desc: 'success',
      success: true,
      data,
      signature: payosSignatureOf(data, key),
      ...top,
    }),
  );
}

describe('payosSignatureOf', () => {
  it('test_FR_ORD_13_payos_signature_sorts_keys_and_blanks_nulls', () => {
    const expected = createHmac('sha256', 'k').update('a=1&b=&c=x&d={"y":2}').digest('hex');
    expect(payosSignatureOf({ c: 'x', a: 1, b: null, d: { y: 2 } }, 'k')).toBe(expected);
  });
});

describe('PayosPaymentGateway.verifyWebhook', () => {
  const gateway = new PayosPaymentGateway(CONFIG);

  it('test_FR_ORD_13_payos_webhook_valid_signature_verified', () => {
    const result = gateway.verifyWebhook(signedBody(webhookData()), {});
    expect(result.kind).toBe('VERIFIED');
    if (result.kind !== 'VERIFIED') return;
    expect(result.event).toEqual({
      eventId: '1790936400123456:FT26101400001',
      reference: '1790936400123456',
      transactionId: 'FT26101400001',
      status: 'SUCCEEDED',
      amount: '42000',
      currency: 'VND',
      occurredAt: new Date('2026-10-14T03:15:30.000Z'),
    });
  });

  it('test_FR_ORD_13_payos_webhook_tampered_or_wrong_key_rejected', () => {
    const tampered = JSON.parse(signedBody(webhookData()).toString()) as {
      data: Record<string, unknown>;
    };
    tampered.data['amount'] = 1;
    expect(gateway.verifyWebhook(Buffer.from(JSON.stringify(tampered)), {}).kind).toBe(
      'INVALID_SIGNATURE',
    );
    expect(gateway.verifyWebhook(signedBody(webhookData(), 'khoa-khac'), {}).kind).toBe(
      'INVALID_SIGNATURE',
    );
    expect(gateway.verifyWebhook(Buffer.from('khong phai json'), {}).kind).toBe('MALFORMED');
  });

  it('test_FR_ORD_13_payos_webhook_strips_payer_account_before_storage', () => {
    const verified = gateway.verifyWebhook(signedBody(webhookData()), {});
    const rejected = gateway.verifyWebhook(signedBody(webhookData(), 'khoa-khac'), {});
    for (const result of [verified, rejected]) {
      const stored = JSON.stringify(result.payload);
      expect(stored).not.toContain('9704229988776655');
      expect(stored).not.toContain('NGUYEN VAN A');
      expect(stored).not.toContain('counterAccount');
      expect(stored).toContain('FT26101400001');
    }
  });

  it('test_FR_ORD_13_payos_sample_webhook_without_success_field_is_verified', () => {
    // Giao dịch mẫu PayOS gửi khi lưu Webhook URL: không có `success` ở cấp ngoài (gặp khi đăng ký
    // URL thật 16/10). Chữ ký đúng thì phải qua — trước đây bị 401 và PayOS không lưu được URL.
    const data = webhookData();
    const body = Buffer.from(
      JSON.stringify({
        code: '00',
        desc: 'success',
        data,
        signature: payosSignatureOf(data, CONFIG.checksumKey),
      }),
    );
    const result = gateway.verifyWebhook(body, {});
    expect(result.kind).toBe('VERIFIED');
    expect(result.kind === 'VERIFIED' && result.event.status).toBe('SUCCEEDED');
  });

  it('test_FR_ORD_12_payos_failed_transaction_maps_to_failed', () => {
    const result = gateway.verifyWebhook(
      signedBody(webhookData({ code: '01', desc: 'fail' }), CONFIG.checksumKey, { success: false }),
      {},
    );
    expect(result.kind === 'VERIFIED' && result.event.status).toBe('FAILED');
  });
});

describe('PayosPaymentGateway.createPayment', () => {
  function fakeFetch(capture: { url?: string; init?: RequestInit }, body: unknown, status = 200) {
    return (async (url: string | URL | Request, init?: RequestInit) => {
      capture.url = String(url);
      capture.init = init;
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  }

  it('test_FR_ORD_08_payos_creates_signed_link_and_returns_order_code', async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const gateway = new PayosPaymentGateway(
      CONFIG,
      fakeFetch(capture, {
        code: '00',
        desc: 'success',
        data: {
          qrCode: '000201010212VIETQR',
          checkoutUrl: 'https://pay.payos.vn/web/x',
          paymentLinkId: 'p1',
        },
      }),
    );
    const expiresAt = new Date('2026-10-14T03:20:00Z');
    const created = await gateway.createPayment({
      reference: 'ORD-20261014-ABC123',
      amount: '42000.0000',
      currency: 'VND',
      expiresAt,
      description: 'Lượt xịt',
    });

    expect(capture.url).toBe('https://payos.test.invalid/v2/payment-requests');
    const headers = capture.init?.headers as Record<string, string>;
    expect(headers['x-client-id']).toBe('cid');
    expect(headers['x-api-key']).toBe('key');
    const sent = JSON.parse(String(capture.init?.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({
      amount: 42000,
      description: 'ORDABC123',
      expiredAt: Math.floor(expiresAt.getTime() / 1000),
    });
    expect(Number.isSafeInteger(sent['orderCode'])).toBe(true);
    const expectedSignature = createHmac('sha256', CONFIG.checksumKey)
      .update(
        `amount=42000&cancelUrl=${CONFIG.cancelUrl}&description=ORDABC123&orderCode=${String(sent['orderCode'])}&returnUrl=${CONFIG.returnUrl}`,
      )
      .digest('hex');
    expect(sent['signature']).toBe(expectedSignature);

    expect(created).toMatchObject({
      providerReference: String(sent['orderCode']),
      qrPayload: '000201010212VIETQR',
      checkoutUrl: 'https://pay.payos.vn/web/x',
    });
  });

  it('test_FR_ORD_08_payos_supports_custom_return_and_cancel_urls', async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const gateway = new PayosPaymentGateway(
      CONFIG,
      fakeFetch(capture, {
        code: '00',
        desc: 'success',
        data: {
          qrCode: '000201010212VIETQR',
          checkoutUrl: 'https://pay.payos.vn/web/custom',
          paymentLinkId: 'p2',
        },
      }),
    );
    const expiresAt = new Date('2026-10-14T03:20:00Z');
    const customReturnUrl = 'https://admin.test/rentals/checkouts/chk-123';
    const customCancelUrl = 'https://admin.test/rentals/checkouts/chk-123';
    await gateway.createPayment({
      reference: 'CHK-20261014-XYZ789',
      amount: '500000',
      currency: 'VND',
      expiresAt,
      description: 'Thuê slot',
      returnUrl: customReturnUrl,
      cancelUrl: customCancelUrl,
    });

    const sent = JSON.parse(String(capture.init?.body)) as Record<string, unknown>;
    expect(sent['returnUrl']).toBe(customReturnUrl);
    expect(sent['cancelUrl']).toBe(customCancelUrl);
    const expectedSignature = createHmac('sha256', CONFIG.checksumKey)
      .update(
        `amount=500000&cancelUrl=${customCancelUrl}&description=CHKXYZ789&orderCode=${String(sent['orderCode'])}&returnUrl=${customReturnUrl}`,
      )
      .digest('hex');
    expect(sent['signature']).toBe(expectedSignature);
  });

  it('test_FR_ORD_08_payos_rejects_fractional_amount_and_error_response', async () => {
    const capture = {};
    const ok = new PayosPaymentGateway(CONFIG, fakeFetch(capture, { code: '00', data: null }));
    const base = { reference: 'ORD-1', currency: 'VND', expiresAt: new Date(), description: 'x' };
    await expect(ok.createPayment({ ...base, amount: '42000.5000' })).rejects.toThrow(/nguyên VND/);
    await expect(ok.createPayment({ ...base, amount: '42000' })).rejects.toThrow(/PayOS từ chối/);

    const denied = new PayosPaymentGateway(
      CONFIG,
      fakeFetch(capture, { code: '20', desc: 'sai' }, 400),
    );
    await expect(denied.createPayment({ ...base, amount: '42000' })).rejects.toThrow(/HTTP 400/);
  });

  it('short description fits the 9-character limit', () => {
    expect(shortDescription('ORD-20261014-ABC123')).toBe('ORDABC123');
    expect(shortDescription('CHK-20261014-XYZ789')).toBe('CHKXYZ789');
    expect(shortDescription('AB-1')).toBe('AB1');
  });
});

describe('PayosPaymentGateway.cancelPayment (ADR-0015)', () => {
  /** Trả lần lượt từng phản hồi, ghi lại mọi lời gọi. */
  function scriptedFetch(
    calls: { url: string; method: string; body?: string }[],
    replies: { body: unknown; status?: number }[],
  ) {
    return (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        ...(typeof init?.body === 'string' ? { body: init.body } : {}),
      });
      const reply = replies.shift();
      if (!reply) throw new Error('không có phản hồi giả cho lời gọi này');
      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }) as typeof fetch;
  }

  const request = { providerReference: '1790936400123456', reason: 'Customer cancelled at kiosk' };
  const link = (status: string) => ({ code: '00', desc: 'success', data: { status } });

  it('test_FR_ORD_33_payos_cancels_link_by_order_code', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const gateway = new PayosPaymentGateway(
      CONFIG,
      scriptedFetch(calls, [{ body: link('CANCELLED') }]),
    );

    await expect(gateway.cancelPayment(request)).resolves.toEqual({ kind: 'CANCELLED' });
    expect(calls).toEqual([
      {
        url: 'https://payos.test.invalid/v2/payment-requests/1790936400123456/cancel',
        method: 'POST',
        body: JSON.stringify({ cancellationReason: 'Customer cancelled at kiosk' }),
      },
    ]);
  });

  it('test_FR_ORD_33_payos_refuses_cancel_when_link_paid_or_processing', async () => {
    for (const status of ['PAID', 'PROCESSING']) {
      const calls: { url: string; method: string }[] = [];
      const gateway = new PayosPaymentGateway(
        CONFIG,
        // PayOS từ chối hủy → adapter hỏi lại trạng thái link để biết lý do.
        scriptedFetch(calls, [
          { body: { code: '101', desc: 'Đơn thanh toán đã hoàn thành' }, status: 400 },
          { body: link(status) },
        ]),
      );
      await expect(gateway.cancelPayment(request)).resolves.toEqual({ kind: 'ALREADY_PAID' });
      expect(calls.map((c) => c.method)).toEqual(['POST', 'GET']);
      expect(calls[1]?.url).toBe('https://payos.test.invalid/v2/payment-requests/1790936400123456');
    }
  });

  it('test_FR_ORD_33_payos_link_already_closed_counts_as_cancelled', async () => {
    const gateway = new PayosPaymentGateway(
      CONFIG,
      scriptedFetch(
        [],
        [{ body: { code: '101', desc: 'đã hủy' }, status: 400 }, { body: link('EXPIRED') }],
      ),
    );
    await expect(gateway.cancelPayment(request)).resolves.toEqual({ kind: 'CANCELLED' });
  });

  it('test_FR_ORD_33_payos_unknown_state_throws_for_caller_to_decide', async () => {
    const unknown = new PayosPaymentGateway(
      CONFIG,
      scriptedFetch(
        [],
        [{ body: { code: '20', desc: 'lỗi' }, status: 500 }, { body: link('PENDING') }],
      ),
    );
    await expect(unknown.cancelPayment(request)).rejects.toThrow(/PayOS chưa hủy được link/);

    const garbage = new PayosPaymentGateway(
      CONFIG,
      scriptedFetch(
        [],
        [
          { body: 'oops', status: 502 },
          { body: null, status: 502 },
        ],
      ),
    );
    await expect(garbage.cancelPayment(request)).rejects.toThrow(/trạng thái không rõ/);
  });
});

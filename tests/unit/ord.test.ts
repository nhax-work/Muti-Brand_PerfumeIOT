/**
 * Unit test cho ORD: state machine, mã tham chiếu, so tiền, cổng mock, và phân nhánh webhook sang
 * phiên thuê slot (ADR-0008).
 *
 * KHÔNG có ở đây — thuộc nhóm người tự viết (spec/testing.md, docs/HUONG_DAN_BACKEND.md Mục 6):
 *   - idempotency webhook (FR-ORD-15, FR-SLT-38 AC4)
 *   - quy kết revenue_owner (FR-REV-01..03)
 */

import 'reflect-metadata';
import type { Kysely } from 'kysely';
import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import type { DB } from '../../apps/api/src/shared/db/index.js';
import type { OrderStatus } from '../../apps/api/src/shared/db/types.generated.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';
import {
  canCreateDispenseCommand,
  canTransition,
  isTerminal,
  ORDER_TRANSITIONS,
} from '../../apps/api/src/modules/ord/order-status.js';
import { isSellable, OrdService } from '../../apps/api/src/modules/ord/ord.service.js';
import type {
  InteractionTarget,
  NewInteractionEvent,
  OrdQueries,
  SlotOfferRecord,
} from '../../apps/api/src/modules/ord/ord.queries.js';
import { sameAmount, toMinorUnits } from '../../apps/api/src/modules/ord/payment/money.js';
import {
  buildMockWebhook,
  MOCK_SIGNATURE_HEADER,
  MockPaymentGateway,
  signMockPayload,
} from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { PaymentGatewayRegistry } from '../../apps/api/src/modules/ord/payment/payment-gateway.js';
import {
  newPaymentReference,
  PAYMENT_REFERENCE_PATTERN,
} from '../../apps/api/src/modules/ord/payment/payment-reference.js';
import { PaymentWebhookService } from '../../apps/api/src/modules/ord/payment/payment-webhook.service.js';
import type {
  PaymentQueries,
  PaymentRecord,
} from '../../apps/api/src/modules/ord/payment/payment.queries.js';
import type {
  CheckoutPaymentOutcome,
  CheckoutPaymentSucceeded,
  RentalCheckoutPaymentHandler,
} from '../../apps/api/src/modules/ord/payment/rental-checkout-payment.port.js';

const ALL_STATUSES = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];

describe('ORD — state machine đơn hàng', () => {
  it('test_FR_ORD_10_order_status_lifecycle', () => {
    // Luồng vàng (AC1..AC3) và các nhánh AC4, AC5.
    expect(canTransition('CREATED', 'PENDING_PAYMENT')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'DISPENSE_REQUESTED')).toBe(true);
    expect(canTransition('DISPENSE_REQUESTED', 'DISPENSED')).toBe(true);
    expect(canTransition('DISPENSE_REQUESTED', 'FAILED')).toBe(true);
    expect(canTransition('DISPENSE_REQUESTED', 'FORFEITED')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'EXPIRED')).toBe(true);
    // Tiền về sau hạn (FR-ORD-16 AC3), hoàn tiền đơn lỗi (FR-ORD-19, 20).
    expect(canTransition('EXPIRED', 'REFUND_PENDING')).toBe(true);
    expect(canTransition('REFUND_PENDING', 'REFUNDED')).toBe(true);

    // Không nhảy cóc, không quay lui.
    expect(canTransition('PENDING_PAYMENT', 'DISPENSED')).toBe(false);
    expect(canTransition('CREATED', 'PAID')).toBe(false);
    expect(canTransition('PAID', 'PENDING_PAYMENT')).toBe(false);
    expect(canTransition('EXPIRED', 'PAID')).toBe(false);

    // Trạng thái cuối không đi đâu nữa.
    for (const terminal of ['DISPENSED', 'FORFEITED', 'REFUNDED'] as const) {
      expect(isTerminal(terminal)).toBe(true);
      for (const to of ALL_STATUSES) expect(canTransition(terminal, to)).toBe(false);
    }
  });

  it('test_FR_ORD_17_reject_dispense_for_invalid_order_status', () => {
    expect(canCreateDispenseCommand('PAID')).toBe(true);
    // AC1: FAILED/EXPIRED/REFUNDED/FORFEITED; AC2: DISPENSED (chống xịt trùng, BR-002).
    for (const status of ALL_STATUSES.filter((s) => s !== 'PAID')) {
      expect(canCreateDispenseCommand(status)).toBe(false);
    }
  });
});

describe('ORD — mã tham chiếu và tiền', () => {
  it('test_FR_ORD_07_generate_unique_order_code', () => {
    // 18:00 UTC ngày 30/09 là 01:00 ngày 01/10 ở Việt Nam — ngày trên mã theo giờ địa điểm.
    const at = new Date('2026-09-30T18:00:00Z');
    const reference = newPaymentReference('ORD', at, 'Asia/Ho_Chi_Minh');
    expect(reference).toMatch(/^ORD-20261001-/);
    expect(reference).toMatch(PAYMENT_REFERENCE_PATTERN);

    // Phần ngẫu nhiên không dùng ký tự dễ đọc nhầm (0/O, 1/I/L).
    const many = new Set(Array.from({ length: 500 }, () => newPaymentReference('ORD', at, 'UTC')));
    for (const ref of many) expect(ref).not.toMatch(/-[^-]*[01OIL][^-]*$/);
    // Duy nhất thật sự do UNIQUE ở CSDL bảo đảm; đây chỉ kiểm độ phân tán hợp lý.
    expect(many.size).toBeGreaterThan(495);

    expect(newPaymentReference('CHK', at, 'UTC')).toMatch(/^CHK-20260930-/);
  });

  it('so tiền theo giá trị thập phân, không qua float', () => {
    expect(sameAmount('35000', '35000.0000')).toBe(true);
    expect(sameAmount('35000.5', '35000.5000')).toBe(true);
    expect(sameAmount('35000.0001', '35000')).toBe(false);
    // Số lớn hơn độ chính xác của float vẫn so đúng.
    expect(sameAmount('900719925474099.3', '900719925474099.2')).toBe(false);
    expect(toMinorUnits('-1')).toBeNull();
    expect(toMinorUnits('1e3')).toBeNull();
    expect(sameAmount('abc', 'abc')).toBe(false);
  });
});

describe('ORD — danh mục kiosk', () => {
  const sellable: SlotOfferRecord = {
    slotId: 's1',
    slotNumber: 1,
    slotStatus: 'AVAILABLE',
    rentalId: 'r1',
    rentalStatus: 'ACTIVE',
    brandId: 'b1',
    brandName: 'Maison',
    brandStatus: 'ACTIVE',
    pricePerSpray: '35000.0000',
    currency: 'VND',
    productId: 'p1',
    productName: 'Matinale',
    productDescription: null,
    productImageUrl: null,
    productFragranceNotes: null,
    productStatus: 'ACTIVE',
    productDeletedAt: null,
  };

  it('slot chỉ bán được khi đủ mọi điều kiện (FR-ORD-04, FR-SLT-29, FR-BND-04)', () => {
    expect(isSellable(sellable)).toBe(true);
    expect(isSellable({ ...sellable, rentalStatus: 'LIQUIDATED' })).toBe(true);
    expect(isSellable({ ...sellable, slotStatus: 'UNAVAILABLE' })).toBe(false);
    expect(isSellable({ ...sellable, rentalId: null, rentalStatus: null })).toBe(false);
    expect(isSellable({ ...sellable, rentalStatus: 'DRAFT' })).toBe(false);
    expect(isSellable({ ...sellable, pricePerSpray: null })).toBe(false);
    expect(isSellable({ ...sellable, productId: null, productName: null })).toBe(false);
    expect(isSellable({ ...sellable, productDeletedAt: new Date() })).toBe(false);
    expect(isSellable({ ...sellable, brandStatus: 'SUSPENDED' })).toBe(false);
  });
});

class FakeInteractionQueries {
  readonly inserted: NewInteractionEvent[] = [];
  requestedSlotIds: readonly string[] = [];

  constructor(private readonly targets: InteractionTarget[]) {}

  listInteractionTargets(slotIds: readonly string[]): Promise<InteractionTarget[]> {
    this.requestedSlotIds = slotIds;
    return Promise.resolve(this.targets.filter((t) => slotIds.includes(t.slotId)));
  }

  insertInteractionEvents(events: readonly NewInteractionEvent[]): Promise<void> {
    this.inserted.push(...events);
    return Promise.resolve();
  }
}

/** OrdService chỉ với OrdQueries — recordKioskInteractions không chạm phụ thuộc khác. */
function interactionService(queries: FakeInteractionQueries): OrdService {
  const unused = undefined as never;
  return new OrdService(queries as unknown as OrdQueries, unused, unused, unused, unused, unused);
}

describe('ORD — tương tác kiosk (FR-RPT-06)', () => {
  const target: InteractionTarget = {
    slotId: '11111111-1111-4111-8111-111111111111',
    machineId: 'machine-1',
    slotRentalId: 'rental-1',
    brandId: 'brand-1',
    fragranceProductId: 'product-1',
  };
  const event = {
    eventId: 'evt-1',
    eventType: 'PRODUCT_SELECTED' as const,
    slotId: target.slotId,
    kioskSessionId: '22222222-2222-4222-8222-222222222222',
    occurredAt: new Date('2026-10-04T03:00:00Z'),
  };

  it('test_FR_RPT_06_record_kiosk_interaction — brand/hóa đơn/sản phẩm lấy từ hóa đơn chiếm dụng slot', async () => {
    const queries = new FakeInteractionQueries([target]);
    await interactionService(queries).recordKioskInteractions([
      event,
      { ...event, eventId: 'evt-2', eventType: 'PRODUCT_IMPRESSION' },
    ]);

    expect(queries.requestedSlotIds).toEqual([target.slotId]);
    expect(queries.inserted).toEqual([
      { ...target, ...event },
      { ...target, ...event, eventId: 'evt-2', eventType: 'PRODUCT_IMPRESSION' },
    ]);
  });

  it('slot không có hóa đơn gắn sản phẩm thì bỏ qua sự kiện, không lỗi', async () => {
    const queries = new FakeInteractionQueries([target]);
    const emptySlot = '33333333-3333-4333-8333-333333333333';
    await interactionService(queries).recordKioskInteractions([
      { ...event, eventId: 'evt-empty', slotId: emptySlot },
      event,
    ]);

    expect(queries.inserted.map((e) => e.eventId)).toEqual(['evt-1']);
  });
});

describe('ORD — cổng thanh toán mock', () => {
  const secret = 'unit-test-secret';
  const gateway = new MockPaymentGateway(secret);
  const body = JSON.stringify(
    buildMockWebhook({ reference: 'ORD-20261001-ABCDEF', amount: '35000.0000', currency: 'VND' }),
  );

  it('test_FR_ORD_13_verify_webhook_signature', () => {
    const ok = gateway.verifyWebhook(Buffer.from(body), {
      [MOCK_SIGNATURE_HEADER]: signMockPayload(secret, body),
    });
    expect(ok.kind).toBe('VERIFIED');

    // AC2: chữ ký sai, thiếu chữ ký, hoặc body bị sửa sau khi ký.
    const tampered = body.replace('35000.0000', '1.0000');
    for (const [raw, header] of [
      [body, signMockPayload('khoa-khac', body)],
      [body, undefined],
      [tampered, signMockPayload(secret, body)],
    ] as const) {
      const result = gateway.verifyWebhook(Buffer.from(raw), { [MOCK_SIGNATURE_HEADER]: header });
      expect(result.kind).toBe('INVALID_SIGNATURE');
    }

    // Chưa cấu hình PAYMENT_WEBHOOK_SECRET thì không webhook nào qua được.
    const unconfigured = new MockPaymentGateway(null);
    expect(
      unconfigured.verifyWebhook(Buffer.from(body), {
        [MOCK_SIGNATURE_HEADER]: signMockPayload(secret, body),
      }).kind,
    ).toBe('INVALID_SIGNATURE');
  });

  it('body không phải JSON là MALFORMED, không phải lỗi chữ ký (FR-ORD-12 AC2)', () => {
    expect(gateway.verifyWebhook(Buffer.from('{hỏng'), {}).kind).toBe('MALFORMED');
  });

  it('PAYMENT_PROVIDER chưa có hiện thực thì API không khởi động', () => {
    expect(() => new PaymentGatewayRegistry([gateway], 'vnpay')).toThrow(/PAYMENT_PROVIDER=vnpay/);
  });
});

// -------------------------------------------------------------------------------------
// Phân nhánh webhook: payment của phiên thuê slot đi tới handler của SLT (ADR-0008)
// -------------------------------------------------------------------------------------

class FakePaymentQueries {
  updates: Array<{ id: string; status: string }> = [];
  finished: string[] = [];
  constructor(private readonly payment: PaymentRecord) {}
  transaction<T>(work: (tx: Kysely<DB>) => Promise<T>): Promise<T> {
    return work({} as Kysely<DB>);
  }
  async lockByReference() {
    return this.payment;
  }
  async claimEvent() {
    return 'event-row-1';
  }
  async update(id: string, set: { status: string }) {
    this.updates.push({ id, status: set.status });
  }
  async finishEvent(_id: string, result: string) {
    this.finished.push(result);
  }
  async insertRejectedEvent() {}
}

class RecordingCheckoutHandler implements RentalCheckoutPaymentHandler {
  received: CheckoutPaymentSucceeded[] = [];
  constructor(private readonly outcome: CheckoutPaymentOutcome) {}
  async onPaymentSucceeded(_tx: unknown, event: CheckoutPaymentSucceeded) {
    this.received.push(event);
    return this.outcome;
  }
}

function checkoutPayment(): PaymentRecord {
  return {
    id: 'pay-1',
    brandId: 'brand-1',
    orderId: null,
    rentalCheckoutId: 'checkout-1',
    provider: 'mock',
    providerReference: 'CHK-20261001-ABCDEF',
    providerTransactionId: null,
    amount: '10200000.0000',
    currency: 'VND',
    status: 'PENDING',
    rawResponse: null,
    createdAt: new Date(),
  };
}

function webhookService(queries: FakePaymentQueries, handler: RentalCheckoutPaymentHandler) {
  const secret = 'unit-test-secret';
  const audits: AuditEntry[] = [];
  const service = new PaymentWebhookService(
    queries as unknown as PaymentQueries,
    {} as OrdService, // nhánh phiên thuê slot không được đụng tới OrdService
    new PaymentGatewayRegistry([new MockPaymentGateway(secret)], 'mock'),
    handler,
    { log: async (entry: AuditEntry) => void audits.push(entry) } as never,
    { now: () => new Date('2026-10-01T03:00:00Z') },
  );
  const send = (amount: string) => {
    const body = JSON.stringify(
      buildMockWebhook({
        reference: 'CHK-20261001-ABCDEF',
        amount,
        currency: 'VND',
        transactionId: 'txn-1',
        occurredAt: '2026-10-01T02:59:00Z',
      }),
    );
    return service.handle('mock', Buffer.from(body), {
      [MOCK_SIGNATURE_HEADER]: signMockPayload(secret, body),
    });
  };
  return { send, audits };
}

describe('ORD — webhook chia nhánh sang phiên thuê slot (ADR-0008)', () => {
  it('payment của phiên đi tới RentalCheckoutPaymentHandler với đủ dữ liệu đã kiểm', async () => {
    const queries = new FakePaymentQueries(checkoutPayment());
    const handler = new RecordingCheckoutHandler({ kind: 'PAID' });
    const { send, audits } = webhookService(queries, handler);

    await expect(send('10200000')).resolves.toBe('PROCESSED');
    expect(handler.received).toHaveLength(1);
    expect(handler.received[0]).toMatchObject({
      paymentId: 'pay-1',
      checkoutId: 'checkout-1',
      brandId: 'brand-1',
      providerTransactionId: 'txn-1',
      amount: '10200000.0000',
      paymentStatusBefore: 'PENDING',
      paidAt: new Date('2026-10-01T02:59:00Z'),
    });
    expect(queries.updates).toEqual([{ id: 'pay-1', status: 'SUCCEEDED' }]);
    expect(queries.finished).toEqual(['PAID']);
    expect(audits.map((a) => a.action)).toContain('ord.payment.succeeded');
  });

  it('handler trả REFUND_PENDING thì payment REFUND_PENDING, không ghi nhận tiền', async () => {
    const queries = new FakePaymentQueries(checkoutPayment());
    const handler = new RecordingCheckoutHandler({
      kind: 'REFUND_PENDING',
      reason: 'CHECKOUT_CANCELLED',
    });
    const { send } = webhookService(queries, handler);

    await expect(send('10200000.0000')).resolves.toBe('PROCESSED');
    expect(queries.updates).toEqual([{ id: 'pay-1', status: 'REFUND_PENDING' }]);
    expect(queries.finished).toEqual(['REFUND_PENDING:CHECKOUT_CANCELLED']);
  });

  it('số tiền lệch thì dừng trước handler (FR-SLT-38 AC2)', async () => {
    const queries = new FakePaymentQueries(checkoutPayment());
    const handler = new RecordingCheckoutHandler({ kind: 'PAID' });
    const { send } = webhookService(queries, handler);

    const error = await send('1000').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('AMOUNT_MISMATCH');
    expect(handler.received).toHaveLength(0);
    expect(queries.updates).toHaveLength(0);
  });
});

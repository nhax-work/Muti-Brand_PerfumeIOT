/**
 * Đơn hàng một lượt xịt (FR-ORD-01..18, FR-REV-01..03).
 *
 * Không biết HTTP (QT2, ADR-0003): cùng các hàm này được gọi từ controller kiosk, từ webhook thanh
 * toán, và từ tuần 5 là từ luồng lệnh xịt (DSP) và scheduler.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import type { Kysely } from 'kysely';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import type { DB } from '../../shared/db/index.js';
import type { KioskInteractionType, RevenueOwnerType } from '../../shared/db/types.generated.js';
import { AppError, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { canCreateDispenseCommand, canTransition } from './order-status.js';
import {
  OrdQueries,
  type KioskMachineRecord,
  type OrderRecord,
  type OrderSearchFilter,
  type OrderStateColumns,
  type SlotOfferRecord,
  type StatusChange,
} from './ord.queries.js';
import { newPaymentReference } from './payment/payment-reference.js';
import { PaymentQueries } from './payment/payment.queries.js';
import { PaymentService } from './payment/payment.service.js';
import { revenueOwnerFor } from './revenue-owner.js';

type Order = Schema<'Order'>;
type OrderCreated = Schema<'OrderCreated'>;
type OrderStatusView = Schema<'OrderStatusView'>;
type KioskCatalog = Schema<'KioskCatalog'>;
type OrderStatusHistoryEntry = Schema<'OrderStatusHistoryEntry'>;

type Executor = Kysely<DB>;

/** Số lần thử lại khi mã tham chiếu ngẫu nhiên trùng (xác suất ~1/31⁶ mỗi ngày mỗi lần). */
const REFERENCE_ATTEMPTS = 3;

/** Trạng thái khách cần mã tham chiếu sự cố để liên hệ hỗ trợ (FR-ORD-21). */
const SUPPORT_STATUSES = new Set(['FAILED', 'REFUND_PENDING', 'REFUNDED']);

export interface CreateOrderInput {
  readonly machineSerial: string;
  readonly slotId: string;
  readonly kioskSessionId?: string | undefined;
  /** Header Idempotency-Key — `orders.idempotency_key`. */
  readonly idempotencyKey: string;
}

export interface KioskInteractionInput {
  /** Khóa idempotency do kiosk sinh — `kiosk_interaction_events.event_id`. */
  readonly eventId: string;
  readonly eventType: KioskInteractionType;
  readonly slotId: string;
  readonly kioskSessionId: string;
  readonly occurredAt: Date;
}

/** Kết cục của đơn khi lệnh xịt kết thúc — spec/contracts/mqtt.md §6 "Ánh xạ". */
export interface DispenseOrderOutcome {
  readonly to: 'DISPENSED' | 'FAILED' | 'FORFEITED';
  /** Mã trong spec/errors.md (`PRESS_TIMEOUT`, `ACTUATOR_FAULT`…); `null` khi thành công. */
  readonly failureCode: string | null;
  readonly manualReview: boolean;
  readonly commandToken: string;
  /** Thời điểm thiết bị kích hoạt cơ cấu (`executed_at`) — ghi vào `dispensed_at`. */
  readonly at: Date;
}

/** Kết quả webhook thanh toán thành công cho một đơn — cùng hình dạng với phía phiên thuê slot. */
export type OrderPaymentOutcome =
  | { readonly kind: 'PAID' }
  | { readonly kind: 'REFUND_PENDING'; readonly reason: 'ORDER_EXPIRED' | 'ORDER_NOT_PAYABLE' };

@Injectable()
export class OrdService {
  constructor(
    @Inject(OrdQueries) private readonly queries: OrdQueries,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(PaymentQueries) private readonly paymentQueries: PaymentQueries,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // -----------------------------------------------------------------------------------
  // Kiosk
  // -----------------------------------------------------------------------------------

  /** FR-ORD-01, FR-ORD-02: danh mục trên kiosk. Slot không bán được KHÔNG kèm thương hiệu (BR-012). */
  async getKioskCatalog(machineSerial: string): Promise<KioskCatalog> {
    const machine = await this.queries.findMachineBySerial(machineSerial);
    if (!machine) throw new AppError('NOT_FOUND', 'ord.machineNotFound');
    const offers = await this.queries.listSlotOffers(machine.id);
    return {
      machineSerial: machine.serialNumber,
      machineStatus: machine.status,
      operatingMode: machine.operatingMode,
      items: offers.map((offer) =>
        isSellable(offer)
          ? {
              slotId: offer.slotId,
              slotNumber: offer.slotNumber,
              available: true,
              brandName: offer.brandName,
              product: {
                id: offer.productId as string,
                name: offer.productName as string,
                description: offer.productDescription,
                imageUrl: offer.productImageUrl,
                fragranceNotes: (offer.productFragranceNotes ?? null) as Record<
                  string,
                  unknown
                > | null,
              },
              pricePerSpray: offer.pricePerSpray,
              currency: offer.currency ?? DEFAULT_CURRENCY,
            }
          : {
              slotId: offer.slotId,
              slotNumber: offer.slotNumber,
              available: false,
              brandName: null,
              product: null,
              pricePerSpray: null,
              currency: DEFAULT_CURRENCY,
            },
      ),
    };
  }

  /**
   * FR-RPT-06, BR-007: ghi lượt xem / lượt chọn sản phẩm. Brand, hóa đơn và sản phẩm lấy từ hóa đơn
   * đang chiếm dụng slot phía server — không tin dữ liệu kiosk gửi. Sự kiện của slot không có hóa
   * đơn gắn sản phẩm bị bỏ qua (endpoint vẫn 202): thống kê không được chặn trải nghiệm khách.
   */
  async recordKioskInteractions(events: readonly KioskInteractionInput[]): Promise<void> {
    const slotIds = [...new Set(events.map((e) => e.slotId))];
    const targets = new Map(
      (await this.queries.listInteractionTargets(slotIds)).map((t) => [t.slotId, t]),
    );
    const rows = events.flatMap((e) => {
      const target = targets.get(e.slotId);
      return target
        ? [
            {
              ...target,
              eventId: e.eventId,
              eventType: e.eventType,
              kioskSessionId: e.kioskSessionId,
              occurredAt: e.occurredAt,
            },
          ]
        : [];
    });
    await this.queries.insertInteractionEvents(rows);
  }

  /**
   * FR-ORD-04..09, FR-REV-01/02, FR-ORD-24: tạo đơn, chụp ảnh dữ liệu, mở thanh toán.
   *
   * @returns `replayed = true` khi Idempotency-Key đã dùng — trả lại đúng đơn và QR cũ (HTTP 200).
   */
  async createOrder(input: CreateOrderInput): Promise<{ replayed: boolean; body: OrderCreated }> {
    const existing = await this.queries.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return { replayed: true, body: await this.replay(existing, input) };

    for (let attempt = 1; ; attempt++) {
      try {
        return { replayed: false, body: await this.createNew(input) };
      } catch (error) {
        const constraint = uniqueViolation(error);
        if (constraint === 'orders_idempotency_key_key') {
          // Hai yêu cầu cùng khóa tới đồng thời: yêu cầu kia đã thắng, trả lại đơn của nó.
          const winner = await this.queries.findByIdempotencyKey(input.idempotencyKey);
          if (winner) return { replayed: true, body: await this.replay(winner, input) };
        }
        const referenceClash =
          constraint === 'orders_payment_reference_key' ||
          constraint === 'uq_payment_provider_reference';
        if (referenceClash && attempt < REFERENCE_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  /**
   * FR-ORD-11, FR-ORD-21, FR-ORD-26: trạng thái cho kiosk poll. Đơn quá hạn mà chưa ai chuyển thì
   * chuyển EXPIRED ngay tại đây (FR-ORD-16 AC1 "hoặc khi Kiosk kiểm tra trạng thái đơn").
   */
  async getKioskOrderStatus(orderId: string): Promise<OrderStatusView> {
    let order = await this.queries.findKioskOrder(orderId);
    if (!order) throw new AppError('NOT_FOUND', 'ord.orderNotFound');
    if (order.status === 'PENDING_PAYMENT' && order.expiresAt <= this.clock.now()) {
      await this.expireOrder(order.id);
      order = (await this.queries.findKioskOrder(orderId)) ?? order;
    }

    const pressWindowMs = this.config.constraint('DISPENSE_PRESS_WINDOW_SEC') * 1000;
    const pressDeadline =
      order.commandStatus === 'ACKNOWLEDGED' && order.commandAcknowledgedAt
        ? new Date(order.commandAcknowledgedAt.getTime() + pressWindowMs).toISOString()
        : null;
    const needsSupport = order.needsManualReview || SUPPORT_STATUSES.has(order.status);

    return {
      orderId: order.id,
      status: order.status,
      revenueOwner: order.revenueOwner,
      dispenseStatus: order.commandStatus,
      failureCode: order.failureCode,
      slotNumber: order.slotNumber,
      pressDeadline,
      supportReference: needsSupport ? order.paymentReference : null,
    };
  }

  // -----------------------------------------------------------------------------------
  // Hết hạn thanh toán (FR-ORD-16)
  // -----------------------------------------------------------------------------------

  /** Chuyển một đơn quá hạn sang EXPIRED; không làm gì nếu đơn đã rời PENDING_PAYMENT. */
  async expireOrder(orderId: string): Promise<boolean> {
    return this.queries.transaction(async (tx) => {
      const order = await this.queries.lockOrder(orderId, tx);
      const now = this.clock.now();
      if (!order || order.status !== 'PENDING_PAYMENT' || order.expiresAt > now) return false;
      await this.transition(
        tx,
        {
          orderId: order.id,
          brandId: order.brandId,
          from: 'PENDING_PAYMENT',
          to: 'EXPIRED',
          reason: 'ORDER_PAYMENT_TTL',
          actorType: 'SYSTEM',
          at: now,
        },
        {},
      );
      await this.paymentQueries.closePending({ orderId: order.id }, 'EXPIRED', tx);
      return true;
    });
  }

  /**
   * Quét đơn quá hạn (FR-ORD-16 AC1) — cho scheduler. Bù được sau downtime vì quét theo
   * `expires_at <= now`, không theo mốc đã lỡ.
   *
   * @returns số đơn đã chuyển EXPIRED
   */
  async expireOverdueOrders(batchSize = 200): Promise<number> {
    const ids = await this.queries.listOverduePendingOrderIds(this.clock.now(), batchSize);
    let expired = 0;
    for (const id of ids) {
      if (await this.expireOrder(id)) expired++;
    }
    return expired;
  }

  // -----------------------------------------------------------------------------------
  // State machine (FR-ORD-10, FR-ORD-18) — điểm DUY NHẤT được đổi orders.status
  // -----------------------------------------------------------------------------------

  /**
   * Đổi trạng thái đơn và ghi lịch sử, trong `tx` của người gọi. Người gọi phải khóa đơn trước
   * (`lockOrder`) và tự kiểm điều kiện nghiệp vụ; hàm này chỉ chặn cạnh không có trong state machine.
   *
   * Tuần 5 (DSP) gọi hàm này cho PAID → DISPENSE_REQUESTED → DISPENSED / FAILED / FORFEITED.
   */
  async transition(
    tx: Executor,
    change: StatusChange & { readonly from: NonNullable<StatusChange['from']> },
    columns: OrderStateColumns,
  ): Promise<OrderRecord> {
    if (!canTransition(change.from, change.to)) {
      throw new Error(
        `Chuyển trạng thái đơn không hợp lệ: ${change.from} → ${change.to} (FR-ORD-10)`,
      );
    }
    const updated = await this.queries.applyTransition(change, columns, tx);
    if (!updated) {
      throw new Error(
        `Đơn ${change.orderId} không còn ở ${change.from} — người gọi phải lockOrder trước khi chuyển`,
      );
    }
    return updated;
  }

  /** Khóa đơn trong `tx` — cho webhook và (tuần 5) luồng lệnh xịt. */
  lockOrder(tx: Executor, orderId: string): Promise<OrderRecord | null> {
    return this.queries.lockOrder(orderId, tx);
  }

  // -----------------------------------------------------------------------------------
  // Webhook thanh toán — phần của đơn kiosk (gọi từ PaymentWebhookService)
  // -----------------------------------------------------------------------------------

  /**
   * Webhook báo thanh toán thành công cho `orderId` — đã qua chữ ký, chống trùng, đối chiếu số tiền.
   *
   * Chấp nhận khi đơn còn PENDING_PAYMENT và cổng ghi nhận giao dịch TRƯỚC hạn đơn — khách trả lúc
   * 4:59 mà webhook tới lúc 5:01 vẫn là khách đã trả đúng hạn. Còn lại (đơn đã EXPIRED, hoặc trả sau
   * hạn) → REFUND_PENDING + kiểm tra thủ công, KHÔNG xịt (FR-ORD-16 AC3).
   */
  async settleOrderPayment(
    tx: Executor,
    payment: {
      readonly orderId: string;
      readonly paymentId: string;
      readonly transactionId: string;
    },
    paidAt: Date,
  ): Promise<OrderPaymentOutcome> {
    const order = await this.queries.lockOrder(payment.orderId, tx);
    if (!order) throw new Error(`Payment ${payment.paymentId} trỏ tới đơn không tồn tại`);
    const now = this.clock.now();
    const metadata = { paymentId: payment.paymentId, transactionId: payment.transactionId };

    if (order.status === 'PENDING_PAYMENT' && paidAt <= order.expiresAt) {
      await this.transition(
        tx,
        {
          orderId: order.id,
          brandId: order.brandId,
          from: 'PENDING_PAYMENT',
          to: 'PAID',
          reason: 'PAYMENT_CONFIRMED',
          actorType: 'PAYMENT_PROVIDER',
          metadata,
          at: now,
        },
        { paidAt },
      );
      // Lệnh xịt KHÔNG tạo ở đây: vòng điều phối DSP nhặt đơn PAID sau khi transaction này commit
      // (outbox), máy còn lệnh CUSTOMER hiệu lực thì đơn giữ PAID "chờ lượt" (FR-DSP-01, 26).
      return { kind: 'PAID' };
    }

    let current = order;
    if (current.status === 'PENDING_PAYMENT') {
      current = await this.transition(
        tx,
        {
          orderId: order.id,
          brandId: order.brandId,
          from: 'PENDING_PAYMENT',
          to: 'EXPIRED',
          reason: 'ORDER_PAYMENT_TTL',
          actorType: 'SYSTEM',
          at: now,
        },
        {},
      );
    }
    if (current.status === 'EXPIRED') {
      await this.transition(
        tx,
        {
          orderId: order.id,
          brandId: order.brandId,
          from: 'EXPIRED',
          to: 'REFUND_PENDING',
          reason: 'PAID_AFTER_EXPIRY',
          actorType: 'PAYMENT_PROVIDER',
          metadata,
          at: now,
        },
        { needsManualReview: true },
      );
      return { kind: 'REFUND_PENDING', reason: 'ORDER_EXPIRED' };
    }

    // Đơn đã đi tiếp bằng đường khác — không thể xảy ra khi mỗi đơn một payment, nhưng tiền đã về
    // thì phải có người xem, không được im lặng.
    await this.queries.flagManualReview(order.id, tx);
    return { kind: 'REFUND_PENDING', reason: 'ORDER_NOT_PAYABLE' };
  }

  /** FR-ORD-14 AC2: số tiền lệch thì cắm cờ kiểm tra thủ công, không đổi trạng thái. */
  async flagOrderForReview(tx: Executor, orderId: string): Promise<void> {
    await this.queries.flagManualReview(orderId, tx);
  }

  // -----------------------------------------------------------------------------------
  // Lệnh xịt — phần của đơn (gọi từ DSP trong transaction của DSP)
  // -----------------------------------------------------------------------------------

  /**
   * FR-ORD-17, FR-DSP-01: PAID → DISPENSE_REQUESTED khi DSP ghi lệnh xịt cho đơn.
   *
   * @returns đơn sau khi chuyển; `null` nếu đơn không còn ở PAID (người gọi bỏ qua, không ghi lệnh)
   */
  async startDispense(tx: Executor, orderId: string): Promise<OrderRecord | null> {
    const order = await this.queries.lockOrder(orderId, tx);
    if (!order || !canCreateDispenseCommand(order.status)) return null;
    return this.transition(
      tx,
      {
        orderId: order.id,
        brandId: order.brandId,
        from: 'PAID',
        to: 'DISPENSE_REQUESTED',
        reason: 'DISPENSE_REQUESTED',
        actorType: 'SYSTEM',
        at: this.clock.now(),
      },
      {},
    );
  }

  /**
   * FR-DSP-17, FR-ORD-19, FR-ORD-27: kết quả thiết bị cho đơn đang DISPENSE_REQUESTED.
   *
   * `DISPENSED` chỉ được gọi khi thiết bị báo `success = true` — không suy từ ACK hay timeout.
   *
   * @returns `false` nếu đơn đã rời DISPENSE_REQUESTED (bản tin đến trễ hoặc trùng) — không đổi gì
   */
  async finishDispense(
    tx: Executor,
    orderId: string,
    outcome: DispenseOrderOutcome,
  ): Promise<boolean> {
    const order = await this.queries.lockOrder(orderId, tx);
    if (!order || order.status !== 'DISPENSE_REQUESTED') return false;
    await this.transition(
      tx,
      {
        orderId: order.id,
        brandId: order.brandId,
        from: 'DISPENSE_REQUESTED',
        to: outcome.to,
        reason:
          outcome.to === 'DISPENSED' ? 'DISPENSE_CONFIRMED' : (outcome.failureCode ?? outcome.to),
        actorType: 'DEVICE',
        metadata: { commandToken: outcome.commandToken },
        at: this.clock.now(),
      },
      {
        ...(outcome.to === 'DISPENSED' ? { dispensedAt: outcome.at } : {}),
        ...(outcome.failureCode ? { failureCode: outcome.failureCode } : {}),
        ...(outcome.manualReview ? { needsManualReview: true } : {}),
      },
    );
    return true;
  }

  // -----------------------------------------------------------------------------------
  // Web quản trị (FR-ORD-18, FR-ORD-22) — phạm vi qua brandScopedOrders
  // -----------------------------------------------------------------------------------

  async search(
    scope: BrandScope,
    filter: OrderSearchFilter,
  ): Promise<{ items: Order[]; total: number }> {
    const { items, total } = await this.queries.search(scope, filter);
    return { items: items.map(toOrderDto), total };
  }

  async get(actor: AuthenticatedUser, scope: BrandScope, orderId: string): Promise<Order> {
    const order = await this.queries.findById(scope, orderId);
    if (!order) throw notFoundFor(actor);
    return toOrderDto(order);
  }

  async history(
    actor: AuthenticatedUser,
    scope: BrandScope,
    orderId: string,
  ): Promise<OrderStatusHistoryEntry[]> {
    // Kiểm phạm vi trên chính đơn trước: bảng lịch sử không có revenue_owner để lọc.
    const order = await this.queries.findById(scope, orderId);
    if (!order) throw notFoundFor(actor);
    const rows = await this.queries.listHistory(orderId);
    return rows.map((r) => ({
      id: r.id,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      reason: r.reason,
      actorType: r.actorType as OrderStatusHistoryEntry['actorType'],
      actorId: r.actorId,
      occurredAt: r.occurredAt.toISOString(),
    }));
  }

  // -----------------------------------------------------------------------------------
  // Nội bộ
  // -----------------------------------------------------------------------------------

  private async createNew(input: CreateOrderInput): Promise<OrderCreated> {
    return this.queries.transaction(async (tx) => {
      const machine = await this.queries.findMachineBySerial(input.machineSerial, tx);
      if (!machine) throw new AppError('NOT_FOUND', 'ord.machineNotFound');
      assertMachineServing(machine);

      const [offer] = await this.queries.listSlotOffers(machine.id, input.slotId, tx);
      if (!offer) throw new AppError('NOT_FOUND', 'ord.slotNotFound');
      if (!isSellable(offer)) throw new AppError('SLOT_UNAVAILABLE', 'ord.slotUnavailable');
      if (await this.queries.machineHasActiveCustomerCommand(machine.id, tx)) {
        throw new AppError('MACHINE_BUSY', 'ord.machineBusy');
      }

      const revenueOwner = revenueOwnerFor(
        offer.rentalStatus as NonNullable<typeof offer.rentalStatus>,
      );
      const now = this.clock.now();
      const expiresAt = new Date(
        now.getTime() + this.config.constraint('ORDER_PAYMENT_TTL_SEC') * 1000,
      );
      const reference = newPaymentReference('ORD', now, machine.timeZone);
      const sale = saleOf(offer, revenueOwner as RevenueOwnerType);

      const created = await this.queries.insertOrder(
        {
          ...sale,
          machineId: machine.id,
          slotId: offer.slotId,
          paymentReference: reference,
          idempotencyKey: input.idempotencyKey,
          expiresAt,
          createdAt: now,
        },
        tx,
      );
      await this.queries.insertHistory(
        {
          orderId: created.id,
          brandId: created.brandId,
          from: null,
          to: 'CREATED',
          reason: 'ORDER_CREATED',
          actorType: 'SYSTEM',
          metadata: input.kioskSessionId ? { kioskSessionId: input.kioskSessionId } : undefined,
          at: now,
        },
        tx,
      );
      const order = await this.transition(
        tx,
        {
          orderId: created.id,
          brandId: created.brandId,
          from: 'CREATED',
          to: 'PENDING_PAYMENT',
          reason: 'PAYMENT_REQUESTED',
          actorType: 'SYSTEM',
          at: now,
        },
        {},
      );
      const intent = await this.payments.createPending(
        {
          brandId: order.brandId,
          target: { orderId: order.id },
          reference,
          amount: order.amount,
          currency: order.currency,
          expiresAt,
          description: `ScentStation ${reference}`,
        },
        tx,
      );
      return { order: toOrderDto(order), qrPayload: intent.qrPayload ?? '', qrImageUrl: null };
    });
  }

  private async replay(order: OrderRecord, input: CreateOrderInput): Promise<OrderCreated> {
    // Cùng khóa nhưng khác slot là lỗi phía kiosk (dùng lại khóa cho ý định khác) — không được
    // trả về một đơn của slot mà khách không chọn.
    if (order.slotId !== input.slotId) {
      throw new AppError('VALIDATION_ERROR', 'ord.idempotencyKeyReused');
    }
    const intent = await this.payments.findLatestIntentForOrder(order.id);
    return { order: toOrderDto(order), qrPayload: intent?.qrPayload ?? '', qrImageUrl: null };
  }
}

const DEFAULT_CURRENCY = 'VND';

/**
 * Slot bán được (FR-ORD-01, FR-ORD-04, FR-SLT-29, FR-BND-04): slot AVAILABLE, có hóa đơn ở trạng
 * thái bán được, đã cấu hình sản phẩm và giá, sản phẩm còn kinh doanh, thương hiệu không bị đình chỉ.
 */
export function isSellable(offer: SlotOfferRecord): boolean {
  return (
    offer.slotStatus === 'AVAILABLE' &&
    offer.rentalId !== null &&
    offer.rentalStatus !== null &&
    revenueOwnerFor(offer.rentalStatus) !== null &&
    offer.pricePerSpray !== null &&
    offer.productId !== null &&
    offer.productName !== null &&
    offer.productStatus === 'ACTIVE' &&
    offer.productDeletedAt === null &&
    offer.brandStatus === 'ACTIVE'
  );
}

/** FR-ORD-04 AC2, AC3. */
function assertMachineServing(machine: KioskMachineRecord): void {
  if (machine.status !== 'ONLINE') throw new AppError('MACHINE_OFFLINE', 'ord.machineOffline');
  if (machine.operatingMode !== 'NORMAL') {
    throw new AppError('MACHINE_IN_MAINTENANCE', 'ord.machineInMaintenance');
  }
}

/** Ảnh chụp đơn từ slot bán được (FR-ORD-05) — gọi sau `isSellable`. */
function saleOf(offer: SlotOfferRecord, revenueOwner: RevenueOwnerType) {
  return {
    brandId: offer.brandId as string,
    slotRentalId: offer.rentalId as string,
    revenueOwner,
    fragranceProductId: offer.productId as string,
    productNameSnapshot: offer.productName as string,
    amount: offer.pricePerSpray as string,
    currency: offer.currency ?? DEFAULT_CURRENCY,
  };
}

function uniqueViolation(error: unknown): string | null {
  const e = error as { code?: string; constraint?: string };
  return e.code === '23505' ? (e.constraint ?? null) : null;
}

export function toOrderDto(order: OrderRecord): Order {
  return {
    id: order.id,
    brandId: order.brandId,
    slotRentalId: order.slotRentalId,
    revenueOwner: order.revenueOwner,
    machineId: order.machineId,
    slotId: order.slotId,
    fragranceProductId: order.fragranceProductId,
    productNameSnapshot: order.productNameSnapshot,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paymentReference: order.paymentReference,
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    dispensedAt: order.dispensedAt ? order.dispensedAt.toISOString() : null,
    failureCode: order.failureCode,
    needsManualReview: order.needsManualReview,
    createdAt: order.createdAt.toISOString(),
  };
}

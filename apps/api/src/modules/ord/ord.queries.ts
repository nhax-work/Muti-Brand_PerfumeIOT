/**
 * SQL của module ORD: đơn hàng, lịch sử trạng thái, danh mục kiosk. Bảng `payments` và
 * `payment_events` thuộc `payment/payment.queries.ts` — dùng chung với phiên thuê slot (ADR-0008).
 *
 * Hàm nào nhận `executor` thì chạy được trong transaction của người gọi — tạo đơn và webhook đều
 * phải ghi nhiều bảng cùng số phận.
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type {
  BrandStatus,
  CommandStatus,
  Json,
  MachineConnectionStatus,
  MachineOperatingMode,
  OrderStatus,
  Orders,
  RevenueOwnerType,
  SlotRentalStatus,
  SlotStatus,
} from '../../shared/db/types.generated.js';
import {
  brandScopedOrders,
  OCCUPYING_RENTAL_STATUSES,
  type BrandScope,
} from '../../shared/scoping/index.js';

type Executor = Kysely<DB>;

export interface OrderRecord {
  readonly id: string;
  readonly brandId: string;
  readonly slotRentalId: string;
  readonly revenueOwner: RevenueOwnerType;
  readonly machineId: string;
  readonly slotId: string;
  readonly fragranceProductId: string;
  readonly productNameSnapshot: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: OrderStatus;
  readonly paymentReference: string;
  readonly idempotencyKey: string;
  readonly expiresAt: Date;
  readonly paidAt: Date | null;
  readonly dispensedAt: Date | null;
  readonly failureCode: string | null;
  readonly needsManualReview: boolean;
  readonly createdAt: Date;
}

export interface KioskMachineRecord {
  readonly id: string;
  readonly serialNumber: string;
  readonly status: MachineConnectionStatus;
  readonly operatingMode: MachineOperatingMode;
  readonly timeZone: string;
}

/** Một slot của máy kèm hóa đơn đang chiếm dụng (nếu có) — đủ để quyết định bán được hay không. */
export interface SlotOfferRecord {
  readonly slotId: string;
  readonly slotNumber: number;
  readonly slotStatus: SlotStatus;
  readonly rentalId: string | null;
  readonly rentalStatus: SlotRentalStatus | null;
  readonly brandId: string | null;
  readonly brandName: string | null;
  readonly brandStatus: BrandStatus | null;
  readonly pricePerSpray: string | null;
  readonly currency: string | null;
  readonly productId: string | null;
  readonly productName: string | null;
  readonly productDescription: string | null;
  readonly productImageUrl: string | null;
  readonly productFragranceNotes: Json | null;
  readonly productStatus: string | null;
  readonly productDeletedAt: Date | null;
}

export interface KioskOrderRecord extends OrderRecord {
  readonly slotNumber: number;
  readonly commandStatus: CommandStatus | null;
  readonly commandAcknowledgedAt: Date | null;
}

export interface OrderHistoryRecord {
  readonly id: string;
  readonly fromStatus: OrderStatus | null;
  readonly toStatus: OrderStatus;
  readonly reason: string | null;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly occurredAt: Date;
}

export interface OrderSearchFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly machineId?: string | undefined;
  readonly slotId?: string | undefined;
  readonly locationId?: string | undefined;
  readonly fragranceProductId?: string | undefined;
  readonly paymentReference?: string | undefined;
  readonly status?: OrderStatus | undefined;
}

export interface NewOrder {
  readonly brandId: string;
  readonly slotRentalId: string;
  readonly revenueOwner: RevenueOwnerType;
  readonly machineId: string;
  readonly slotId: string;
  readonly fragranceProductId: string;
  readonly productNameSnapshot: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentReference: string;
  readonly idempotencyKey: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface StatusChange {
  readonly orderId: string;
  readonly brandId: string;
  readonly from: OrderStatus | null;
  readonly to: OrderStatus;
  /** Mã lý do (FR-ORD-18 AC2): `PAYMENT_CONFIRMED`, `ORDER_PAYMENT_TTL`, `ACTUATOR_FAULT`… */
  readonly reason: string;
  readonly actorType: 'SYSTEM' | 'USER' | 'DEVICE' | 'PAYMENT_PROVIDER';
  readonly actorId?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly at: Date;
}

/** Cột được cập nhật cùng lúc đổi trạng thái — KHÔNG gồm cột ảnh chụp (trigger ADR-0009 chặn). */
export interface OrderStateColumns {
  readonly paidAt?: Date;
  readonly dispensedAt?: Date;
  readonly failureCode?: string | null;
  readonly needsManualReview?: boolean;
}

@Injectable()
export class OrdQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Mở transaction; mọi hàm nhận `executor` chạy được bên trong. */
  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  // -----------------------------------------------------------------------------------
  // Kiosk: máy, slot, danh mục
  // -----------------------------------------------------------------------------------

  async findMachineBySerial(serialNumber: string, executor: Executor = this.db) {
    const row = await executor
      .selectFrom('machines as m')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .select(['m.id', 'm.serial_number', 'm.status', 'm.operating_mode', 'l.timezone'])
      .where('m.serial_number', '=', serialNumber)
      .executeTakeFirst();
    if (!row) return null;
    const record: KioskMachineRecord = {
      id: row.id,
      serialNumber: row.serial_number,
      status: row.status,
      operatingMode: row.operating_mode,
      timeZone: row.timezone,
    };
    return record;
  }

  /**
   * Mọi slot của máy kèm hóa đơn đang chiếm dụng. `uq_slot_active_rental` bảo đảm mỗi slot tối đa
   * một hóa đơn ở trạng thái chiếm dụng, nên LEFT JOIN không nhân bản dòng.
   *
   * @param slotId chỉ lấy một slot (tạo đơn); bỏ trống để lấy cả máy (danh mục kiosk)
   */
  async listSlotOffers(
    machineId: string,
    slotId?: string,
    executor: Executor = this.db,
  ): Promise<SlotOfferRecord[]> {
    let query = executor
      .selectFrom('machine_slots as ms')
      .leftJoin('slot_rentals as sr', (join) =>
        join
          .onRef('sr.slot_id', '=', 'ms.id')
          .on('sr.status', 'in', [...OCCUPYING_RENTAL_STATUSES]),
      )
      .leftJoin('brands as b', 'b.id', 'sr.brand_id')
      .leftJoin('fragrance_products as fp', 'fp.id', 'sr.fragrance_product_id')
      .select([
        'ms.id as slot_id',
        'ms.slot_number',
        'ms.status as slot_status',
        'sr.id as rental_id',
        'sr.status as rental_status',
        'sr.brand_id',
        'sr.price_per_spray',
        'sr.currency',
        'b.name as brand_name',
        'b.status as brand_status',
        'fp.id as product_id',
        'fp.name as product_name',
        'fp.description as product_description',
        'fp.image_url as product_image_url',
        'fp.fragrance_notes as product_fragrance_notes',
        'fp.status as product_status',
        'fp.deleted_at as product_deleted_at',
      ])
      .where('ms.machine_id', '=', machineId)
      .orderBy('ms.slot_number');
    if (slotId) query = query.where('ms.id', '=', slotId);

    const rows = await query.execute();
    return rows.map((r) => ({
      slotId: r.slot_id,
      slotNumber: r.slot_number,
      slotStatus: r.slot_status,
      rentalId: r.rental_id,
      rentalStatus: r.rental_status,
      brandId: r.brand_id,
      brandName: r.brand_name,
      brandStatus: r.brand_status,
      pricePerSpray: r.price_per_spray,
      currency: r.currency,
      productId: r.product_id,
      productName: r.product_name,
      productDescription: r.product_description,
      productImageUrl: r.product_image_url,
      productFragranceNotes: r.product_fragrance_notes,
      productStatus: r.product_status,
      productDeletedAt: r.product_deleted_at,
    }));
  }

  /** FR-ORD-24: máy đang có lệnh CUSTOMER chờ bấm nút (cùng tập trạng thái với index 3b). */
  async machineHasActiveCustomerCommand(machineId: string, executor: Executor = this.db) {
    const row = await executor
      .selectFrom('dispense_commands')
      .select('id')
      .where('machine_id', '=', machineId)
      .where('command_type', '=', 'CUSTOMER')
      .where('status', 'in', ['CREATED', 'SENT', 'ACKNOWLEDGED'])
      .executeTakeFirst();
    return row !== undefined;
  }

  // -----------------------------------------------------------------------------------
  // Đơn hàng
  // -----------------------------------------------------------------------------------

  async findByIdempotencyKey(key: string, executor: Executor = this.db) {
    const row = await executor
      .selectFrom('orders')
      .selectAll()
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    return row ? toOrderRecord(row) : null;
  }

  /** Khóa đơn để đổi trạng thái — webhook và job hết hạn không giẫm lên nhau. */
  async lockOrder(orderId: string, executor: Executor): Promise<OrderRecord | null> {
    const row = await executor
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', orderId)
      .forUpdate()
      .executeTakeFirst();
    return row ? toOrderRecord(row) : null;
  }

  async insertOrder(order: NewOrder, executor: Executor): Promise<OrderRecord> {
    const row = await executor
      .insertInto('orders')
      .values({
        brand_id: order.brandId,
        slot_rental_id: order.slotRentalId,
        revenue_owner: order.revenueOwner,
        machine_id: order.machineId,
        slot_id: order.slotId,
        fragrance_product_id: order.fragranceProductId,
        product_name_snapshot: order.productNameSnapshot,
        amount: order.amount,
        currency: order.currency,
        status: 'CREATED',
        payment_reference: order.paymentReference,
        idempotency_key: order.idempotencyKey,
        expires_at: order.expiresAt,
        created_at: order.createdAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toOrderRecord(row);
  }

  /** Một dòng lịch sử chuyển trạng thái (FR-ORD-18); dòng đầu của đơn là null → CREATED. */
  async insertHistory(change: StatusChange, executor: Executor): Promise<void> {
    await executor
      .insertInto('order_status_histories')
      .values({
        brand_id: change.brandId,
        order_id: change.orderId,
        from_status: change.from,
        to_status: change.to,
        reason: change.reason,
        metadata: change.metadata ? JSON.stringify(change.metadata) : null,
        actor_type: change.actorType,
        actor_id: change.actorId ?? null,
        occurred_at: change.at,
      })
      .execute();
  }

  /**
   * Đổi trạng thái có điều kiện `status = from` và ghi lịch sử, trong cùng executor. Trả `null` nếu
   * đơn không còn ở `from` — người gọi đã khóa đơn thì điều này không xảy ra.
   */
  async applyTransition(
    change: StatusChange & { readonly from: OrderStatus },
    columns: OrderStateColumns,
    executor: Executor,
  ): Promise<OrderRecord | null> {
    const row = await executor
      .updateTable('orders')
      .set({
        status: change.to,
        ...(columns.paidAt !== undefined ? { paid_at: columns.paidAt } : {}),
        ...(columns.dispensedAt !== undefined ? { dispensed_at: columns.dispensedAt } : {}),
        ...(columns.failureCode !== undefined ? { failure_code: columns.failureCode } : {}),
        ...(columns.needsManualReview !== undefined
          ? { needs_manual_review: columns.needsManualReview }
          : {}),
      })
      .where('id', '=', change.orderId)
      .where('status', '=', change.from)
      .returningAll()
      .executeTakeFirst();
    if (!row) return null;
    await this.insertHistory(change, executor);
    return toOrderRecord(row);
  }

  /** Cắm cờ kiểm tra thủ công mà không đổi trạng thái (FR-ORD-14 AC2). */
  async flagManualReview(orderId: string, executor: Executor): Promise<void> {
    await executor
      .updateTable('orders')
      .set({ needs_manual_review: true })
      .where('id', '=', orderId)
      .execute();
  }

  /** Đơn PENDING_PAYMENT đã quá hạn, cũ nhất trước — cho job FR-ORD-16. */
  async listOverduePendingOrderIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('orders')
      .select('id')
      .where('status', '=', 'PENDING_PAYMENT')
      .where('expires_at', '<=', now)
      .orderBy('expires_at')
      .limit(limit)
      .execute();
    return rows.map((r) => r.id);
  }

  /** Trạng thái đơn cho kiosk: kèm số slot và lệnh CUSTOMER mới nhất (FR-ORD-11, FR-ORD-26). */
  async findKioskOrder(orderId: string): Promise<KioskOrderRecord | null> {
    const row = await this.db
      .selectFrom('orders as o')
      .innerJoin('machine_slots as ms', 'ms.id', 'o.slot_id')
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('dispense_commands as dc')
            .select(['dc.status', 'dc.acknowledged_at'])
            .whereRef('dc.order_id', '=', 'o.id')
            .where('dc.command_type', '=', 'CUSTOMER')
            .orderBy('dc.created_at', 'desc')
            .limit(1)
            .as('cmd'),
        (join) => join.onTrue(),
      )
      .selectAll('o')
      .select([
        'ms.slot_number',
        'cmd.status as command_status',
        'cmd.acknowledged_at as command_acknowledged_at',
      ])
      .where('o.id', '=', orderId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      ...toOrderRecord(row),
      slotNumber: row.slot_number,
      commandStatus: row.command_status,
      commandAcknowledgedAt: row.command_acknowledged_at,
    };
  }

  // -----------------------------------------------------------------------------------
  // Tra cứu đơn cho web quản trị (FR-ORD-18, FR-ORD-22) — luôn qua brandScopedOrders
  // -----------------------------------------------------------------------------------

  async search(
    scope: BrandScope,
    filter: OrderSearchFilter,
  ): Promise<{ items: OrderRecord[]; total: number }> {
    let base = this.db
      .selectFrom('orders as o')
      .innerJoin('machines as m', 'm.id', 'o.machine_id')
      .where(brandScopedOrders(scope, 'o'));
    if (filter.from) base = base.where('o.created_at', '>=', filter.from);
    if (filter.to) base = base.where('o.created_at', '<', filter.to);
    if (filter.machineId) base = base.where('o.machine_id', '=', filter.machineId);
    if (filter.slotId) base = base.where('o.slot_id', '=', filter.slotId);
    // Lọc địa điểm qua machines chỉ để thu hẹp; phạm vi thương hiệu vẫn nằm ở brandScopedOrders.
    if (filter.locationId) base = base.where('m.location_id', '=', filter.locationId);
    if (filter.fragranceProductId) {
      base = base.where('o.fragrance_product_id', '=', filter.fragranceProductId);
    }
    if (filter.paymentReference) {
      base = base.where('o.payment_reference', '=', filter.paymentReference);
    }
    if (filter.status) base = base.where('o.status', '=', filter.status);

    const [rows, count] = await Promise.all([
      base
        .selectAll('o')
        .orderBy('o.created_at', 'desc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map(toOrderRecord), total: Number(count.total) };
  }

  async findById(scope: BrandScope, orderId: string): Promise<OrderRecord | null> {
    const row = await this.db
      .selectFrom('orders as o')
      .selectAll('o')
      .where('o.id', '=', orderId)
      .where(brandScopedOrders(scope, 'o'))
      .executeTakeFirst();
    return row ? toOrderRecord(row) : null;
  }

  async listHistory(orderId: string): Promise<OrderHistoryRecord[]> {
    const rows = await this.db
      .selectFrom('order_status_histories')
      .select(['id', 'from_status', 'to_status', 'reason', 'actor_type', 'actor_id', 'occurred_at'])
      .where('order_id', '=', orderId)
      // Hai dòng tạo đơn (null → CREATED → PENDING_PAYMENT) cùng một mốc thời gian vì ghi trong một
      // transaction; dòng có from_status NULL luôn đứng đầu.
      .orderBy('occurred_at')
      .orderBy(sql`from_status is null`, 'desc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      reason: r.reason,
      actorType: r.actor_type,
      actorId: r.actor_id,
      occurredAt: r.occurred_at,
    }));
  }
}

function toOrderRecord(row: Selectable<Orders>): OrderRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    slotRentalId: row.slot_rental_id,
    revenueOwner: row.revenue_owner,
    machineId: row.machine_id,
    slotId: row.slot_id,
    fragranceProductId: row.fragrance_product_id,
    productNameSnapshot: row.product_name_snapshot,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    paymentReference: row.payment_reference,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    dispensedAt: row.dispensed_at,
    failureCode: row.failure_code,
    needsManualReview: row.needs_manual_review,
    createdAt: row.created_at,
  };
}

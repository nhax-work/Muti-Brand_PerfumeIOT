/**
 * SQL của module RFQ — yêu cầu bổ sung nước hoa (FR-RFQ-01 ÷ 12, ADR-0018 mục 2). Chỉ module rfq được
 * import file này (QT3, ADR-0003).
 *
 * Hàm `lock…` dùng `FOR UPDATE` — chỉ gọi trong transaction.
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type {
  RefillRequestReason,
  RefillRequestStatus,
  SlotRentalStatus,
} from '../../shared/db/types.generated.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';

type Executor = Kysely<DB>;

export interface RefillRequestRecord {
  readonly id: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly slotRentalId: string;
  readonly slotId: string;
  readonly slotNumber: number;
  readonly machineId: string;
  readonly machineSerial: string;
  readonly fragranceProductId: string;
  readonly productName: string;
  readonly reason: RefillRequestReason;
  readonly status: RefillRequestStatus;
  readonly requestedBy: string;
  readonly reviewedBy: string | null;
  readonly rejectionReason: string | null;
  readonly scheduledAt: Date | null;
  readonly refillSessionId: string | null;
  readonly note: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Hóa đơn mà thương hiệu gửi yêu cầu bổ sung cho — đọc trong phạm vi thương hiệu. */
export interface RequestableRental {
  readonly id: string;
  readonly brandId: string;
  readonly slotId: string;
  readonly status: SlotRentalStatus;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly fragranceProductId: string | null;
}

export interface RefillRequestFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: RefillRequestStatus | undefined;
}

@Injectable()
export class RfqQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  /** Hóa đơn theo id trong phạm vi người gọi — hóa đơn của thương hiệu khác trả `null` (BR-012). */
  async findRental(
    scope: BrandScope,
    rentalId: string,
    executor: Executor,
  ): Promise<RequestableRental | null> {
    const row = await executor
      .selectFrom('slot_rentals as r')
      .select([
        'r.id',
        'r.brand_id',
        'r.slot_id',
        'r.status',
        'r.paid_at',
        'r.cancelled_at',
        'r.fragrance_product_id',
      ])
      .where('r.id', '=', rentalId)
      .where(brandScopedByColumn(scope, 'r.brand_id'))
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          slotId: row.slot_id,
          status: row.status,
          paidAt: row.paid_at,
          cancelledAt: row.cancelled_at,
          fragranceProductId: row.fragrance_product_id,
        }
      : null;
  }

  async slotHasOpenRequest(slotId: string, executor: Executor): Promise<boolean> {
    const row = await executor
      .selectFrom('refill_requests')
      .select('id')
      .where('slot_id', '=', slotId)
      .where('status', 'in', ['SUBMITTED', 'ACCEPTED', 'SCHEDULED'])
      .executeTakeFirst();
    return row !== undefined;
  }

  async insert(
    data: {
      readonly brandId: string;
      readonly slotRentalId: string;
      readonly slotId: string;
      readonly fragranceProductId: string;
      readonly reason: RefillRequestReason;
      readonly note: string | null;
      readonly requestedBy: string;
      readonly at: Date;
    },
    tx: Executor,
  ): Promise<string> {
    const row = await tx
      .insertInto('refill_requests')
      .values({
        brand_id: data.brandId,
        slot_rental_id: data.slotRentalId,
        slot_id: data.slotId,
        fragrance_product_id: data.fragranceProductId,
        reason: data.reason,
        status: 'SUBMITTED',
        note: data.note,
        requested_by: data.requestedBy,
        created_at: data.at,
        updated_at: data.at,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async list(
    scope: BrandScope,
    filter: RefillRequestFilter,
  ): Promise<{ items: RefillRequestRecord[]; total: number }> {
    let base = this.base(this.db).where(brandScopedByColumn(scope, 'q.brand_id'));
    if (filter.status) base = base.where('q.status', '=', filter.status);
    const [rows, count] = await Promise.all([
      base
        .selectAll()
        .orderBy('created_at', 'desc')
        .orderBy('id', 'asc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select(sql<string>`count(*)`.as('total')).executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map(toRecord), total: Number(count.total) };
  }

  async find(
    scope: BrandScope,
    id: string,
    executor: Executor = this.db,
  ): Promise<RefillRequestRecord | null> {
    const row = await this.base(executor)
      .selectAll()
      .where('q.id', '=', id)
      .where(brandScopedByColumn(scope, 'q.brand_id'))
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async lock(
    id: string,
    tx: Executor,
  ): Promise<{
    id: string;
    brandId: string;
    slotId: string;
    status: RefillRequestStatus;
    refillSessionId: string | null;
  } | null> {
    const row = await tx
      .selectFrom('refill_requests')
      .select(['id', 'brand_id', 'slot_id', 'status', 'refill_session_id'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          slotId: row.slot_id,
          status: row.status,
          refillSessionId: row.refill_session_id,
        }
      : null;
  }

  async update(
    id: string,
    data: {
      readonly status: RefillRequestStatus;
      readonly at: Date;
      readonly reviewedBy?: string;
      readonly rejectionReason?: string;
      readonly scheduledAt?: Date;
      readonly refillSessionId?: string;
    },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('refill_requests')
      .set({
        status: data.status,
        updated_at: data.at,
        ...(data.reviewedBy !== undefined ? { reviewed_by: data.reviewedBy } : {}),
        ...(data.rejectionReason !== undefined ? { rejection_reason: data.rejectionReason } : {}),
        ...(data.scheduledAt !== undefined ? { scheduled_at: data.scheduledAt } : {}),
        ...(data.refillSessionId !== undefined ? { refill_session_id: data.refillSessionId } : {}),
      })
      .where('id', '=', id)
      .execute();
  }

  async linkSession(id: string, sessionId: string, at: Date, tx: Executor): Promise<void> {
    await tx
      .updateTable('refill_requests')
      .set({ refill_session_id: sessionId, updated_at: at })
      .where('id', '=', id)
      .execute();
  }

  /** Yêu cầu còn mở đang liên kết với phiên nạp — khóa để chuyển COMPLETED (FR-RFQ-09). */
  async lockOpenBySession(
    sessionId: string,
    tx: Executor,
  ): Promise<{ id: string; brandId: string; status: RefillRequestStatus }[]> {
    const rows = await tx
      .selectFrom('refill_requests')
      .select(['id', 'brand_id', 'status'])
      .where('refill_session_id', '=', sessionId)
      .where('status', 'in', ['ACCEPTED', 'SCHEDULED'])
      .forUpdate()
      .execute();
    return rows.map((r) => ({ id: r.id, brandId: r.brand_id, status: r.status }));
  }

  /** Người nhận thông báo yêu cầu mới (FR-RFQ-05): Super Admin và Inventory Staff đang hoạt động. */
  async staffRecipients(executor: Executor): Promise<string[]> {
    const rows = await executor
      .selectFrom('users as u')
      .select('u.id')
      .distinct()
      .where('u.status', '=', 'ACTIVE')
      .where('u.brand_id', 'is', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('user_roles as ur')
            .innerJoin('roles as r', 'r.id', 'ur.role_id')
            .select('ur.id')
            .whereRef('ur.user_id', '=', 'u.id')
            .where('r.code', 'in', ['PLATFORM_SUPER_ADMIN', 'INVENTORY_STAFF']),
        ),
      )
      .execute();
    return rows.map((r) => r.id);
  }

  async insertInAppNotifications(
    data: {
      readonly brandId: string;
      readonly recipients: readonly string[];
      readonly type: string;
      readonly subject: string;
      readonly content: string;
      readonly referenceId: string;
      readonly at: Date;
    },
    executor: Executor,
  ): Promise<void> {
    if (data.recipients.length === 0) return;
    await executor
      .insertInto('notifications')
      .values(
        data.recipients.map((recipient) => ({
          brand_id: data.brandId,
          recipient_user_id: recipient,
          type: data.type,
          channel: 'IN_APP',
          subject: data.subject,
          content: data.content,
          status: 'SENT' as const,
          sent_at: data.at,
          reference_id: data.referenceId,
          created_at: data.at,
        })),
      )
      .execute();
  }

  /** Một yêu cầu kèm tên hiển thị (ADR-0018). Bọc truy vấn con để lọc, sắp xếp theo tên cột phẳng. */
  private base(executor: Executor) {
    return executor.selectFrom((eb) =>
      eb
        .selectFrom('refill_requests as rr')
        .innerJoin('brands as b', 'b.id', 'rr.brand_id')
        .innerJoin('machine_slots as s', 's.id', 'rr.slot_id')
        .innerJoin('machines as m', 'm.id', 's.machine_id')
        .innerJoin('fragrance_products as fp', 'fp.id', 'rr.fragrance_product_id')
        .select([
          'rr.id',
          'rr.brand_id',
          'b.name as brand_name',
          'rr.slot_rental_id',
          'rr.slot_id',
          's.slot_number',
          's.machine_id',
          'm.serial_number as machine_serial',
          'rr.fragrance_product_id',
          'fp.name as product_name',
          'rr.reason',
          'rr.status',
          'rr.requested_by',
          'rr.reviewed_by',
          'rr.rejection_reason',
          'rr.scheduled_at',
          'rr.refill_session_id',
          'rr.note',
          'rr.created_at',
          'rr.updated_at',
        ])
        .as('q'),
    );
  }
}

function toRecord(r: {
  id: string;
  brand_id: string;
  brand_name: string;
  slot_rental_id: string;
  slot_id: string;
  slot_number: number;
  machine_id: string;
  machine_serial: string;
  fragrance_product_id: string;
  product_name: string;
  reason: RefillRequestReason;
  status: RefillRequestStatus;
  requested_by: string;
  reviewed_by: string | null;
  rejection_reason: string | null;
  scheduled_at: Date | null;
  refill_session_id: string | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}): RefillRequestRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    brandName: r.brand_name,
    slotRentalId: r.slot_rental_id,
    slotId: r.slot_id,
    slotNumber: r.slot_number,
    machineId: r.machine_id,
    machineSerial: r.machine_serial,
    fragranceProductId: r.fragrance_product_id,
    productName: r.product_name,
    reason: r.reason,
    status: r.status,
    requestedBy: r.requested_by,
    reviewedBy: r.reviewed_by,
    rejectionReason: r.rejection_reason,
    scheduledAt: r.scheduled_at,
    refillSessionId: r.refill_session_id,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

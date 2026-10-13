/**
 * Truy vấn phiếu khiếu nại hoàn tiền (ADR-0012). Khối mã hóa (`account_ciphertext`,
 * `contact_ciphertext`) chỉ được đọc ở `findSecretsById` — mọi truy vấn khác không select chúng.
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../../shared/db/index.js';
import type { OrderStatus, RefundClaimStatus } from '../../../shared/db/types.generated.js';

type Executor = Kysely<DB>;

export interface ClaimOrderRecord {
  readonly id: string;
  readonly brandId: string;
  readonly machineId: string;
  readonly status: OrderStatus;
  readonly paidAt: Date | null;
  readonly needsManualReview: boolean;
  readonly amount: string;
  readonly currency: string;
  readonly extraTransfers: number;
  readonly hasClaim: boolean;
}

export interface RefundClaimRecord {
  readonly id: string;
  readonly orderId: string;
  readonly brandId: string;
  readonly paymentReference: string;
  readonly status: RefundClaimStatus;
  readonly refundOrder: boolean;
  readonly amount: string;
  readonly currency: string;
  readonly hasRefundAccount: boolean;
  readonly assignedTo: string | null;
  readonly assignedAt: Date | null;
  readonly payoutReference: string | null;
  readonly resolutionNote: string | null;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
}

export interface NewRefundClaim {
  readonly orderId: string;
  readonly brandId: string;
  readonly refundOrder: boolean;
  readonly amount: string;
  readonly currency: string;
  readonly accountCiphertext: Buffer;
  readonly contactCiphertext: Buffer;
  readonly keyVersion: number;
  readonly consentedAt: Date;
}

export interface ClaimListFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: RefundClaimStatus | undefined;
  readonly assignedTo?: string | undefined;
}

const EXTRA_TRANSFER_RESULT = 'EXTRA_TRANSFER_REFUND_PENDING';

@Injectable()
export class RefundClaimsQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  /** Dữ kiện để quyết định đơn có được khiếu nại không, kèm số lần chuyển khoản thừa. */
  async findClaimOrder(
    orderId: string,
    executor: Executor = this.db,
  ): Promise<ClaimOrderRecord | null> {
    const row = await executor
      .selectFrom('orders as o')
      .select([
        'o.id',
        'o.brand_id',
        'o.machine_id',
        'o.status',
        'o.paid_at',
        'o.needs_manual_review',
        'o.amount',
        'o.currency',
      ])
      .select((eb) => [
        eb
          .selectFrom('payment_events as pe')
          .innerJoin('payments as p', 'p.id', 'pe.payment_id')
          .whereRef('p.order_id', '=', 'o.id')
          .where('pe.processing_result', '=', EXTRA_TRANSFER_RESULT)
          .select((e) => e.fn.countAll<string>().as('n'))
          .as('extra_transfers'),
        eb
          .exists(
            eb
              .selectFrom('refund_claims as rc')
              .whereRef('rc.order_id', '=', 'o.id')
              .select('rc.id'),
          )
          .as('has_claim'),
      ])
      .where('o.id', '=', orderId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      brandId: row.brand_id,
      machineId: row.machine_id,
      status: row.status,
      paidAt: row.paid_at,
      needsManualReview: row.needs_manual_review,
      amount: row.amount,
      currency: row.currency,
      extraTransfers: Number(row.extra_transfers ?? 0),
      hasClaim: Boolean(row.has_claim),
    };
  }

  /** @returns id phiếu mới; `null` nếu đơn đã có phiếu (uq_refund_claim_order — hai lần gửi đồng thời). */
  async insert(
    claim: NewRefundClaim,
    executor: Executor = this.db,
  ): Promise<RefundClaimRecord | null> {
    const inserted = await executor
      .insertInto('refund_claims')
      .values({
        order_id: claim.orderId,
        brand_id: claim.brandId,
        refund_order: claim.refundOrder,
        amount: claim.amount,
        currency: claim.currency,
        account_ciphertext: claim.accountCiphertext,
        contact_ciphertext: claim.contactCiphertext,
        pii_key_version: claim.keyVersion,
        consented_at: claim.consentedAt,
      })
      .onConflict((oc) => oc.column('order_id').doNothing())
      .returning('id')
      .executeTakeFirst();
    return inserted ? this.findById(inserted.id, executor) : null;
  }

  async list(filter: ClaimListFilter): Promise<{ items: RefundClaimRecord[]; total: number }> {
    let base = this.db
      .selectFrom('refund_claims as rc')
      .innerJoin('orders as o', 'o.id', 'rc.order_id');
    if (filter.status) base = base.where('rc.status', '=', filter.status);
    if (filter.assignedTo) base = base.where('rc.assigned_to', '=', filter.assignedTo);
    const [rows, count] = await Promise.all([
      base
        .select(PUBLIC_COLUMNS)
        .orderBy('rc.created_at', 'asc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map(toRecord), total: Number(count.total) };
  }

  async findById(id: string, executor: Executor = this.db): Promise<RefundClaimRecord | null> {
    const row = await executor
      .selectFrom('refund_claims as rc')
      .innerJoin('orders as o', 'o.id', 'rc.order_id')
      .select(PUBLIC_COLUMNS)
      .where('rc.id', '=', id)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  /** Khóa phiếu trong `tx` trước khi đổi trạng thái. */
  async lockById(id: string, tx: Executor): Promise<RefundClaimRecord | null> {
    await tx.selectFrom('refund_claims').select('id').where('id', '=', id).forUpdate().execute();
    return this.findById(id, tx);
  }

  /** Chỗ DUY NHẤT đọc khối mã hóa — chỉ gọi sau khi đã kiểm người được phân công. */
  async findSecretsById(
    id: string,
  ): Promise<{ account: Buffer | null; contact: Buffer | null; keyVersion: number } | null> {
    const row = await this.db
      .selectFrom('refund_claims')
      .select(['account_ciphertext', 'contact_ciphertext', 'pii_key_version'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row
      ? {
          account: row.account_ciphertext,
          contact: row.contact_ciphertext,
          keyVersion: row.pii_key_version,
        }
      : null;
  }

  async assign(id: string, assigneeId: string, at: Date, tx: Executor): Promise<void> {
    await tx
      .updateTable('refund_claims')
      .set({ assigned_to: assigneeId, assigned_at: at })
      .where('id', '=', id)
      .execute();
  }

  /** Đóng phiếu và xóa tài khoản trong cùng câu lệnh — chk_refund_claim_account_purged_on_close. */
  async close(
    id: string,
    change: {
      readonly status: Exclude<RefundClaimStatus, 'OPEN'>;
      readonly at: Date;
      readonly resolvedBy: string | null;
      readonly payoutReference?: string;
      readonly resolutionNote?: string | null;
    },
    executor: Executor,
  ): Promise<void> {
    await executor
      .updateTable('refund_claims')
      .set({
        status: change.status,
        closed_at: change.at,
        resolved_by: change.resolvedBy,
        account_ciphertext: null,
        account_purged_at: change.at,
        ...(change.payoutReference !== undefined
          ? { payout_reference: change.payoutReference }
          : {}),
        ...(change.resolutionNote !== undefined ? { resolution_note: change.resolutionNote } : {}),
      })
      .where('id', '=', id)
      .where('status', '=', 'OPEN')
      .execute();
  }

  async isActiveOperationsStaff(userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('users as u')
      .innerJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('u.id')
      .where('u.id', '=', userId)
      .where('u.status', '=', 'ACTIVE')
      .where('r.code', '=', 'OPERATIONS_STAFF')
      .executeTakeFirst();
    return row !== undefined;
  }

  // -----------------------------------------------------------------------------------
  // Job (FR-ORD-31, FR-ORD-32) — quét theo mốc thời gian, chạy bù được sau downtime
  // -----------------------------------------------------------------------------------

  async listStaleOpenIds(openedBefore: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('refund_claims')
      .select('id')
      .where('status', '=', 'OPEN')
      .where('created_at', '<=', openedBefore)
      .orderBy('created_at')
      .limit(limit)
      .execute();
    return rows.map((r) => r.id);
  }

  async purgeContacts(closedBefore: Date, at: Date): Promise<number> {
    const result = await this.db
      .updateTable('refund_claims')
      .set({ contact_ciphertext: null, contact_purged_at: at })
      .where('status', '<>', 'OPEN')
      .where('closed_at', '<=', closedBefore)
      .where('contact_ciphertext', 'is not', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** Phiếu mở quá SLA, kèm máy của đơn để gắn cảnh báo (alerts.machine_id NOT NULL). */
  async listSlaBreaches(
    openedBefore: Date,
  ): Promise<{ id: string; brandId: string; machineId: string; createdAt: Date }[]> {
    const rows = await this.db
      .selectFrom('refund_claims as rc')
      .innerJoin('orders as o', 'o.id', 'rc.order_id')
      .select(['rc.id', 'rc.brand_id', 'o.machine_id', 'rc.created_at'])
      .where('rc.status', '=', 'OPEN')
      .where('rc.created_at', '<=', openedBefore)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      brandId: r.brand_id,
      machineId: r.machine_id,
      createdAt: r.created_at,
    }));
  }

  /**
   * Cảnh báo phiếu quá SLA (FR-ORD-32). Chống trùng bằng uq_alert_dedup_unresolved (FR-ALR-07):
   * đã có cảnh báo chưa xử lý cùng khóa thì không tạo thêm.
   */
  async raiseSlaAlert(
    claim: { id: string; brandId: string; machineId: string; createdAt: Date },
    at: Date,
  ): Promise<boolean> {
    const result = await sql<{ id: string }>`
      INSERT INTO alerts (brand_id, machine_id, type, severity, deduplication_key, title, description,
                          first_occurred_at, last_occurred_at)
      VALUES (${claim.brandId}, ${claim.machineId}, 'REFUND_CLAIM_SLA_BREACHED', 'HIGH',
              ${`REFUND_CLAIM_SLA:${claim.id}`}, ${'Phiếu khiếu nại hoàn tiền quá hạn xử lý'},
              ${`Phiếu ${claim.id} mở từ ${claim.createdAt.toISOString()} chưa được xử lý (BR-002).`},
              ${at}, ${at})
      ON CONFLICT DO NOTHING
      RETURNING id`.execute(this.db);
    return result.rows.length > 0;
  }
}

const PUBLIC_COLUMNS = [
  'rc.id',
  'rc.order_id',
  'rc.brand_id',
  'o.payment_reference',
  'rc.status',
  'rc.refund_order',
  'rc.amount',
  'rc.currency',
  'rc.assigned_to',
  'rc.assigned_at',
  'rc.payout_reference',
  'rc.resolution_note',
  'rc.created_at',
  'rc.closed_at',
  sql<boolean>`rc.account_ciphertext IS NOT NULL`.as('has_refund_account'),
] as const;

function toRecord(row: {
  id: string;
  order_id: string;
  brand_id: string;
  payment_reference: string;
  status: RefundClaimStatus;
  refund_order: boolean;
  amount: string;
  currency: string;
  assigned_to: string | null;
  assigned_at: Date | null;
  payout_reference: string | null;
  resolution_note: string | null;
  created_at: Date;
  closed_at: Date | null;
  has_refund_account: boolean;
}): RefundClaimRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    brandId: row.brand_id,
    paymentReference: row.payment_reference,
    status: row.status,
    refundOrder: row.refund_order,
    amount: row.amount,
    currency: row.currency,
    hasRefundAccount: row.has_refund_account,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at,
    payoutReference: row.payout_reference,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

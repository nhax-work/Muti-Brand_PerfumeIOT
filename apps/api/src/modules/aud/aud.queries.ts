/**
 * SQL của module AUD — tra cứu nhật ký (FR-AUD-08) và truy vết đầu-cuối một đơn (FR-AUD-11). Chỉ
 * module aud được import file này (QT3, ADR-0003). Mọi truy vấn chỉ đọc.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import type { Kysely } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';

type Executor = Kysely<DB>;

type StatusHistoryEntry = Schema<'OrderStatusHistoryEntry'>;
type Payment = Schema<'Payment'>;
type DispenseCommand = Schema<'DispenseCommand'>;
type InventoryAdjustment = Schema<'InventoryAdjustment'>;
type AuditLogEntry = Schema<'AuditLogEntry'>;

export interface AuditLogFilter {
  readonly page?: number;
  readonly pageSize?: number;
  readonly from?: Date;
  readonly to?: Date;
  readonly actorId?: string;
  readonly action?: string;
  readonly targetType?: string;
  readonly targetId?: string;
}

export interface AuditLogRow {
  readonly id: string;
  readonly brandId: string | null;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly sourceIp: string | null;
  readonly severity: string;
  readonly beforeData: unknown | null;
  readonly afterData: unknown | null;
  readonly metadata: unknown | null;
  readonly occurredAt: Date;
}

function parseJson(val: unknown): unknown | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return null;
}

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

@Injectable()
export class AudQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listAuditLogs(
    filter: AuditLogFilter,
    executor: Executor = this.db,
  ): Promise<{ items: AuditLogRow[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let base = executor.selectFrom('audit_logs');

    if (filter.from) {
      base = base.where('occurred_at', '>=', filter.from);
    }
    if (filter.to) {
      base = base.where('occurred_at', '<', filter.to);
    }
    if (filter.actorId) {
      base = base.where('actor_id', '=', filter.actorId);
    }
    if (filter.action) {
      base = base.where('action', 'like', `%${filter.action}%`);
    }
    if (filter.targetType) {
      base = base.where('target_type', '=', filter.targetType);
    }
    if (filter.targetId) {
      base = base.where('target_id', '=', filter.targetId);
    }

    const countRes = await base
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .executeTakeFirst();
    const total = Number(countRes?.count ?? 0);

    const rows = await base
      .selectAll()
      .orderBy('occurred_at', 'desc')
      .limit(pageSize)
      .offset(offset)
      .execute();

    return {
      items: rows.map((r) => ({
        id: r.id,
        brandId: r.brand_id,
        actorType: r.actor_type,
        actorId: r.actor_id,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        sourceIp: r.source_ip,
        severity: r.severity,
        beforeData: parseJson(r.before_data),
        afterData: parseJson(r.after_data),
        metadata: parseJson(r.metadata),
        occurredAt: new Date(r.occurred_at),
      })),
      total,
    };
  }

  async statusHistory(orderId: string): Promise<StatusHistoryEntry[]> {
    const rows = await this.db
      .selectFrom('order_status_histories')
      .select(['id', 'from_status', 'to_status', 'reason', 'actor_type', 'actor_id', 'occurred_at'])
      .where('order_id', '=', orderId)
      .orderBy('occurred_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      reason: r.reason,
      actorType: r.actor_type as StatusHistoryEntry['actorType'],
      actorId: r.actor_id,
      occurredAt: r.occurred_at.toISOString(),
    }));
  }

  /** Mọi thanh toán của đơn, kể cả lần chuyển tiền thừa và trạng thái hoàn tiền (FR-ORD-20). */
  async payments(orderId: string): Promise<Payment[]> {
    const rows = await this.db
      .selectFrom('payments')
      .select([
        'id',
        'order_id',
        'rental_checkout_id',
        'provider',
        'provider_transaction_id',
        'amount',
        'currency',
        'status',
        'paid_at',
      ])
      .where('order_id', '=', orderId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      rentalCheckoutId: r.rental_checkout_id,
      provider: r.provider,
      providerTransactionId: r.provider_transaction_id,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      paidAt: iso(r.paid_at),
    }));
  }

  /** Lệnh xịt của đơn kèm kết quả thiết bị (FR-DSP-15, 16). */
  async dispenseCommands(orderId: string): Promise<DispenseCommand[]> {
    const rows = await this.db
      .selectFrom('dispense_commands as dc')
      .leftJoin('dispense_results as dr', 'dr.command_id', 'dc.id')
      .select([
        'dc.id',
        'dc.order_id',
        'dc.brand_id',
        'dc.machine_id',
        'dc.slot_id',
        'dc.command_type',
        'dc.command_token',
        'dc.status',
        'dc.expires_at',
        'dc.sent_at',
        'dc.acknowledged_at',
        'dc.completed_at',
        'dc.retry_count',
        'dc.created_at',
        'dr.command_id as result_command_id',
        'dr.success',
        'dr.result_code',
        'dr.failure_code',
        'dr.executed_at',
        'dr.received_at',
      ])
      .where('dc.order_id', '=', orderId)
      .orderBy('dc.created_at', 'asc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      brandId: r.brand_id,
      machineId: r.machine_id,
      slotId: r.slot_id,
      commandType: r.command_type,
      commandToken: r.command_token,
      status: r.status,
      expiresAt: r.expires_at.toISOString(),
      sentAt: iso(r.sent_at),
      acknowledgedAt: iso(r.acknowledged_at),
      completedAt: iso(r.completed_at),
      retryCount: r.retry_count,
      createdAt: r.created_at.toISOString(),
      result:
        r.result_command_id === null || r.received_at === null
          ? null
          : {
              commandId: r.result_command_id,
              success: Boolean(r.success),
              resultCode: r.result_code,
              failureCode: r.failure_code,
              executedAt: iso(r.executed_at),
              receivedAt: r.received_at.toISOString(),
            },
    }));
  }

  /**
   * Điều chỉnh tồn kho trên slot của đơn, từ lúc tạo đơn tới lúc đơn kế tiếp trên slot đó được tạo
   * (FR-AUD-11 AC1). `inventory_adjustments` không có cột đơn hàng, nên đây là cửa sổ thời gian mà
   * thay đổi tồn kho có thể liên quan tới lượt xịt của đơn.
   */
  async inventoryAdjustments(order: {
    readonly id: string;
    readonly slotId: string;
    readonly createdAt: Date;
  }): Promise<InventoryAdjustment[]> {
    const next = await this.db
      .selectFrom('orders')
      .select('created_at')
      .where('slot_id', '=', order.slotId)
      .where('created_at', '>', order.createdAt)
      .where('id', '<>', order.id)
      .orderBy('created_at', 'asc')
      .limit(1)
      .executeTakeFirst();
    const rows = await this.db
      .selectFrom('inventory_adjustments')
      .select([
        'id',
        'brand_id',
        'bottle_id',
        'slot_id',
        'before_quantity_ml',
        'after_quantity_ml',
        'difference_ml',
        'reason',
        'adjusted_by',
        'created_at',
      ])
      .where('slot_id', '=', order.slotId)
      .where('created_at', '>=', order.createdAt)
      .$if(next !== undefined, (qb) => qb.where('created_at', '<', next!.created_at))
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      brandId: r.brand_id,
      bottleId: r.bottle_id,
      slotId: r.slot_id,
      beforeQuantityMl: Number(r.before_quantity_ml),
      afterQuantityMl: Number(r.after_quantity_ml),
      differenceMl: Number(r.difference_ml),
      reason: r.reason,
      adjustedBy: r.adjusted_by,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** Nhật ký có đối tượng là đơn, thanh toán hoặc lệnh xịt của đơn — theo thời gian tăng dần. */
  async auditLogs(targetIds: readonly string[]): Promise<AuditLogEntry[]> {
    if (targetIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('audit_logs')
      .select([
        'id',
        'brand_id',
        'actor_type',
        'actor_id',
        'action',
        'target_type',
        'target_id',
        'source_ip',
        'severity',
        'before_data',
        'after_data',
        'occurred_at',
      ])
      .where('target_id', 'in', [...targetIds])
      .orderBy('occurred_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      brandId: r.brand_id,
      actorType: r.actor_type as AuditLogEntry['actorType'],
      actorId: r.actor_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      sourceIp: r.source_ip,
      severity: r.severity,
      beforeData: (r.before_data as Record<string, unknown> | null) ?? null,
      afterData: (r.after_data as Record<string, unknown> | null) ?? null,
      occurredAt: r.occurred_at.toISOString(),
    }));
  }
}

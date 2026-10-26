/**
 * SQL và Kysely queries cho Module AUD — Tra cứu nhật ký kiểm toán (FR-AUD-08).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';

type Executor = Kysely<DB>;

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
}

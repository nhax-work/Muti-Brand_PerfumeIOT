/**
 * Service cho Module AUD — Tra cứu nhật ký kiểm toán (FR-AUD-08, FR-AUD-10).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AudQueries, type AuditLogFilter, type AuditLogRow } from './aud.queries.js';

export type AuditLogEntry = Schema<'AuditLogEntry'>;
export const AUDIT_READ = 'audit.read';

function toDto(r: AuditLogRow): AuditLogEntry {
  return {
    id: r.id,
    brandId: r.brandId,
    actorType: r.actorType as 'SYSTEM' | 'USER' | 'DEVICE' | 'PAYMENT_PROVIDER',
    actorId: r.actorId,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    sourceIp: r.sourceIp,
    severity: r.severity,
    beforeData: (r.beforeData as Record<string, unknown>) ?? null,
    afterData: (r.afterData as Record<string, unknown>) ?? null,
    occurredAt: r.occurredAt.toISOString(),
  };
}

@Injectable()
export class AudService {
  constructor(@Inject(AudQueries) private readonly queries: AudQueries) {}

  async searchAuditLogs(
    filter: AuditLogFilter,
  ): Promise<{ items: AuditLogEntry[]; meta: { total: number; page: number; pageSize: number } }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

    const { items, total } = await this.queries.listAuditLogs({ ...filter, page, pageSize });

    return {
      items: items.map(toDto),
      meta: { total, page, pageSize },
    };
  }
}

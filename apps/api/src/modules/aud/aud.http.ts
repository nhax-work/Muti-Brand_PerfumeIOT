/**
 * Controller HTTP cho module AUD — Tra cứu nhật ký kiểm toán (FR-AUD-08, FR-AUD-10).
 */

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { RequirePermissions } from '../auth/index.js';
import { AUDIT_READ, AudService } from './aud.service.js';

const AuditLogSearchQuery = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    actorId: z.string().uuid().optional(),
    action: z.string().optional(),
    targetType: z.string().optional(),
    targetId: z.string().uuid().optional(),
  })
  .strict();

@Controller('audit-logs')
export class AudController {
  constructor(@Inject(AudService) private readonly aud: AudService) {}

  /** FR-AUD-08, FR-AUD-10: Tra cứu nhật ký kiểm toán (chỉ Platform Super Admin). */
  @Get()
  @RequirePermissions(AUDIT_READ)
  searchAuditLogs(@Query() query: unknown) {
    const filter = parseBody(AuditLogSearchQuery, query);
    return this.aud.searchAuditLogs(filter);
  }
}

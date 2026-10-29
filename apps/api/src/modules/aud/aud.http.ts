/**
 * Cửa vào HTTP của AUD — `/audit-logs` (tag AUD): tra cứu nhật ký (FR-AUD-08, FR-AUD-10) và truy vết
 * đơn (FR-AUD-11).
 */

import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import { AUDIT_READ, AudService } from './aud.service.js';

const OrderIdParam = z.object({ orderId: z.string().uuid() });

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
export class AuditLogsController {
  constructor(@Inject(AudService) private readonly service: AudService) {}

  /** FR-AUD-08, FR-AUD-10: Tra cứu nhật ký kiểm toán (chỉ Platform Super Admin). */
  @Get()
  @RequirePermissions(AUDIT_READ)
  searchAuditLogs(@Query() query: unknown) {
    return this.service.searchAuditLogs(parseBody(AuditLogSearchQuery, query));
  }

  /** FR-AUD-11 */
  @Get('order-trace/:orderId')
  @RequirePermissions(AUDIT_READ)
  orderTrace(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.service.orderTrace(actor, parseBody(OrderIdParam, params).orderId);
  }
}

/**
 * Cửa vào HTTP của AUD — `/audit-logs` (tag AUD). Hiện có truy vết đơn (FR-AUD-11); tra cứu nhật ký
 * `GET /audit-logs` (FR-AUD-08) đặt cùng controller này.
 */

import { Controller, Get, Inject, Param } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import { AudService } from './aud.service.js';

const AUDIT_READ = 'audit.read';

const OrderIdParam = z.object({ orderId: z.string().uuid() });

@Controller('audit-logs')
export class AuditLogsController {
  constructor(@Inject(AudService) private readonly service: AudService) {}

  /** FR-AUD-11 */
  @Get('order-trace/:orderId')
  @RequirePermissions(AUDIT_READ)
  orderTrace(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.service.orderTrace(actor, parseBody(OrderIdParam, params).orderId);
  }
}

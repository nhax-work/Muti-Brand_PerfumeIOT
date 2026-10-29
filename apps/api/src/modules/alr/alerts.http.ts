/**
 * Cửa vào HTTP của cảnh báo (openapi `/alerts*`, FR-ALR-06..12).
 *
 *   Đọc (/alerts, /alerts/:id): mọi tài khoản đã đăng nhập; Brand Admin chỉ thấy cảnh báo
 *   ảnh hưởng đến thương hiệu mình và không thấy affectedBrandIds (BR-012, FR-ALR-10).
 *   Thao tác (acknowledge, assign, resolve, close): yêu cầu quyền `alert.handle` (Super Admin, Ops Staff).
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import { ALERT_HANDLE, AlrService } from './alr.service.js';

const IdParam = z.object({ id: z.string().uuid() });

const ListAlertsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  from: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  to: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  machineId: z.string().uuid().optional(),
  severity: z.enum(['INFO', 'WARNING', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
});

const AssignBody = z.object({
  assignedTo: z.string().uuid(),
});

const ResolveBody = z.object({
  resolution: z.string().trim().min(1),
});

@Controller('alerts')
export class AlertsController {
  constructor(@Inject(AlrService) private readonly alr: AlrService) {}

  /** FR-ALR-06, FR-ALR-08, FR-ALR-10 */
  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser, @Query() rawQuery: unknown) {
    const query = parseBody(ListAlertsQuery, rawQuery);
    const { items, total } = await this.alr.listAlerts(actor, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-ALR-12 */
  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.alr.getAlert(actor, id);
  }

  /** FR-ALR-11, FR-ALR-12 */
  @Post(':id/acknowledge')
  @HttpCode(200)
  @RequirePermissions(ALERT_HANDLE)
  acknowledge(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.alr.acknowledgeAlert(actor, id);
  }

  /** FR-ALR-11 */
  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermissions(ALERT_HANDLE)
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() rawBody: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    const body = parseBody(AssignBody, rawBody);
    return this.alr.assignAlert(actor, id, body.assignedTo);
  }

  /** FR-ALR-11, FR-ALR-12 */
  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermissions(ALERT_HANDLE)
  resolve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() rawBody: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    const body = parseBody(ResolveBody, rawBody);
    return this.alr.resolveAlert(actor, id, body.resolution);
  }

  /** FR-ALR-08, FR-ALR-11 */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions(ALERT_HANDLE)
  close(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.alr.closeAlert(actor, id);
  }
}

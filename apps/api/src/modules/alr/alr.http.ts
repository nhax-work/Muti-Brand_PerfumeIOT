/**
 * Cửa vào HTTP của thông báo (openapi `/notifications*`, ADR-0017 mục 5).
 *
 *   Đọc — mọi tài khoản: người dùng thường chỉ thấy thông báo gửi cho mình; `notification.manage`
 *   thấy tất cả và lọc theo thương hiệu, kênh, loại.
 *   Gửi lại email lỗi — `notification.manage`.
 */

import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import { AlrService, NOTIFICATION_MANAGE } from './alr.service.js';

const IdParam = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'READ']).optional(),
  channel: z.enum(['IN_APP', 'EMAIL']).optional(),
  type: z.string().max(80).optional(),
  brandId: z.string().uuid().optional(),
});

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(AlrService) private readonly alr: AlrService) {}

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser, @Query() rawQuery: unknown) {
    const query = parseBody(ListQuery, rawQuery);
    const { items, total } = await this.alr.list(actor, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-ALR-16 AC2 */
  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.alr.get(actor, parseBody(IdParam, params).id);
  }

  /** FR-ALR-16 AC3 */
  @Post(':id/retry')
  @HttpCode(200)
  @RequirePermissions(NOTIFICATION_MANAGE)
  retry(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.alr.retry(actor, parseBody(IdParam, params).id);
  }
}

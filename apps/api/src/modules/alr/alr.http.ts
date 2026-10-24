/**
 * HTTP Controller cho Notifications và Bằng chứng gửi thông báo (FR-ALR-16).
 */

import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { AlrService } from './alr.service.js';

const IdParam = z.string().uuid();

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

const NotificationListQuery = PageQuery.extend({
  brandId: z.string().uuid().optional(),
  recipientUserId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'IN_APP']).optional(),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'READ']).optional(),
  type: z.string().optional(),
});

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(AlrService) private readonly alr: AlrService) {}

  /**
   * FR-ALR-16: Tra cứu danh sách thông báo và bằng chứng gửi email.
   * Brand Admin tự động bị cô lập theo thương hiệu của mình (BR-012, FR-AUTH-07).
   */
  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser, @Query() query: unknown) {
    const filter = parseBody(NotificationListQuery, query);
    const { items, total } = await this.alr.listNotifications(actor, filter);
    return {
      items,
      meta: {
        page: filter.page,
        pageSize: filter.pageSize,
        total,
      },
    };
  }

  /**
   * FR-ALR-16 AC2: Xem chi tiết một thông báo và bằng chứng gửi đối soát.
   */
  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.alr.getNotification(actor, validatedId);
  }

  /**
   * FR-ALR-16 AC3: Thử gửi lại thông báo email bị lỗi.
   */
  @Post(':id/retry')
  @HttpCode(200)
  retry(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.alr.retryNotification(actor, validatedId);
  }
}

/**
 * Cửa vào HTTP của phiếu khiếu nại hoàn tiền (ADR-0012). Đường dẫn và dữ liệu theo
 * spec/contracts/openapi.yaml, tag ORD.
 *
 *   /public/refund-claims — @Public: khách mở từ QR sự cố, không đăng nhập.
 *   /refund-claims/*       — quyền `order.refund` (Operations Staff, Super Admin). Xem tài khoản và
 *                            ghi nhận hoàn tiền cần xác thực lại (FR-AUTH-09).
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { originOf } from '../../../shared/http/request-origin.js';
import { parseBody } from '../../../shared/http/validation.js';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  RequireReauth,
  type AuthenticatedUser,
} from '../../auth/index.js';
import { RefundClaimsService } from './refund-claims.service.js';

type HttpRequest = Parameters<typeof originOf>[0];

/** openapi `RefundClaimCreate`. */
const ClaimCreateBody = z.object({
  orderId: z.string().uuid(),
  claimToken: z.string().min(1).max(200),
  contact: z.string().trim().min(5).max(200),
  refundAccount: z.object({
    bankBin: z.string().regex(/^[0-9]{6}$/),
    accountNumber: z.string().regex(/^[0-9]{6,19}$/),
    accountName: z.string().trim().min(1).max(100),
  }),
  consent: z.literal(true),
});

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['OPEN', 'REFUNDED', 'REJECTED', 'EXPIRED']).optional(),
  assignedToMe: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const IdParam = z.object({ id: z.string().uuid() });
const AssignBody = z.object({ assigneeId: z.string().uuid() });
const PayoutBody = z.object({
  payoutReference: z.string().trim().min(1).max(100),
  note: z.string().max(1000).optional(),
});
const RejectBody = z.object({ reason: z.string().trim().min(1).max(1000) });

@Controller('public/refund-claims')
@Public()
export class PublicRefundClaimsController {
  constructor(@Inject(RefundClaimsService) private readonly claims: RefundClaimsService) {}

  /** FR-ORD-29 — 201 mặc định của @Post. */
  @Post()
  submit(@Body() body: unknown, @Req() request: HttpRequest) {
    const { consent: _consent, ...input } = parseBody(ClaimCreateBody, body);
    return this.claims.submit(input, originOf(request));
  }
}

@Controller('refund-claims')
@RequirePermissions('order.refund')
export class RefundClaimsController {
  constructor(@Inject(RefundClaimsService) private readonly claims: RefundClaimsService) {}

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser, @Query() rawQuery: unknown) {
    const query = parseBody(ListQuery, rawQuery);
    const { items, total } = await this.claims.list(actor, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  @Get(':id')
  get(@Param() params: unknown) {
    return this.claims.get(parseBody(IdParam, params).id);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.claims.assign(actor, id, parseBody(AssignBody, body).assigneeId);
  }

  /** FR-ORD-30. */
  @Get(':id/refund-account')
  @RequireReauth()
  account(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Req() request: HttpRequest,
  ) {
    return this.claims.viewAccount(actor, parseBody(IdParam, params).id, originOf(request));
  }

  /** FR-ORD-20. */
  @Post(':id/refund')
  @HttpCode(200)
  @RequireReauth()
  refund(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.claims.recordPayout(actor, id, parseBody(PayoutBody, body));
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.claims.reject(actor, id, parseBody(RejectBody, body).reason);
  }
}

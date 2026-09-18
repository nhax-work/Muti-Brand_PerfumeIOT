/**
 * Cửa vào HTTP của module USR. Mọi endpoint đòi quyền `user.manage` — seed chỉ cấp cho Platform
 * Super Admin (FR-USR-05). Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag USR.
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ROLE_CODES } from '../../shared/roles.js';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import { UsrService } from './usr.service.js';
import { z } from 'zod';

const USER_MANAGE = 'user.manage';

/** openapi.yaml: UserCreate. */
const CreateBody = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
  role: z.enum(ROLE_CODES),
  brandId: z.string().uuid().optional(),
});

/** openapi.yaml: components.parameters page/pageSize (tối đa 200). */
const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  brandId: z.string().uuid().optional(),
  role: z.enum(ROLE_CODES).optional(),
});

const IdParam = z.string().uuid();

@Controller('users')
@RequirePermissions(USER_MANAGE)
export class UsrController {
  constructor(@Inject(UsrService) private readonly users: UsrService) {}

  /** FR-USR-05 */
  @Get()
  async list(@Query() query: unknown) {
    const filter = parseBody(ListQuery, query);
    const { items, total } = await this.users.list(filter);
    return { items, meta: { page: filter.page, pageSize: filter.pageSize, total } };
  }

  /** FR-USR-01, FR-USR-02, FR-AUTH-05 */
  @Post()
  @HttpCode(201)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.users.create(actor, parseBody(CreateBody, body));
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.users.get(actor, parseBody(IdParam, id));
  }

  /** FR-USR-03, FR-AUTH-10, FR-AUTH-11 */
  @Post(':id/disable')
  @HttpCode(204)
  async disable(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    await this.users.disable(actor, parseBody(IdParam, id));
  }

  /** FR-USR-04, ADR-0004 */
  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.users.resetPassword(actor, parseBody(IdParam, id));
  }
}

/**
 * Cửa vào HTTP của DSP. Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, tag DSP.
 *
 *   POST /machines/{id}/diagnostic-dispense — `dispense.diagnostic` + xác thực lại (FR-MNT-09, FR-AUTH-09).
 *   GET  /dispense-commands, /orders/{id}/dispense-command — `order.view`, phạm vi trong DspQueries.
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequirePermissions,
  RequireReauth,
  type AuthenticatedUser,
} from '../auth/index.js';
import { DspService } from './dsp.service.js';

const COMMAND_STATUSES = [
  'CREATED',
  'SENT',
  'ACKNOWLEDGED',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
  'EXPIRED',
  'UNKNOWN',
] as const;

const IdParam = z.object({ id: z.string().uuid() });

/** openapi `DiagnosticDispenseCreate`. */
const DiagnosticBody = z.object({
  slotId: z.string().uuid(),
  note: z.string().max(1000).optional(),
});

const SearchQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  machineId: z.string().uuid().optional(),
  commandType: z.enum(['CUSTOMER', 'DIAGNOSTIC']).optional(),
  status: z.enum(COMMAND_STATUSES).optional(),
});

@Controller('machines')
export class DiagnosticDispenseController {
  constructor(@Inject(DspService) private readonly service: DspService) {}

  /** 202: lệnh đã ghi, vòng publish gửi đi; kết quả về sau qua MQTT. */
  @Post(':id/diagnostic-dispense')
  @HttpCode(202)
  @RequirePermissions('dispense.diagnostic')
  @RequireReauth()
  create(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.service.createDiagnostic(actor, id, parseBody(DiagnosticBody, body));
  }
}

@Controller()
@RequirePermissions('order.view')
export class DispenseCommandsController {
  constructor(@Inject(DspService) private readonly service: DspService) {}

  @Get('dispense-commands')
  async search(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(SearchQuery, rawQuery);
    const { items, total } = await this.service.searchCommands(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  @Get('orders/:id/dispense-command')
  orderCommand(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.service.getOrderCommand(actor, scope, id);
  }
}

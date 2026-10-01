/**
 * Cửa vào HTTP của module ORD (Kiosk endpoints: catalog, interactions).
 * Tuân thủ đường dẫn và schemas trong spec/contracts/openapi.yaml.
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { Public } from '../auth/index.js';
import { OrdService } from './ord.service.js';

const KioskInteractionEventSchema = z.object({
  eventId: z.string().min(1).max(150),
  eventType: z.enum(['PRODUCT_IMPRESSION', 'PRODUCT_SELECTED']),
  slotId: z.string().uuid(),
  kioskSessionId: z.string().uuid(),
  occurredAt: z.string(),
});

const KioskInteractionCreateSchema = z.object({
  events: z.array(KioskInteractionEventSchema).min(1),
});

@Controller('kiosk')
export class OrdHttp {
  constructor(@Inject(OrdService) private readonly ordService: OrdService) {}

  /**
   * Danh mục sản phẩm trên kiosk (FR-ORD-01, FR-ORD-02).
   * Endpoint công khai (Public) không yêu cầu token đăng nhập.
   */
  @Get('machines/:serialNumber/catalog')
  @Public()
  async getKioskCatalog(@Param('serialNumber') serialNumber: string) {
    return this.ordService.getKioskCatalog(serialNumber);
  }

  /**
   * Ghi nhận tương tác trên kiosk (FR-RPT-06).
   * Tiếp nhận với mã HTTP 202 Accepted.
   */
  @Post('interactions')
  @Public()
  @HttpCode(202)
  async recordKioskInteractions(@Body() body: unknown) {
    const payload = parseBody(KioskInteractionCreateSchema, body);
    await this.ordService.recordKioskInteractions(payload.events);
  }
}

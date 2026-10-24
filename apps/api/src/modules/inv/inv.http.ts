/**
 * HTTP Controllers cho Module Tồn kho và nạp nước hoa (FR-INV-01..35).
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { InvService } from './inv.service.js';

const IdParam = z.string().uuid();

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

const DeclareShipmentBody = z.object({
  fragranceProductId: z.string().uuid(),
  declaredQuantity: z.number().int().min(1),
  declaredBottleVolumeMl: z.string().min(1),
  expectedShipDate: z.string().optional().nullable(),
});

const ReceiveShipmentBody = z.object({
  receivedQuantity: z.number().int().min(0),
  discrepancyNotes: z.string().optional().nullable(),
});

const SubmitAuthenticityBody = z.object({
  documentUrl: z.string().min(1),
  documentType: z.string().optional(),
});

const RejectAuthenticityBody = z.object({
  reason: z.string().min(1),
});

const RegisterBottleBody = z.object({
  batchId: z.string().uuid(),
  identifier: z.string().min(1).max(100),
  initialVolumeMl: z.string().min(1),
  emptyWeightG: z.string().optional().nullable(),
});

const OpenRefillSessionBody = z.object({
  machineId: z.string().uuid(),
  slotId: z.string().uuid(),
  notes: z.string().optional().nullable(),
});

const CloseRefillSessionBody = z.object({
  newBottleId: z.string().uuid(),
  initialMeasuredWeightG: z.number().positive(),
  checklistCompleted: z.boolean(),
  notes: z.string().optional().nullable(),
});

@Controller(['shipment-declarations', 'shipments'])
export class ShipmentDeclarationsController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  @Post()
  declare(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    const input = parseBody(DeclareShipmentBody, body);
    return this.inv.declareShipment(actor, input);
  }

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser, @Query() query: unknown) {
    const pq = parseBody(
      PageQuery.extend({
        brandId: z.string().uuid().optional(),
        status: z.enum(['DECLARED', 'RECEIVED', 'DISCREPANCY', 'CANCELLED']).optional(),
      }),
      query,
    );
    const { items, total } = await this.inv.listShipmentDeclarations(actor, pq);
    return {
      items,
      meta: {
        page: pq.page,
        pageSize: pq.pageSize,
        total,
      },
    };
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.inv.getShipmentDeclaration(actor, validatedId);
  }

  @Post([':id/receive', ':id/confirm-receive'])
  @HttpCode(200)
  receive(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(ReceiveShipmentBody, body);
    return this.inv.receiveShipment(actor, validatedId, input);
  }
}

@Controller(['inventory-batches', 'batches'])
export class InventoryBatchesController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser, @Query() query: unknown) {
    const pq = parseBody(
      PageQuery.extend({
        brandId: z.string().uuid().optional(),
        fragranceProductId: z.string().uuid().optional(),
      }),
      query,
    );
    const { items, total } = await this.inv.listBatches(actor, pq);
    return {
      items,
      meta: {
        page: pq.page,
        pageSize: pq.pageSize,
        total,
      },
    };
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.inv.getBatch(actor, validatedId);
  }

  @Post([':id/authenticity-documents', ':id/authenticity'])
  @HttpCode(200)
  submitAuthenticity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(SubmitAuthenticityBody, body);
    return this.inv.submitBatchAuthenticity(actor, validatedId, input);
  }

  @Post([':id/approve-authenticity', ':id/approve'])
  @HttpCode(200)
  approveAuthenticity(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.inv.approveBatchAuthenticity(actor, validatedId);
  }

  @Post([':id/reject-authenticity', ':id/reject'])
  @HttpCode(200)
  rejectAuthenticity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(RejectAuthenticityBody, body);
    return this.inv.rejectBatchAuthenticity(actor, validatedId, input);
  }
}

@Controller('bottles')
export class BottlesController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  @Post()
  register(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    const input = parseBody(RegisterBottleBody, body);
    return this.inv.registerBottle(actor, input);
  }

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser, @Query() query: unknown) {
    const pq = parseBody(
      PageQuery.extend({
        brandId: z.string().uuid().optional(),
        batchId: z.string().uuid().optional(),
        status: z
          .enum([
            'IN_STOCK',
            'INSTALLED',
            'LOW',
            'EMPTY',
            'DAMAGED',
            'EXPIRED',
            'LIQUIDATED',
            'RETURNED_TO_BRAND',
          ])
          .optional(),
      }),
      query,
    );
    const { items, total } = await this.inv.listBottles(actor, pq);
    return {
      items,
      meta: {
        page: pq.page,
        pageSize: pq.pageSize,
        total,
      },
    };
  }
}

@Controller('refill-sessions')
export class RefillSessionsController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  @Post()
  open(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    const input = parseBody(OpenRefillSessionBody, body);
    return this.inv.openRefillSession(actor, input);
  }

  @Get()
  async list(@Query() query: unknown) {
    const pq = parseBody(
      PageQuery.extend({
        machineId: z.string().uuid().optional(),
        status: z.enum(['STARTED', 'COMPLETED', 'CANCELLED']).optional(),
      }),
      query,
    );
    const { items, total } = await this.inv.listRefillSessions(pq);
    return {
      items,
      meta: {
        page: pq.page,
        pageSize: pq.pageSize,
        total,
      },
    };
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(CloseRefillSessionBody, body);
    return this.inv.closeRefillSession(actor, validatedId, input);
  }
}

/**
 * Controller HTTP cho module MNT (Bảo trì) — FR-MNT-01 ÷ 14.
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { readImageFile } from '../../shared/http/multipart.js';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import {
  MAINTENANCE_HANDLE,
  MntService,
  type AlertAssign,
  type MaintenanceTicketCreate,
  type MaintenanceTicketResolve,
  type PostTestSubmit,
} from './mnt.service.js';

const IdParam = z.string().uuid();

const ListTicketsQuery = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    machineId: z.string().uuid().optional(),
    status: z
      .enum([
        'OPEN',
        'ASSIGNED',
        'IN_PROGRESS',
        'WAITING_PART',
        'POST_TEST',
        'RESOLVED',
        'CLOSED',
        'REOPENED',
      ])
      .optional(),
    assignedTo: z.string().uuid().optional(),
  })
  .strict();

const CreateTicketBody = z
  .object({
    machineId: z.string().uuid(),
    category: z.string().min(1),
    severity: z.enum(['INFO', 'WARNING', 'HIGH', 'CRITICAL']),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    dueAt: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

const AssignTicketBody = z
  .object({
    assignedTo: z.string().uuid(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

const ResolveTicketBody = z
  .object({
    diagnosis: z.string().min(1),
    correctiveAction: z.string().min(1),
    replacementParts: z.array(z.string()).optional(),
    cost: z.string().optional(),
  })
  .strict();

const PostTestBody = z
  .object({
    checklistCompleted: z.literal(true),
    result: z.enum(['PASS', 'FAIL']),
    notes: z.string().optional(),
  })
  .strict();

const EvidenceQuery = z
  .object({
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

@Controller('maintenance-tickets')
export class MntController {
  constructor(
    @Inject(MntService) private readonly mnt: MntService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'constraint'>,
  ) {}

  /** FR-MNT-03, FR-MNT-04, FR-MNT-14: Danh sách phiếu bảo trì. */
  @Get()
  @RequirePermissions(MAINTENANCE_HANDLE)
  listTickets(@Query() query: unknown) {
    const filter = parseBody(ListTicketsQuery, query);
    return this.mnt.listTickets(filter);
  }

  /** FR-MNT-01, FR-MNT-03: Tạo phiếu bảo trì thủ công. */
  @Post()
  @RequirePermissions(MAINTENANCE_HANDLE)
  createTicket(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    const input = parseBody(CreateTicketBody, body) as MaintenanceTicketCreate;
    return this.mnt.createTicket(actor, input);
  }

  /** FR-MNT-14: Chi tiết phiếu bảo trì. */
  @Get(':id')
  @RequirePermissions(MAINTENANCE_HANDLE)
  getTicket(@Param('id') id: string) {
    return this.mnt.getTicket(parseBody(IdParam, id));
  }

  /** FR-MNT-02: Phân công phiếu bảo trì. */
  @Post(':id/assign')
  // openapi.yaml trả 200 — NestJS mặc định 201 cho POST.
  @HttpCode(200)
  @RequirePermissions(MAINTENANCE_HANDLE)
  assignTicket(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const validId = parseBody(IdParam, id);
    const input = parseBody(AssignTicketBody, body) as AlertAssign;
    return this.mnt.assignTicket(actor, validId, input);
  }

  /** Mở phiếu bảo trì tại máy: chuyển phiếu sang IN_PROGRESS và đưa máy sang MAINTENANCE. */
  @Post(':id/start')
  @HttpCode(200)
  @RequirePermissions(MAINTENANCE_HANDLE)
  startTicket(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.mnt.startTicket(actor, parseBody(IdParam, id));
  }

  /** FR-MNT-10, FR-MNT-13: Ghi kết quả xử lý phiếu bảo trì. */
  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermissions(MAINTENANCE_HANDLE)
  resolveTicket(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const validId = parseBody(IdParam, id);
    const input = parseBody(ResolveTicketBody, body) as MaintenanceTicketResolve;
    return this.mnt.resolveTicket(actor, validId, input);
  }

  /** FR-MNT-11, FR-MNT-12: Hoàn thành checklist kiểm tra sau bảo trì. */
  @Post(':id/post-test')
  @HttpCode(200)
  @RequirePermissions(MAINTENANCE_HANDLE)
  submitPostTest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const validId = parseBody(IdParam, id);
    const input = parseBody(PostTestBody, body) as PostTestSubmit;
    return this.mnt.submitPostTest(actor, validId, input);
  }

  /** Tải lên ảnh bằng chứng hoàn thành/xử lý bảo trì (multipart field `file`). */
  @Post(':id/evidence')
  @HttpCode(200)
  @RequirePermissions(MAINTENANCE_HANDLE)
  async uploadEvidence(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ) {
    const validId = parseBody(IdParam, id);
    const { notes } = parseBody(EvidenceQuery, rawQuery);
    const data = await readImageFile(request, this.config.constraint('SHIPMENT_PHOTO_MAX_BYTES'), {
      required: 'mnt.evidenceFileRequired',
      tooLarge: 'mnt.evidenceFileTooLarge',
    });
    return this.mnt.uploadEvidence(actor, validId, data, notes);
  }

  /** FR-MNT-14: Nhật ký hoạt động của phiếu. */
  @Get(':id/activities')
  @RequirePermissions(MAINTENANCE_HANDLE)
  listActivities(@Param('id') id: string) {
    return this.mnt.listActivities(parseBody(IdParam, id));
  }
}

/**
 * Service nghiệp vụ Module MNT (Bảo trì) — FR-MNT-01 ÷ 14.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  MntQueries,
  type CreateTicketParams,
  type MaintenanceActivityRecord,
  type MaintenanceTicketRecord,
  type TicketFilter,
} from './mnt.queries.js';

export type MaintenanceTicket = Schema<'MaintenanceTicket'>;
export type MaintenanceActivity = Schema<'MaintenanceActivity'>;
export type MaintenanceTicketCreate = Schema<'MaintenanceTicketCreate'>;
export type MaintenanceTicketResolve = Schema<'MaintenanceTicketResolve'>;
export type PostTestSubmit = Schema<'PostTestSubmit'>;
export type AlertAssign = Schema<'AlertAssign'>;

export const MAINTENANCE_HANDLE = 'maintenance.handle';

function toTicketDto(r: MaintenanceTicketRecord): MaintenanceTicket {
  return {
    id: r.id,
    machineId: r.machineId,
    sourceAlertId: r.sourceAlertId ?? undefined,
    ticketNumber: r.ticketNumber,
    category: r.category,
    severity: r.severity,
    priority: r.priority,
    status: r.status,
    assignedTo: r.assignedTo ?? undefined,
    dueAt: r.dueAt ? r.dueAt.toISOString() : undefined,
    diagnosis: r.diagnosis ?? undefined,
    correctiveAction: r.correctiveAction ?? undefined,
    replacementParts: r.replacementParts ?? undefined,
    postTestResult: (r.postTestResult as 'PASS' | 'FAIL' | null) ?? undefined,
    postTestedAt: r.postTestedAt ? r.postTestedAt.toISOString() : undefined,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : undefined,
    closedAt: r.closedAt ? r.closedAt.toISOString() : undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

function toActivityDto(a: MaintenanceActivityRecord): MaintenanceActivity {
  return {
    id: a.id,
    ticketId: a.ticketId,
    actorId: a.actorId,
    activityType: a.activityType,
    fromStatus: a.fromStatus ?? undefined,
    toStatus: a.toStatus ?? undefined,
    notes: a.notes ?? undefined,
    createdAt: a.createdAt.toISOString(),
  };
}

@Injectable()
export class MntService {
  constructor(
    @Inject(MntQueries) private readonly queries: MntQueries,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listTickets(
    filter: TicketFilter,
  ): Promise<{
    items: MaintenanceTicket[];
    meta: { total: number; page: number; pageSize: number };
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
    const { items, total } = await this.queries.listTickets({ ...filter, page, pageSize });

    return {
      items: items.map(toTicketDto),
      meta: { total, page, pageSize },
    };
  }

  async getTicket(id: string): Promise<MaintenanceTicket> {
    const record = await this.queries.findTicketById(id);
    if (!record) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    return toTicketDto(record);
  }

  async createTicket(
    actor: AuthenticatedUser,
    input: MaintenanceTicketCreate,
  ): Promise<MaintenanceTicket> {
    // FR-MNT-01 AC2: Xác định máy
    const machine = await this.db
      .selectFrom('machines')
      .select(['id', 'serial_number'])
      .where('id', '=', input.machineId)
      .executeTakeFirst();
    if (!machine) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }

    const now = this.clock.now();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const ticketNumber = `MNT-${dateStr}-${rand}`;

    const params: CreateTicketParams = {
      machineId: input.machineId,
      category: input.category,
      severity: input.severity,
      priority: input.priority,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      description: input.description ?? null,
    };

    const record = await this.queries.createTicket(params, actor.userId, ticketNumber);

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mnt.ticket.created',
      targetType: 'MaintenanceTicket',
      targetId: record.id,
      after: {
        ticketNumber: record.ticketNumber,
        machineId: record.machineId,
        category: record.category,
        priority: record.priority,
        severity: record.severity,
      },
    });

    return toTicketDto(record);
  }

  async assignTicket(
    actor: AuthenticatedUser,
    id: string,
    input: AlertAssign,
  ): Promise<MaintenanceTicket> {
    const ticket = await this.queries.findTicketById(id);
    if (!ticket) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    if (ticket.status === 'CLOSED') {
      throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'mnt.cannotAssignClosed');
    }

    // FR-MNT-02 AC2: Tài khoản được chọn phải tồn tại
    const staff = await this.db
      .selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', input.assignedTo)
      .executeTakeFirst();
    if (!staff || staff.status !== 'ACTIVE') {
      throw new AppError('VALIDATION_ERROR', 'mnt.invalidStaff');
    }

    const updated = await this.queries.assignTicket(id, input.assignedTo, actor.userId);

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mnt.ticket.assigned',
      targetType: 'MaintenanceTicket',
      targetId: id,
      before: { assignedTo: ticket.assignedTo, status: ticket.status },
      after: { assignedTo: updated.assignedTo, status: updated.status },
    });

    return toTicketDto(updated);
  }

  async resolveTicket(
    actor: AuthenticatedUser,
    id: string,
    input: MaintenanceTicketResolve,
  ): Promise<MaintenanceTicket> {
    const ticket = await this.queries.findTicketById(id);
    if (!ticket) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    if (ticket.status === 'CLOSED') {
      throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'mnt.cannotResolveClosed');
    }

    if (!input.diagnosis || !input.diagnosis.trim()) {
      throw new AppError('VALIDATION_ERROR', 'mnt.diagnosisRequired');
    }
    if (!input.correctiveAction || !input.correctiveAction.trim()) {
      throw new AppError('VALIDATION_ERROR', 'mnt.correctiveActionRequired');
    }

    const updated = await this.queries.resolveTicket(
      id,
      actor.userId,
      input.diagnosis.trim(),
      input.correctiveAction.trim(),
      input.replacementParts,
      input.cost ?? null,
    );

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mnt.ticket.resolved',
      targetType: 'MaintenanceTicket',
      targetId: id,
      before: { status: ticket.status },
      after: { status: updated.status, diagnosis: updated.diagnosis },
    });

    return toTicketDto(updated);
  }

  async submitPostTest(
    actor: AuthenticatedUser,
    id: string,
    input: PostTestSubmit,
  ): Promise<MaintenanceTicket> {
    const ticket = await this.queries.findTicketById(id);
    if (!ticket) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    if (ticket.status === 'CLOSED') {
      throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'mnt.ticketClosed');
    }

    // FR-MNT-11 AC2: Checklist phải hoàn thành
    if (!input.checklistCompleted) {
      throw new AppError('VALIDATION_ERROR', 'mnt.checklistIncomplete');
    }

    const updated = await this.queries.submitPostTest(id, actor.userId, input.result, input.notes);

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mnt.ticket.post_tested',
      targetType: 'MaintenanceTicket',
      targetId: id,
      before: { status: ticket.status },
      after: {
        status: updated.status,
        postTestResult: updated.postTestResult,
      },
    });

    return toTicketDto(updated);
  }

  async listActivities(id: string): Promise<MaintenanceActivity[]> {
    const ticket = await this.queries.findTicketById(id);
    if (!ticket) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    const activities = await this.queries.listActivities(id);
    return activities.map(toActivityDto);
  }
}

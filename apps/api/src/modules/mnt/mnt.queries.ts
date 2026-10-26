/**
 * SQL và Kysely queries cho Module MNT (Bảo trì) — FR-MNT-01 ÷ 14.
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type {
  AlertSeverity,
  TicketPriority,
  TicketStatus,
} from '../../shared/db/types.generated.js';

type Executor = Kysely<DB>;

export interface MaintenanceTicketRecord {
  readonly id: string;
  readonly brandId: string | null;
  readonly machineId: string;
  readonly sourceAlertId: string | null;
  readonly ticketNumber: string;
  readonly category: string;
  readonly severity: AlertSeverity;
  readonly priority: TicketPriority;
  readonly status: TicketStatus;
  readonly assignedTo: string | null;
  readonly dueAt: Date | null;
  readonly startedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly diagnosis: string | null;
  readonly correctiveAction: string | null;
  readonly replacementParts: string[] | null;
  readonly cost: string | null;
  readonly postTestResult: string | null;
  readonly postTestedBy: string | null;
  readonly postTestedAt: Date | null;
  readonly downtimeMinutes: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MaintenanceActivityRecord {
  readonly id: string;
  readonly ticketId: string;
  readonly actorId: string;
  readonly activityType: string;
  readonly fromStatus: TicketStatus | null;
  readonly toStatus: TicketStatus | null;
  readonly notes: string | null;
  readonly attachments: unknown;
  readonly createdAt: Date;
}

export interface TicketFilter {
  readonly page?: number;
  readonly pageSize?: number;
  readonly machineId?: string;
  readonly status?: TicketStatus;
  readonly assignedTo?: string;
}

export interface CreateTicketParams {
  readonly machineId: string;
  readonly category: string;
  readonly severity: AlertSeverity;
  readonly priority: TicketPriority;
  readonly dueAt?: Date | null;
  readonly description?: string | null;
  readonly sourceAlertId?: string | null;
}

function mapTicket(row: Record<string, unknown>): MaintenanceTicketRecord {
  let replacementParts: string[] | null = null;
  if (Array.isArray(row.replacement_parts)) {
    replacementParts = row.replacement_parts;
  } else if (typeof row.replacement_parts === 'string') {
    try {
      replacementParts = JSON.parse(row.replacement_parts);
    } catch {
      replacementParts = null;
    }
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    machineId: row.machine_id,
    sourceAlertId: row.source_alert_id,
    ticketNumber: row.ticket_number,
    category: row.category,
    severity: row.severity,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    diagnosis: row.diagnosis,
    correctiveAction: row.corrective_action,
    replacementParts,
    cost: row.cost !== null && row.cost !== undefined ? String(row.cost) : null,
    postTestResult: row.post_test_result,
    postTestedBy: row.post_tested_by,
    postTestedAt: row.post_tested_at ? new Date(row.post_tested_at) : null,
    downtimeMinutes: row.downtime_minutes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

@Injectable()
export class MntQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async transaction<T>(callback: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(callback);
  }

  async findTicketById(
    id: string,
    executor: Executor = this.db,
  ): Promise<MaintenanceTicketRecord | undefined> {
    const row = await executor
      .selectFrom('maintenance_tickets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? mapTicket(row) : undefined;
  }

  async listTickets(
    filter: TicketFilter,
    executor: Executor = this.db,
  ): Promise<{ items: MaintenanceTicketRecord[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let base = executor.selectFrom('maintenance_tickets');
    if (filter.machineId) {
      base = base.where('machine_id', '=', filter.machineId);
    }
    if (filter.status) {
      base = base.where('status', '=', filter.status);
    }
    if (filter.assignedTo) {
      base = base.where('assigned_to', '=', filter.assignedTo);
    }

    const countRes = await base
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .executeTakeFirst();
    const total = Number(countRes?.count ?? 0);

    const rows = await base
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset(offset)
      .execute();

    return {
      items: rows.map(mapTicket),
      total,
    };
  }

  async createTicket(
    params: CreateTicketParams,
    actorId: string,
    ticketNumber: string,
    executor: Executor = this.db,
  ): Promise<MaintenanceTicketRecord> {
    const inserted = await executor
      .insertInto('maintenance_tickets')
      .values({
        machine_id: params.machineId,
        ticket_number: ticketNumber,
        category: params.category,
        severity: params.severity,
        priority: params.priority,
        status: 'OPEN',
        due_at: params.dueAt ?? null,
        source_alert_id: params.sourceAlertId ?? null,
        diagnosis: params.description ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await executor
      .insertInto('maintenance_activities')
      .values({
        ticket_id: inserted.id,
        actor_id: actorId,
        activity_type: 'CREATED',
        from_status: null,
        to_status: 'OPEN',
        notes: params.description ?? 'Tạo phiếu bảo trì',
      })
      .execute();

    return mapTicket(inserted);
  }

  async assignTicket(
    ticketId: string,
    assignedTo: string,
    actorId: string,
    executor: Executor = this.db,
  ): Promise<MaintenanceTicketRecord> {
    const current = await this.findTicketById(ticketId, executor);
    const nextStatus: TicketStatus =
      current && current.status === 'OPEN' ? 'ASSIGNED' : (current?.status ?? 'ASSIGNED');

    const updated = await executor
      .updateTable('maintenance_tickets')
      .set({
        assigned_to: assignedTo,
        status: nextStatus,
        updated_at: sql`now()`,
      })
      .where('id', '=', ticketId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await executor
      .insertInto('maintenance_activities')
      .values({
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: 'ASSIGNED',
        from_status: current?.status ?? null,
        to_status: nextStatus,
        notes: `Phân công cho nhân viên ${assignedTo}`,
      })
      .execute();

    return mapTicket(updated);
  }

  async resolveTicket(
    ticketId: string,
    actorId: string,
    diagnosis: string,
    correctiveAction: string,
    replacementParts?: string[],
    cost?: string | number | null,
    executor: Executor = this.db,
  ): Promise<MaintenanceTicketRecord> {
    const current = await this.findTicketById(ticketId, executor);
    const nextStatus: TicketStatus = 'POST_TEST';

    const updated = await executor
      .updateTable('maintenance_tickets')
      .set({
        diagnosis,
        corrective_action: correctiveAction,
        replacement_parts: replacementParts ? JSON.stringify(replacementParts) : null,
        cost: cost !== undefined && cost !== null ? String(cost) : null,
        status: nextStatus,
        resolved_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where('id', '=', ticketId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await executor
      .insertInto('maintenance_activities')
      .values({
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: 'RESOLVED',
        from_status: current?.status ?? null,
        to_status: nextStatus,
        notes: correctiveAction,
      })
      .execute();

    return mapTicket(updated);
  }

  async submitPostTest(
    ticketId: string,
    actorId: string,
    result: 'PASS' | 'FAIL',
    notes?: string | null,
    executor: Executor = this.db,
  ): Promise<MaintenanceTicketRecord> {
    const current = await this.findTicketById(ticketId, executor);
    const nextStatus: TicketStatus = result === 'PASS' ? 'RESOLVED' : 'IN_PROGRESS';

    const updated = await executor
      .updateTable('maintenance_tickets')
      .set({
        post_test_result: result,
        post_tested_by: actorId,
        post_tested_at: sql`now()`,
        status: nextStatus,
        closed_at: result === 'PASS' ? sql`now()` : null,
        updated_at: sql`now()`,
      })
      .where('id', '=', ticketId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await executor
      .insertInto('maintenance_activities')
      .values({
        ticket_id: ticketId,
        actor_id: actorId,
        activity_type: 'POST_TEST',
        from_status: current?.status ?? null,
        to_status: nextStatus,
        notes: notes ? `Checklist ${result}: ${notes}` : `Checklist ${result}`,
      })
      .execute();

    return mapTicket(updated);
  }

  async listActivities(
    ticketId: string,
    executor: Executor = this.db,
  ): Promise<MaintenanceActivityRecord[]> {
    const rows = await executor
      .selectFrom('maintenance_activities')
      .selectAll()
      .where('ticket_id', '=', ticketId)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      actorId: r.actor_id,
      activityType: r.activity_type,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      notes: r.notes,
      attachments: r.attachments,
      createdAt: new Date(r.created_at),
    }));
  }

  async hasUnfinishedPostTest(machineId: string, executor: Executor = this.db): Promise<boolean> {
    const row = await executor
      .selectFrom('maintenance_tickets')
      .select('id')
      .where('machine_id', '=', machineId)
      .where('status', 'in', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PART', 'POST_TEST'])
      .where((eb) =>
        eb.or([eb('post_test_result', 'is', null), eb('post_test_result', '!=', 'PASS')]),
      )
      .executeTakeFirst();

    return Boolean(row);
  }
}

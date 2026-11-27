/**
 * Service nghiệp vụ Module MNT (Bảo trì) — FR-MNT-01 ÷ 14.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import {
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_STORAGE,
  normalizeImage,
  type MediaStorage,
} from '../../adapters/media/index.js';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/index.js';
import { formatVnDateTime } from '../../shared/format/index.js';
import { AlrService } from '../alr/index.js';
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

function parseAttachments(
  raw: unknown,
): Array<{ url: string; contentType?: string; uploadedAt?: string }> | undefined {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const result: Array<{ url: string; contentType?: string; uploadedAt?: string }> = [];
  for (const item of list) {
    if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'string') {
      const rec = item as Record<string, unknown>;
      result.push({
        url: rec.url as string,
        contentType: typeof rec.contentType === 'string' ? rec.contentType : undefined,
        uploadedAt: typeof rec.uploadedAt === 'string' ? rec.uploadedAt : undefined,
      });
    }
  }
  return result.length > 0 ? result : undefined;
}

function toActivityDto(a: MaintenanceActivityRecord): MaintenanceActivity {
  const attachments = parseAttachments(a.attachments);
  return {
    id: a.id,
    ticketId: a.ticketId,
    actorId: a.actorId,
    activityType: a.activityType,
    fromStatus: a.fromStatus ?? undefined,
    toStatus: a.toStatus ?? undefined,
    notes: a.notes ?? undefined,
    ...(attachments ? { attachments } : {}),
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
    @Inject(AlrService) private readonly alr: Pick<AlrService, 'notifyUsers'>,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'constraint'>,
  ) {}

  async listTickets(filter: TicketFilter): Promise<{
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
    input: AlertAssign & { notes?: string },
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

    const updated = await this.queries.assignTicket(
      id,
      input.assignedTo,
      actor.userId,
      input.notes,
    );

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mnt.ticket.assigned',
      targetType: 'MaintenanceTicket',
      targetId: id,
      before: { assignedTo: ticket.assignedTo, status: ticket.status },
      after: { assignedTo: updated.assignedTo, status: updated.status },
    });

    // ADR-0029: báo người được giao — phiếu bảo trì thuộc máy, không gắn thương hiệu. Module MNT ghi
    // ngoài transaction (như audit ở trên), nên thông báo ghi ngay sau khi phân công thành công.
    if (input.assignedTo !== actor.userId && input.assignedTo !== ticket.assignedTo) {
      const machine = await this.db
        .selectFrom('machines')
        .select('display_name')
        .where('id', '=', updated.machineId)
        .executeTakeFirst();
      const params = {
        ticket: updated.ticketNumber,
        machine: machine?.display_name ?? updated.machineId,
        priority: translate(DEFAULT_LOCALE, `ticketPriority.${updated.priority}`),
        deadline: updated.dueAt ? formatVnDateTime(updated.dueAt) : '—',
      };
      await this.alr.notifyUsers(
        this.db,
        {
          brandId: updated.brandId,
          type: 'MAINTENANCE_TICKET_ASSIGNED',
          subject: translate(DEFAULT_LOCALE, 'mnt.ticketAssignedSubject', params),
          content: translate(DEFAULT_LOCALE, 'mnt.ticketAssignedContent', params),
          referenceId: updated.id,
          at: this.clock.now(),
        },
        [input.assignedTo],
      );
    }

    return toTicketDto(updated);
  }

  /**
   * Nhân viên vận hành mở phiếu bảo trì tại máy: chuyển phiếu sang IN_PROGRESS
   * và tự động đưa máy sang chế độ MAINTENANCE (dừng nhận đơn mới trên Kiosk).
   */
  async startTicket(actor: AuthenticatedUser, id: string): Promise<MaintenanceTicket> {
    const ticket = await this.queries.findTicketById(id);
    if (!ticket) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    if (ticket.status === 'CLOSED') {
      throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'mnt.ticketClosed');
    }

    const now = this.clock.now();
    const updated = await this.queries.transaction(async (tx) => {
      const nextTicket = await this.queries.startTicket(id, actor.userId, tx);
      const machine = await tx
        .selectFrom('machines')
        .select(['id', 'status', 'operating_mode'])
        .where('id', '=', ticket.machineId)
        .forUpdate()
        .executeTakeFirst();

      if (
        machine &&
        (machine.operating_mode === 'NORMAL' || machine.operating_mode === 'DRAINING')
      ) {
        await tx
          .updateTable('machines')
          .set({ operating_mode: 'MAINTENANCE', updated_at: now })
          .where('id', '=', machine.id)
          .execute();
        await tx
          .insertInto('machine_status_histories')
          .values({
            machine_id: machine.id,
            from_connection_status: machine.status,
            to_connection_status: machine.status,
            from_operating_mode: machine.operating_mode,
            to_operating_mode: 'MAINTENANCE',
            source: 'MAINTENANCE_TICKET',
            changed_by: actor.userId,
            reason: `Mở phiếu bảo trì ${ticket.ticketNumber}`,
            occurred_at: now,
          })
          .execute();
      }

      return nextTicket;
    });

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mnt.ticket.started',
      targetType: 'MaintenanceTicket',
      targetId: id,
      before: { status: ticket.status },
      after: { status: updated.status },
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

    if (input.result === 'PASS') {
      const now = this.clock.now();
      const machine = await this.db
        .selectFrom('machines')
        .select(['id', 'status', 'operating_mode', 'periodic_maintenance_interval_days'])
        .where('id', '=', ticket.machineId)
        .executeTakeFirst();
      if (machine) {
        const updates: Record<string, unknown> = { updated_at: now };
        let restoredToNormal = false;

        const stillUnfinished = await this.queries.hasUnfinishedPostTest(machine.id);
        if (!stillUnfinished && machine.operating_mode === 'MAINTENANCE') {
          updates.operating_mode = 'NORMAL';
          restoredToNormal = true;
        }

        if (ticket.category === 'PERIODIC_INSPECTION') {
          const intervalDays = Math.max(1, machine.periodic_maintenance_interval_days ?? 30);
          updates.last_periodic_maintenance_at = now;
          updates.next_periodic_maintenance_at = new Date(
            now.getTime() + intervalDays * 86_400_000,
          );
          updates.last_periodic_reminder_for = null;
        }

        if (Object.keys(updates).length > 1) {
          await this.db.updateTable('machines').set(updates).where('id', '=', machine.id).execute();
        }

        if (restoredToNormal) {
          await this.db
            .insertInto('machine_status_histories')
            .values({
              machine_id: machine.id,
              from_connection_status: machine.status,
              to_connection_status: machine.status,
              from_operating_mode: 'MAINTENANCE',
              to_operating_mode: 'NORMAL',
              source: 'MAINTENANCE_TICKET',
              changed_by: actor.userId,
              reason: `Hoàn tất bảo trì ${ticket.ticketNumber}`,
              occurred_at: now,
            })
            .execute();
        }
      }
    }

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

  async uploadEvidence(
    actor: AuthenticatedUser,
    id: string,
    data: Buffer,
    notes?: string,
  ): Promise<MaintenanceActivity> {
    const ticket = await this.queries.findTicketById(id);
    if (!ticket) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    if (ticket.status === 'CLOSED') {
      throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'mnt.ticketClosed');
    }

    const image = await normalizeImage(
      data,
      this.config.constraint('SHIPMENT_PHOTO_MAX_EDGE_PX'),
      'mnt.evidenceUnsupported',
    );
    const key = `maintenance/${ticket.id}-${image.hash}.webp`;
    const url = await this.storage.put({
      key,
      body: image.body,
      contentType: 'image/webp',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });

    const activity = await this.queries.addEvidenceActivity(
      id,
      actor.userId,
      ticket.status,
      url,
      notes,
    );

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mnt.ticket.evidence_uploaded',
      targetType: 'MaintenanceTicket',
      targetId: id,
      after: { activityId: activity.id, url },
    });

    return toActivityDto(activity);
  }

  async listActivities(id: string): Promise<MaintenanceActivity[]> {
    const ticket = await this.queries.findTicketById(id);
    if (!ticket) {
      throw new AppError('NOT_FOUND', 'mnt.ticketNotFound');
    }
    const activities = await this.queries.listActivities(id);
    return activities.map(toActivityDto);
  }

  /**
   * Quét các máy sắp đến hạn / quá hạn bảo trì định kỳ (trước hạn 3 ngày),
   * gửi thông báo nhắc nhở cho nhân viên cố định phụ trách máy đó và tạo phiếu bảo trì định kỳ nếu chưa có.
   */
  async sendPeriodicMaintenanceReminders(): Promise<number> {
    const now = this.clock.now();
    const horizon = new Date(now.getTime() + 3 * 86_400_000);

    const dueMachines = await this.db
      .selectFrom('machines')
      .select([
        'id',
        'display_name',
        'serial_number',
        'periodic_maintenance_staff_id',
        'next_periodic_maintenance_at',
        'last_periodic_reminder_for',
      ])
      .where('periodic_maintenance_staff_id', 'is not', null)
      .where('next_periodic_maintenance_at', 'is not', null)
      .where('operating_mode', '!=', 'DISABLED')
      .where('next_periodic_maintenance_at', '<=', horizon)
      .where((eb) =>
        eb.or([
          eb('last_periodic_reminder_for', 'is', null),
          eb('last_periodic_reminder_for', '<', eb.ref('next_periodic_maintenance_at')),
        ]),
      )
      .execute();

    let reminded = 0;
    for (const m of dueMachines) {
      const staffId = m.periodic_maintenance_staff_id;
      const dueAt = m.next_periodic_maintenance_at;
      if (!staffId || !dueAt) continue;

      const existingTicket = await this.db
        .selectFrom('maintenance_tickets')
        .select('id')
        .where('machine_id', '=', m.id)
        .where('category', '=', 'PERIODIC_INSPECTION')
        .where('status', 'in', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'POST_TEST'])
        .executeTakeFirst();

      if (!existingTicket) {
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const ticketNumber = `MNT-${dateStr}-${rand}`;
        const created = await this.queries.createTicket(
          {
            machineId: m.id,
            category: 'PERIODIC_INSPECTION',
            severity: 'INFO',
            priority: 'MEDIUM',
            dueAt,
            description: 'Bảo trì định kỳ: kiểm tra lỗi và vệ sinh máy',
          },
          staffId,
          ticketNumber,
        );
        await this.queries.assignTicket(
          created.id,
          staffId,
          staffId,
          'Tự động phân công bảo trì định kỳ theo lịch máy',
        );
      }

      const dueText = formatVnDateTime(dueAt);
      const isOverdue = dueAt.getTime() < now.getTime();
      await this.alr.notifyUsers(
        this.db,
        {
          brandId: null,
          type: 'PERIODIC_MAINTENANCE_REMINDER',
          subject: isOverdue
            ? `Quá hạn bảo trì định kỳ: ${m.display_name} (${m.serial_number})`
            : `Nhắc nhở bảo trì định kỳ: ${m.display_name} (${m.serial_number})`,
          content: `Máy ${m.display_name} (${m.serial_number}) có lịch kiểm tra & vệ sinh định kỳ vào ${dueText}. Vui lòng thực hiện bảo trì và chụp ảnh bằng chứng.`,
          referenceId: m.id,
          at: now,
        },
        [staffId],
      );

      await this.db
        .updateTable('machines')
        .set({ last_periodic_reminder_for: dueAt, updated_at: now })
        .where('id', '=', m.id)
        .execute();

      reminded++;
    }
    return reminded;
  }
}

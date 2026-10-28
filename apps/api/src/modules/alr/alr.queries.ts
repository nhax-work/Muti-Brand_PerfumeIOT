/**
 * SQL của thông báo và hàng đợi email (FR-ALR-16, ADR-0017). Chỉ module alr được import file này
 * (QT3, ADR-0003).
 *
 * Hàng đợi email chính là bảng `notifications`: bản ghi `channel = 'EMAIL'` ở `PENDING` (chưa gửi)
 * hoặc `FAILED` còn lượt thử. Nghiệp vụ chèn bản ghi trong transaction của nó; job gửi sau khi commit.
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type {
  AlertSeverity,
  AlertStatus,
  NotificationStatus,
} from '../../shared/db/types.generated.js';

type Executor = Kysely<DB>;

export type NotificationChannel = 'IN_APP' | 'EMAIL';

export interface AlertRecord {
  readonly id: string;
  readonly brandId: string | null;
  readonly machineId: string;
  readonly slotId: string | null;
  readonly locationId: string;
  readonly type: string;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly deduplicationKey: string;
  readonly title: string;
  readonly description: string | null;
  readonly firstOccurredAt: Date;
  readonly lastOccurredAt: Date;
  readonly occurrenceCount: number;
  readonly acknowledgedBy: string | null;
  readonly acknowledgedAt: Date | null;
  readonly assignedTo: string | null;
  readonly resolvedBy: string | null;
  readonly resolvedAt: Date | null;
  readonly resolution: string | null;
  readonly createdAt: Date;
}

export type AlertViewer =
  { readonly kind: 'OPERATOR' } | { readonly kind: 'BRAND'; readonly brandId: string };

export interface AlertFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly machineId?: string | undefined;
  readonly severity?: AlertSeverity | undefined;
  readonly status?: AlertStatus | undefined;
}

export interface NotificationRecord {
  readonly id: string;
  readonly brandId: string;
  readonly recipientUserId: string;
  readonly type: string;
  readonly channel: NotificationChannel;
  readonly subject: string | null;
  readonly content: string;
  readonly status: NotificationStatus;
  readonly sentAt: Date | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
  readonly recipientAddress: string | null;
  readonly referenceId: string | null;
  readonly providerMessageId: string | null;
  readonly deliveryAttempts: number;
  readonly lastAttemptAt: Date | null;
  readonly lastError: string | null;
}

/**
 * Ai đang xem: người dùng thường chỉ thấy thông báo gửi cho mình; người có `notification.manage`
 * thấy tất cả để đối soát bằng chứng gửi (ADR-0017 mục 5).
 */
export type NotificationViewer =
  { readonly kind: 'RECIPIENT'; readonly userId: string } | { readonly kind: 'AUDITOR' };

export interface NotificationFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: NotificationStatus | undefined;
  readonly channel?: NotificationChannel | undefined;
  readonly type?: string | undefined;
  readonly brandId?: string | undefined;
}

export interface QueuedNotification {
  readonly brandId: string;
  readonly type: string;
  readonly subject: string;
  readonly content: string;
  readonly referenceId: string;
  readonly at: Date;
}

/** Email đã khóa để gửi: địa chỉ chụp lúc xếp hàng, thiếu thì lấy email hiện tại của người nhận. */
export interface EmailToDispatch {
  readonly id: string;
  readonly address: string;
  readonly subject: string;
  readonly content: string;
  readonly referenceId: string | null;
  readonly deliveryAttempts: number;
}

@Injectable()
export class AlrQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  get database(): Database {
    return this.db;
  }

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  /**
   * Thông báo cho mỗi Brand Admin ACTIVE của thương hiệu: trong ứng dụng thì đã giao (`SENT`), email
   * thì chờ gửi (`PENDING`). Địa chỉ email chụp tại đây (FR-ALR-16 AC2).
   *
   * @returns số Brand Admin nhận
   */
  async queueForBrandAdmins(
    notification: QueuedNotification,
    channels: readonly NotificationChannel[],
    executor: Executor,
  ): Promise<number> {
    const admins = await executor
      .selectFrom('users as u')
      .select(['u.id', 'u.email'])
      .where('u.brand_id', '=', notification.brandId)
      .where('u.status', '=', 'ACTIVE')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('user_roles as ur')
            .innerJoin('roles as r', 'r.id', 'ur.role_id')
            .select('ur.id')
            .whereRef('ur.user_id', '=', 'u.id')
            .where('r.code', '=', 'BRAND_ADMIN'),
        ),
      )
      .execute();
    if (admins.length === 0 || channels.length === 0) return admins.length;

    const rows = admins.flatMap((admin) =>
      channels.map((channel) => ({
        brand_id: notification.brandId,
        recipient_user_id: admin.id,
        type: notification.type,
        channel,
        subject: notification.subject,
        content: notification.content,
        reference_id: notification.referenceId,
        created_at: notification.at,
        ...(channel === 'EMAIL'
          ? { status: 'PENDING' as const, recipient_address: String(admin.email) }
          : { status: 'SENT' as const, sent_at: notification.at }),
      })),
    );
    await executor.insertInto('notifications').values(rows).execute();
    return admins.length;
  }

  /**
   * Email đến lượt gửi: mọi `PENDING`, và `FAILED` còn lượt thử mà lần thử trước đã cách đủ
   * `retryIntervalMin` phút (FR-ALR-16 AC3).
   */
  async listDueEmailIds(
    now: Date,
    maxAttempts: number,
    retryIntervalMin: number,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('notifications')
      .select('id')
      .where('channel', '=', 'EMAIL')
      .where((eb) =>
        eb.or([
          eb('status', '=', 'PENDING'),
          eb.and([
            eb('status', '=', 'FAILED'),
            eb('delivery_attempts', '<', maxAttempts),
            eb.or([
              eb('last_attempt_at', 'is', null),
              eb(
                sql<Date>`last_attempt_at + make_interval(mins => ${retryIntervalMin})`,
                '<=',
                now,
              ),
            ]),
          ]),
        ]),
      )
      .orderBy('created_at')
      .limit(limit)
      .execute();
    return rows.map((r) => r.id);
  }

  /**
   * Khóa một email để gửi; `SKIP LOCKED` để hai tiến trình không gửi trùng. Trả `null` nếu bản ghi
   * đã được gửi hoặc đang bị tiến trình khác giữ.
   */
  async lockEmailForDispatch(
    id: string,
    maxAttempts: number,
    tx: Executor,
  ): Promise<EmailToDispatch | null> {
    const row = await tx
      .selectFrom('notifications as n')
      .innerJoin('users as u', 'u.id', 'n.recipient_user_id')
      .select([
        'n.id',
        'n.recipient_address',
        'u.email',
        'n.subject',
        'n.content',
        'n.reference_id',
        'n.status',
        'n.delivery_attempts',
      ])
      .where('n.id', '=', id)
      .where('n.channel', '=', 'EMAIL')
      .forUpdate('n')
      .skipLocked()
      .executeTakeFirst();
    if (!row) return null;
    const due =
      row.status === 'PENDING' || (row.status === 'FAILED' && row.delivery_attempts < maxAttempts);
    if (!due) return null;
    return {
      id: row.id,
      address: row.recipient_address ?? String(row.email),
      subject: row.subject ?? '',
      content: row.content,
      referenceId: row.reference_id,
      deliveryAttempts: row.delivery_attempts,
    };
  }

  /** Ghi kết quả một lần gửi làm bằng chứng (FR-ALR-16 AC2). */
  async recordDelivery(
    id: string,
    result:
      | {
          readonly ok: true;
          readonly address: string;
          readonly messageId: string | null;
          readonly at: Date;
        }
      | { readonly ok: false; readonly address: string; readonly error: string; readonly at: Date },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('notifications')
      .set((eb) => ({
        recipient_address: result.address,
        delivery_attempts: eb('delivery_attempts', '+', 1),
        last_attempt_at: result.at,
        ...(result.ok
          ? {
              status: 'SENT' as const,
              sent_at: result.at,
              provider_message_id: result.messageId,
              last_error: null,
            }
          : { status: 'FAILED' as const, last_error: result.error }),
      }))
      .where('id', '=', id)
      .execute();
  }

  async list(
    viewer: NotificationViewer,
    filter: NotificationFilter,
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    let base = this.db.selectFrom('notifications as n');
    if (viewer.kind === 'RECIPIENT') {
      base = base.where('n.recipient_user_id', '=', viewer.userId);
    } else {
      if (filter.brandId) base = base.where('n.brand_id', '=', filter.brandId);
      if (filter.channel) base = base.where('n.channel', '=', filter.channel);
      if (filter.type) base = base.where('n.type', '=', filter.type);
    }
    if (filter.status) base = base.where('n.status', '=', filter.status);

    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();
    const rows = await base
      .selectAll('n')
      .orderBy('n.created_at', 'desc')
      .orderBy('n.id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();
    return { items: rows.map(toRecord), total: Number(total) };
  }

  async find(id: string, viewer: NotificationViewer): Promise<NotificationRecord | null> {
    let query = this.db.selectFrom('notifications as n').selectAll('n').where('n.id', '=', id);
    if (viewer.kind === 'RECIPIENT') query = query.where('n.recipient_user_id', '=', viewer.userId);
    const row = await query.executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async lock(id: string, tx: Executor): Promise<NotificationRecord | null> {
    const row = await tx
      .selectFrom('notifications')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  /** Gửi lại do người bấm: về `PENDING` thì job nhặt ngay, kể cả khi đã hết lượt tự thử. */
  async requeue(id: string, tx: Executor): Promise<void> {
    await tx.updateTable('notifications').set({ status: 'PENDING' }).where('id', '=', id).execute();
  }

  // -----------------------------------------------------------------------------------
  // Cảnh báo vận hành (FR-ALR-01..12)
  // -----------------------------------------------------------------------------------

  async listAlerts(
    viewer: AlertViewer,
    filter: AlertFilter,
  ): Promise<{ items: AlertRecord[]; total: number }> {
    let base = this.db.selectFrom('alerts as a').innerJoin('machines as m', 'm.id', 'a.machine_id');

    if (viewer.kind === 'BRAND') {
      const bId = viewer.brandId;
      base = base.where((eb) =>
        eb.or([
          eb('a.brand_id', '=', bId),
          eb.and([
            eb('a.brand_id', 'is', null),
            eb.exists(
              eb
                .selectFrom('machine_slots as ms')
                .innerJoin('slot_rentals as sr', 'sr.slot_id', 'ms.id')
                .select('sr.id')
                .whereRef('ms.machine_id', '=', 'a.machine_id')
                .where('sr.brand_id', '=', bId)
                .where('sr.status', 'in', ['ACTIVE', 'EXPIRING', 'GRACE']),
            ),
          ]),
        ]),
      );
    }

    if (filter.machineId) base = base.where('a.machine_id', '=', filter.machineId);
    if (filter.severity) base = base.where('a.severity', '=', filter.severity);
    if (filter.status) base = base.where('a.status', '=', filter.status);
    if (filter.from) base = base.where('a.first_occurred_at', '>=', filter.from);
    if (filter.to) base = base.where('a.last_occurred_at', '<=', filter.to);

    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .select([
        'a.id',
        'a.brand_id',
        'a.machine_id',
        'a.slot_id',
        'm.location_id',
        'a.type',
        'a.severity',
        'a.status',
        'a.deduplication_key',
        'a.title',
        'a.description',
        'a.first_occurred_at',
        'a.last_occurred_at',
        'a.occurrence_count',
        'a.acknowledged_by',
        'a.acknowledged_at',
        'a.assigned_to',
        'a.resolved_by',
        'a.resolved_at',
        'a.resolution',
        'a.created_at',
      ])
      .orderBy('a.last_occurred_at', 'desc')
      .orderBy('a.id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return { items: rows.map(toAlertRecord), total: Number(total) };
  }

  async findAlert(id: string, viewer: AlertViewer): Promise<AlertRecord | null> {
    let query = this.db
      .selectFrom('alerts as a')
      .innerJoin('machines as m', 'm.id', 'a.machine_id')
      .select([
        'a.id',
        'a.brand_id',
        'a.machine_id',
        'a.slot_id',
        'm.location_id',
        'a.type',
        'a.severity',
        'a.status',
        'a.deduplication_key',
        'a.title',
        'a.description',
        'a.first_occurred_at',
        'a.last_occurred_at',
        'a.occurrence_count',
        'a.acknowledged_by',
        'a.acknowledged_at',
        'a.assigned_to',
        'a.resolved_by',
        'a.resolved_at',
        'a.resolution',
        'a.created_at',
      ])
      .where('a.id', '=', id);

    if (viewer.kind === 'BRAND') {
      const bId = viewer.brandId;
      query = query.where((eb) =>
        eb.or([
          eb('a.brand_id', '=', bId),
          eb.and([
            eb('a.brand_id', 'is', null),
            eb.exists(
              eb
                .selectFrom('machine_slots as ms')
                .innerJoin('slot_rentals as sr', 'sr.slot_id', 'ms.id')
                .select('sr.id')
                .whereRef('ms.machine_id', '=', 'a.machine_id')
                .where('sr.brand_id', '=', bId)
                .where('sr.status', 'in', ['ACTIVE', 'EXPIRING', 'GRACE']),
            ),
          ]),
        ]),
      );
    }

    const row = await query.executeTakeFirst();
    return row ? toAlertRecord(row) : null;
  }

  async lockAlert(id: string, tx: Executor): Promise<AlertRecord | null> {
    const row = await tx
      .selectFrom('alerts as a')
      .innerJoin('machines as m', 'm.id', 'a.machine_id')
      .select([
        'a.id',
        'a.brand_id',
        'a.machine_id',
        'a.slot_id',
        'm.location_id',
        'a.type',
        'a.severity',
        'a.status',
        'a.deduplication_key',
        'a.title',
        'a.description',
        'a.first_occurred_at',
        'a.last_occurred_at',
        'a.occurrence_count',
        'a.acknowledged_by',
        'a.acknowledged_at',
        'a.assigned_to',
        'a.resolved_by',
        'a.resolved_at',
        'a.resolution',
        'a.created_at',
      ])
      .where('a.id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    return row ? toAlertRecord(row) : null;
  }

  async listAffectedBrandIds(machineId: string, executor: Executor): Promise<string[]> {
    const rows = await executor
      .selectFrom('machine_slots as ms')
      .innerJoin('slot_rentals as sr', 'sr.slot_id', 'ms.id')
      .select('sr.brand_id')
      .distinct()
      .where('ms.machine_id', '=', machineId)
      .where('sr.status', 'in', ['ACTIVE', 'EXPIRING', 'GRACE'])
      .execute();
    return rows.map((r) => r.brand_id);
  }

  async acknowledgeAlert(
    id: string,
    acknowledgedBy: string,
    at: Date,
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('alerts')
      .set({
        status: 'ACKNOWLEDGED',
        acknowledged_by: acknowledgedBy,
        acknowledged_at: at,
      })
      .where('id', '=', id)
      .execute();
  }

  async assignAlert(
    id: string,
    assignedTo: string,
    at: Date,
    acknowledgedBy: string | null,
    tx: Executor,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      assigned_to: assignedTo,
    };
    if (acknowledgedBy) {
      update.status = 'ACKNOWLEDGED';
      update.acknowledged_by = acknowledgedBy;
      update.acknowledged_at = at;
    }
    await tx.updateTable('alerts').set(update).where('id', '=', id).execute();
  }

  async resolveAlert(
    id: string,
    resolvedBy: string,
    resolution: string,
    at: Date,
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('alerts')
      .set({
        status: 'RESOLVED',
        resolved_by: resolvedBy,
        resolved_at: at,
        resolution,
      })
      .where('id', '=', id)
      .execute();
  }

  async closeAlert(id: string, tx: Executor): Promise<void> {
    await tx.updateTable('alerts').set({ status: 'CLOSED' }).where('id', '=', id).execute();
  }

  async insertOrUpdateAlert(
    data: {
      readonly brandId?: string | null;
      readonly machineId: string;
      readonly slotId?: string | null;
      readonly type: string;
      readonly severity: AlertSeverity;
      readonly deduplicationKey: string;
      readonly title: string;
      readonly description?: string | null;
      readonly firstOccurredAt?: Date;
      readonly lastOccurredAt?: Date;
    },
    executor: Executor,
  ): Promise<void> {
    const firstAt = data.firstOccurredAt ?? new Date();
    const lastAt = data.lastOccurredAt ?? firstAt;
    await sql`
      INSERT INTO alerts (
        brand_id, machine_id, slot_id, type, severity, deduplication_key,
        title, description, first_occurred_at, last_occurred_at, occurrence_count
      ) VALUES (
        ${data.brandId ?? null}, ${data.machineId}, ${data.slotId ?? null},
        ${data.type}, ${data.severity}, ${data.deduplicationKey},
        ${data.title}, ${data.description ?? null}, ${firstAt}, ${lastAt}, 1
      )
      ON CONFLICT (deduplication_key) WHERE status IN ('OPEN', 'ACKNOWLEDGED')
      DO UPDATE SET
        last_occurred_at = EXCLUDED.last_occurred_at,
        occurrence_count = alerts.occurrence_count + 1
    `.execute(executor);
  }

  /**
   * Quét các máy thỏa điều kiện kiểm tra cửa mở (FR-ALR-03):
   *   1. Không ở MAINTENANCE (AC2)
   *   2. Không có phiếu nạp nào đang mở (status = 'STARTED') trên máy (AC3)
   */
  async listDoorOpenCheckCandidates(executor: Executor): Promise<string[]> {
    const rows = await executor
      .selectFrom('machines as m')
      .select('m.id')
      .where('m.operating_mode', '!=', 'MAINTENANCE')
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('refill_sessions as rs')
              .select('rs.id')
              .whereRef('rs.machine_id', '=', 'm.id')
              .where('rs.status', '=', 'STARTED'),
          ),
        ),
      )
      .execute();
    return rows.map((r) => r.id);
  }

  /**
   * Xác định thời điểm cửa mở liên tục ngoài phiên nạp (FR-ALR-03 AC1, AC4):
   * Trả về effectiveOpenSince nếu cửa đang mở, hoặc null nếu cửa đóng.
   */
  async getEffectiveDoorOpenSince(machineId: string, executor: Executor): Promise<Date | null> {
    // 1. Kiểm tra bản tin DOOR_OPEN gần nhất
    const latestReading = await executor
      .selectFrom('sensor_readings')
      .select(['numeric_value', 'measured_at'])
      .where('machine_id', '=', machineId)
      .where('reading_type', '=', 'DOOR_OPEN')
      .orderBy('measured_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!latestReading || Number(latestReading.numeric_value) !== 1) {
      return null; // Cửa đang đóng hoặc chưa có số đo
    }

    // 2. Tìm thời điểm đóng gần nhất
    const lastClosed = await executor
      .selectFrom('sensor_readings')
      .select('measured_at')
      .where('machine_id', '=', machineId)
      .where('reading_type', '=', 'DOOR_OPEN')
      .where('numeric_value', '=', '0')
      .orderBy('measured_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    // 3. Tìm thời điểm bắt đầu mở (bản tin 1 sớm nhất sau lần đóng gần nhất)
    let openSinceQuery = executor
      .selectFrom('sensor_readings')
      .select('measured_at')
      .where('machine_id', '=', machineId)
      .where('reading_type', '=', 'DOOR_OPEN')
      .where('numeric_value', '=', '1');

    if (lastClosed) {
      openSinceQuery = openSinceQuery.where('measured_at', '>', lastClosed.measured_at);
    }

    const openSinceRow = await openSinceQuery
      .orderBy('measured_at', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (!openSinceRow) return null;

    let effectiveOpenSince = openSinceRow.measured_at;

    // 4. Ngoại lệ AC4: Nếu vừa có phiếu nạp hoàn thành gần đây, tính từ sau khi đóng phiếu
    const lastCompletedRefill = await executor
      .selectFrom('refill_sessions')
      .select('completed_at')
      .where('machine_id', '=', machineId)
      .where('status', '=', 'COMPLETED')
      .where('completed_at', 'is not', null)
      .orderBy('completed_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (
      lastCompletedRefill?.completed_at &&
      lastCompletedRefill.completed_at > effectiveOpenSince
    ) {
      effectiveOpenSince = lastCompletedRefill.completed_at;
    }

    return effectiveOpenSince;
  }

  /**
   * Quét các slot sắp hết hoặc rỗng (FR-ALR-02)
   */
  async listLowStockSlots(
    lowStockThresholdMl: number,
    executor: Executor,
  ): Promise<
    {
      slotId: string;
      machineId: string;
      brandId: string;
      status: string;
      currentEstimatedMl: number;
    }[]
  > {
    const rows = await executor
      .selectFrom('machine_slots as ms')
      .innerJoin('bottles as b', 'b.id', 'ms.active_bottle_id')
      .select([
        'ms.id as slotId',
        'ms.machine_id as machineId',
        'b.brand_id as brandId',
        'b.status as status',
        'b.current_estimated_ml as currentEstimatedMl',
      ])
      .where((eb) =>
        eb.or([
          eb('b.status', '=', 'EMPTY'),
          eb('b.current_estimated_ml', '<=', sql<string>`${lowStockThresholdMl}`),
        ]),
      )
      .execute();

    return rows.map((r) => ({
      slotId: r.slotId,
      machineId: r.machineId,
      brandId: r.brandId,
      status: r.status,
      currentEstimatedMl: Number(r.currentEstimatedMl),
    }));
  }

  /**
   * Quét các hóa đơn thuê slot sắp hết hạn trong khoảng [targetDateStart, targetDateEnd) (FR-EXP-01..03).
   */
  async findExpiringRentals(
    targetDateStart: Date,
    targetDateEnd: Date,
    executor: Executor,
  ): Promise<
    {
      rentalId: string;
      brandId: string;
      slotId: string;
      slotNumber: number;
      machineId: string;
      machineName: string;
      endsAt: Date;
      status: string;
    }[]
  > {
    const rows = await executor
      .selectFrom('slot_rentals as sr')
      .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
      .innerJoin('machines as m', 'm.id', 'ms.machine_id')
      .select([
        'sr.id as rentalId',
        'sr.brand_id as brandId',
        'sr.slot_id as slotId',
        'ms.slot_number as slotNumber',
        'm.id as machineId',
        'm.display_name as machineName',
        'sr.ends_at as endsAt',
        'sr.status as status',
      ])
      .where('sr.status', 'in', ['ACTIVE', 'EXPIRING'])
      .where('sr.ends_at', '>=', targetDateStart)
      .where('sr.ends_at', '<', targetDateEnd)
      .execute();

    return rows.map((r) => ({
      rentalId: r.rentalId,
      brandId: r.brandId,
      slotId: r.slotId,
      slotNumber: r.slotNumber,
      machineId: r.machineId,
      machineName: r.machineName,
      endsAt: r.endsAt,
      status: r.status,
    }));
  }

  async hasNotificationWithReference(
    brandId: string,
    referenceId: string,
    executor: Executor,
  ): Promise<boolean> {
    const row = await executor
      .selectFrom('notifications')
      .select('id')
      .where('brand_id', '=', brandId)
      .where('reference_id', '=', referenceId)
      .limit(1)
      .executeTakeFirst();
    return Boolean(row);
  }
}

function toRecord(r: {
  id: string;
  brand_id: string;
  recipient_user_id: string;
  type: string;
  channel: string;
  subject: string | null;
  content: string;
  status: NotificationStatus;
  sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
  recipient_address: string | null;
  reference_id: string | null;
  provider_message_id: string | null;
  delivery_attempts: number;
  last_attempt_at: Date | null;
  last_error: string | null;
}): NotificationRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    recipientUserId: r.recipient_user_id,
    type: r.type,
    channel: r.channel as NotificationChannel,
    subject: r.subject,
    content: r.content,
    status: r.status,
    sentAt: r.sent_at,
    readAt: r.read_at,
    createdAt: r.created_at,
    recipientAddress: r.recipient_address,
    referenceId: r.reference_id,
    providerMessageId: r.provider_message_id,
    deliveryAttempts: r.delivery_attempts,
    lastAttemptAt: r.last_attempt_at,
    lastError: r.last_error,
  };
}

function toAlertRecord(r: {
  id: string;
  brand_id: string | null;
  machine_id: string;
  slot_id: string | null;
  location_id: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  deduplication_key: string;
  title: string;
  description: string | null;
  first_occurred_at: Date;
  last_occurred_at: Date;
  occurrence_count: number;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution: string | null;
  created_at: Date;
}): AlertRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    machineId: r.machine_id,
    slotId: r.slot_id,
    locationId: r.location_id,
    type: r.type,
    severity: r.severity,
    status: r.status,
    deduplicationKey: r.deduplication_key,
    title: r.title,
    description: r.description,
    firstOccurredAt: r.first_occurred_at,
    lastOccurredAt: r.last_occurred_at,
    occurrenceCount: r.occurrence_count,
    acknowledgedBy: r.acknowledged_by,
    acknowledgedAt: r.acknowledged_at,
    assignedTo: r.assigned_to,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
    resolution: r.resolution,
    createdAt: r.created_at,
  };
}

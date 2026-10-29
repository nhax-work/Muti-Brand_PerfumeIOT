/**
 * Thông báo và email tiền/hàng cho Brand Admin (FR-ALR-16, FR-SLT-43; ADR-0013, ADR-0017).
 *
 *   nghiệp vụ ─tx─▶ notifyBrandAdmins: IN_APP (SENT) + EMAIL (PENDING), cùng số phận với nghiệp vụ
 *   job ALR  ────▶ dispatchDueEmails: khóa từng email → gửi qua EMAIL_PROVIDER → ghi SENT/FAILED
 *
 * Email KHÔNG gửi trong transaction nghiệp vụ: gửi chậm thì khóa nghiệp vụ bị giữ, gửi lỗi thì không
 * được làm hỏng nghiệp vụ (FR-ALR-15 AC2). Job tự thử lại `EMAIL_MAX_ATTEMPTS` lần, cách nhau
 * `EMAIL_RETRY_INTERVAL_MIN` phút (FR-ALR-16 AC3).
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import type { Kysely } from 'kysely';
import { EMAIL_PROVIDER, type EmailProvider } from '../../adapters/email/index.js';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import type { DB } from '../../shared/db/index.js';
import type { AlertSeverity } from '../../shared/db/types.generated.js';
import { AppError } from '../../shared/errors/index.js';
import { hasPermission } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  AlrQueries,
  type AlertFilter,
  type AlertRecord,
  type AlertViewer,
  type NotificationChannel,
  type NotificationFilter,
  type NotificationRecord,
  type NotificationViewer,
  type QueuedNotification,
} from './alr.queries.js';

export type Notification = Schema<'Notification'>;
export type Alert = Schema<'Alert'>;

/** Quyền xem bằng chứng gửi của mọi thương hiệu và gửi lại email lỗi (ADR-0017 mục 5). */
export const NOTIFICATION_MANAGE = 'notification.manage';
/** Quyền tiếp nhận, phân công, xử lý và đóng cảnh báo (FR-ALR-11). */
export const ALERT_HANDLE = 'alert.handle';

/** Số email mỗi nhịp job — đủ cho một đợt chốt kỳ chi trả mà không giữ nhịp quá lâu. */
const DISPATCH_BATCH = 50;
/** Cắt phản hồi lỗi của dịch vụ email trước khi lưu — đủ để đối soát, không phình bảng. */
const MAX_ERROR_LENGTH = 1000;

type Executor = Kysely<DB>;

@Injectable()
export class AlrService {
  private readonly logger = new Logger(AlrService.name);

  constructor(
    @Inject(AlrQueries) private readonly queries: AlrQueries,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Gửi thông báo cho mọi Brand Admin ACTIVE của thương hiệu, trong `tx` của người gọi. Mặc định cả
   * trong ứng dụng lẫn email — dùng cho tám sự kiện tiền/hàng của FR-ALR-16 AC1.
   *
   * @returns số Brand Admin nhận
   */
  notifyBrandAdmins(
    tx: Executor,
    notification: QueuedNotification,
    channels: readonly NotificationChannel[] = ['IN_APP', 'EMAIL'],
  ): Promise<number> {
    return this.queries.queueForBrandAdmins(notification, channels, tx);
  }

  /**
   * Gửi các email đến lượt — cho scheduler. Mỗi email một transaction ngắn: khóa, gửi, ghi kết quả.
   *
   * @returns số email đã gửi được và số lần gửi lỗi trong nhịp này
   */
  async dispatchDueEmails(): Promise<{ sent: number; failed: number }> {
    const maxAttempts = this.config.constraint('EMAIL_MAX_ATTEMPTS');
    const ids = await this.queries.listDueEmailIds(
      this.clock.now(),
      maxAttempts,
      this.config.constraint('EMAIL_RETRY_INTERVAL_MIN'),
      DISPATCH_BATCH,
    );
    let sent = 0;
    let failed = 0;
    for (const id of ids) {
      const outcome = await this.queries.transaction(async (tx) => {
        const email = await this.queries.lockEmailForDispatch(id, maxAttempts, tx);
        if (!email) return null;
        let error: string;
        try {
          const result = await this.provider.send({
            to: email.address,
            subject: email.subject,
            text: email.content,
            ...(email.referenceId ? { referenceId: email.referenceId } : {}),
          });
          if (result.success) {
            await this.queries.recordDelivery(
              email.id,
              {
                ok: true,
                address: email.address,
                messageId: result.providerMessageId ?? null,
                at: this.clock.now(),
              },
              tx,
            );
            return 'sent' as const;
          }
          error = result.error ?? 'UNKNOWN_EMAIL_ERROR';
        } catch (thrown) {
          error = thrown instanceof Error ? thrown.message : String(thrown);
        }
        await this.queries.recordDelivery(
          email.id,
          {
            ok: false,
            address: email.address,
            error: error.slice(0, MAX_ERROR_LENGTH),
            at: this.clock.now(),
          },
          tx,
        );
        this.logger.warn(
          `Gửi email ${email.id} tới ${email.address} lỗi (lần ${email.deliveryAttempts + 1}): ${error}`,
        );
        return 'failed' as const;
      });
      if (outcome === 'sent') sent++;
      if (outcome === 'failed') failed++;
    }
    return { sent, failed };
  }

  async list(
    actor: AuthenticatedUser,
    filter: NotificationFilter,
  ): Promise<{ items: Notification[]; total: number }> {
    const { items, total } = await this.queries.list(viewerOf(actor), filter);
    return { items: items.map(toDto), total };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Notification> {
    const record = await this.queries.find(id, viewerOf(actor));
    if (!record) throw new AppError('NOT_FOUND', 'alr.notificationNotFound');
    return toDto(record);
  }

  /** FR-ALR-16 AC3: gửi lại email FAILED theo yêu cầu, kể cả khi đã hết lượt tự thử. */
  async retry(actor: AuthenticatedUser, id: string): Promise<Notification> {
    await this.queries.transaction(async (tx) => {
      const record = await this.queries.lock(id, tx);
      if (!record) throw new AppError('NOT_FOUND', 'alr.notificationNotFound');
      if (record.channel !== 'EMAIL' || record.status !== 'FAILED') {
        throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'alr.retryOnlyFailed');
      }
      await this.queries.requeue(record.id, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: record.brandId,
          action: 'alr.notification.retry_requested',
          targetType: 'Notification',
          targetId: record.id,
          before: { status: 'FAILED', deliveryAttempts: record.deliveryAttempts },
          after: { status: 'PENDING' },
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  // -----------------------------------------------------------------------------------
  // Cảnh báo vận hành (FR-ALR-01..12)
  // -----------------------------------------------------------------------------------

  async listAlerts(
    actor: AuthenticatedUser,
    filter: AlertFilter,
  ): Promise<{ items: Alert[]; total: number }> {
    const { viewer, isOperator } = alertViewerOf(actor);
    const { items, total } = await this.queries.listAlerts(viewer, filter);
    const dtos = await Promise.all(
      items.map((r) => toAlertDto(r, isOperator, this.queries, this.queries.database)),
    );
    return { items: dtos, total };
  }

  async getAlert(actor: AuthenticatedUser, id: string): Promise<Alert> {
    const { viewer, isOperator } = alertViewerOf(actor);
    const record = await this.queries.findAlert(id, viewer);
    if (!record) throw new AppError('NOT_FOUND', 'alr.alertNotFound');
    return toAlertDto(record, isOperator, this.queries, this.queries.database);
  }

  async acknowledgeAlert(actor: AuthenticatedUser, id: string): Promise<Alert> {
    await this.queries.transaction(async (tx) => {
      const record = await this.queries.lockAlert(id, tx);
      if (!record) throw new AppError('NOT_FOUND', 'alr.alertNotFound');
      if (record.status === 'ACKNOWLEDGED') {
        throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'alr.alreadyAcknowledged');
      }
      if (record.status === 'CLOSED') {
        throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'alr.alreadyClosed');
      }
      const now = this.clock.now();
      await this.queries.acknowledgeAlert(record.id, actor.userId, now, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: record.brandId ?? undefined,
          action: 'alr.alert.acknowledged',
          targetType: 'Alert',
          targetId: record.id,
          before: { status: record.status },
          after: {
            status: 'ACKNOWLEDGED',
            acknowledgedBy: actor.userId,
            acknowledgedAt: now.toISOString(),
          },
        },
        tx,
      );
    });
    return this.getAlert(actor, id);
  }

  async assignAlert(actor: AuthenticatedUser, id: string, assignedTo: string): Promise<Alert> {
    await this.queries.transaction(async (tx) => {
      const record = await this.queries.lockAlert(id, tx);
      if (!record) throw new AppError('NOT_FOUND', 'alr.alertNotFound');
      if (record.status === 'CLOSED') {
        throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'alr.cannotAssignClosed');
      }
      const now = this.clock.now();
      const needsAck = record.status === 'OPEN';
      await this.queries.assignAlert(
        record.id,
        assignedTo,
        now,
        needsAck ? actor.userId : null,
        tx,
      );
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: record.brandId ?? undefined,
          action: 'alr.alert.assigned',
          targetType: 'Alert',
          targetId: record.id,
          before: { status: record.status, assignedTo: record.assignedTo },
          after: {
            status: needsAck ? 'ACKNOWLEDGED' : record.status,
            assignedTo,
          },
        },
        tx,
      );
    });
    return this.getAlert(actor, id);
  }

  async resolveAlert(actor: AuthenticatedUser, id: string, resolution: string): Promise<Alert> {
    if (!resolution || !resolution.trim()) {
      throw new AppError('REASON_REQUIRED', 'alr.resolutionRequired');
    }
    await this.queries.transaction(async (tx) => {
      const record = await this.queries.lockAlert(id, tx);
      if (!record) throw new AppError('NOT_FOUND', 'alr.alertNotFound');
      if (record.status === 'CLOSED') {
        throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'alr.cannotResolveClosed');
      }
      const now = this.clock.now();
      await this.queries.resolveAlert(record.id, actor.userId, resolution.trim(), now, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: record.brandId ?? undefined,
          action: 'alr.alert.resolved',
          targetType: 'Alert',
          targetId: record.id,
          before: { status: record.status },
          after: { status: 'RESOLVED', resolution: resolution.trim(), resolvedBy: actor.userId },
        },
        tx,
      );
    });
    return this.getAlert(actor, id);
  }

  async closeAlert(actor: AuthenticatedUser, id: string): Promise<Alert> {
    await this.queries.transaction(async (tx) => {
      const record = await this.queries.lockAlert(id, tx);
      if (!record) throw new AppError('NOT_FOUND', 'alr.alertNotFound');
      if (record.status === 'CLOSED') {
        throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'alr.alreadyClosed');
      }
      if (record.status !== 'RESOLVED') {
        throw new AppError('NOTIFICATION_NOT_RETRYABLE', 'alr.cannotCloseUnresolved');
      }
      await this.queries.closeAlert(record.id, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: record.brandId ?? undefined,
          action: 'alr.alert.closed',
          targetType: 'Alert',
          targetId: record.id,
          before: { status: record.status },
          after: { status: 'CLOSED' },
        },
        tx,
      );
    });
    return this.getAlert(actor, id);
  }

  async raiseAlert(
    data: {
      readonly brandId?: string | null;
      readonly machineId: string;
      readonly slotId?: string | null;
      readonly type: string;
      readonly severity: AlertSeverity;
      readonly deduplicationKey: string;
      readonly title: string;
      readonly description?: string | null;
      readonly at?: Date;
    },
    tx?: Executor,
  ): Promise<void> {
    const at = data.at ?? this.clock.now();
    await this.queries.insertOrUpdateAlert(
      {
        ...data,
        firstOccurredAt: at,
        lastOccurredAt: at,
      },
      tx ?? this.queries.database,
    );
  }

  /**
   * Quét và sinh cảnh báo cửa mở quá hạn (FR-ALR-03).
   * Loại trừ máy ở MAINTENANCE và máy có phiếu nạp đang mở (STARTED).
   */
  async sweepDoorOpenAlerts(): Promise<number> {
    const alertMin = this.config.constraint('DOOR_OPEN_ALERT_MIN');
    const candidates = await this.queries.listDoorOpenCheckCandidates(this.queries.database);
    let count = 0;
    const now = this.clock.now();
    for (const machineId of candidates) {
      const effectiveOpenSince = await this.queries.getEffectiveDoorOpenSince(
        machineId,
        this.queries.database,
      );
      if (!effectiveOpenSince) continue;
      const elapsedMinutes = (now.getTime() - effectiveOpenSince.getTime()) / (60 * 1000);
      if (elapsedMinutes >= alertMin) {
        await this.queries.insertOrUpdateAlert(
          {
            machineId,
            type: 'DOOR_OPEN_TOO_LONG',
            severity: 'HIGH',
            deduplicationKey: `door-open:${machineId}`,
            title: 'Cửa máy mở quá 5 phút',
            description: 'Thiết bị ghi nhận cửa mở liên tục quá 5 phút ngoài phiên nạp và bảo trì.',
            firstOccurredAt: effectiveOpenSince,
            lastOccurredAt: now,
          },
          this.queries.database,
        );
        count++;
      }
    }
    return count;
  }

  /**
   * Quét và sinh cảnh báo slot sắp hết / rỗng (FR-ALR-02).
   */
  async sweepLowStockAlerts(): Promise<number> {
    const LOW_STOCK_THRESHOLD_ML = 10;
    const slots = await this.queries.listLowStockSlots(
      LOW_STOCK_THRESHOLD_ML,
      this.queries.database,
    );
    const now = this.clock.now();
    for (const s of slots) {
      const isEmpty = s.status === 'EMPTY' || s.currentEstimatedMl <= 0;
      const type = isEmpty ? 'SLOT_EMPTY' : 'SLOT_LOW_STOCK';
      const severity: AlertSeverity = isEmpty ? 'HIGH' : 'WARNING';
      const dedupKey = isEmpty ? `slot-empty:${s.slotId}` : `slot-low-stock:${s.slotId}`;
      const title = isEmpty ? 'Slot rỗng nước hoa' : 'Slot sắp hết nước hoa';
      const description = isEmpty
        ? 'Slot đã hết hoàn toàn nước hoa (0ml)'
        : `Dung tích slot còn ${s.currentEstimatedMl.toFixed(1)}ml`;

      await this.queries.insertOrUpdateAlert(
        {
          brandId: s.brandId,
          machineId: s.machineId,
          slotId: s.slotId,
          type,
          severity,
          deduplicationKey: dedupKey,
          title,
          description,
          firstOccurredAt: now,
          lastOccurredAt: now,
        },
        this.queries.database,
      );
    }
    return slots.length;
  }

  /**
   * Quét tất cả cảnh báo định kỳ (cửa mở quá hạn, dung tích cạn/hết)
   */
  async sweepAlerts(): Promise<void> {
    await Promise.all([this.sweepDoorOpenAlerts(), this.sweepLowStockAlerts()]);
  }

  /**
   * Quét và gửi thông báo hết hạn hóa đơn mốc 7 ngày (FR-EXP-01) và 3 ngày (FR-EXP-02).
   * Gộp thông báo các slot cùng thương hiệu hết hạn cùng ngày (FR-EXP-03).
   * Ghi AuditLog EXPIRY_NOTICE_SENT (FR-EXP-04).
   */
  async sweepExpiringRentals(
    now: Date = this.clock.now(),
  ): Promise<{ notified7: number; notified3: number }> {
    const expiringDays = this.config.constraint('RENTAL_EXPIRING_DAYS'); // 7
    const noticeDaysConfig = this.config.constraint('RENTAL_NOTICE_DAYS'); // [7, 3]
    const notice3Days = noticeDaysConfig[1] ?? 3;

    const checkDays = async (
      days: number,
      type: 'RENTAL_EXPIRING_7_DAYS' | 'RENTAL_EXPIRING_3_DAYS',
    ) => {
      const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const targetStart = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 0, 0, 0, 0),
      );
      const targetEnd = new Date(targetStart.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = targetStart.toISOString().slice(0, 10);

      const rentals = await this.queries.findExpiringRentals(
        targetStart,
        targetEnd,
        this.queries.database,
      );
      if (rentals.length === 0) return 0;

      // Gom theo thương hiệu (FR-EXP-03 AC1)
      const byBrand = new Map<string, typeof rentals>();
      for (const r of rentals) {
        const list = byBrand.get(r.brandId) ?? [];
        list.push(r);
        byBrand.set(r.brandId, list);
      }

      let count = 0;
      for (const [brandId, brandRentals] of byBrand) {
        const refId = `expiring-${days}-days:${brandId}:${dateStr}`;
        const alreadyNotified = await this.queries.hasNotificationWithReference(
          brandId,
          refId,
          this.queries.database,
        );
        if (alreadyNotified) continue;

        const slotLines = brandRentals
          .map((r) => `- Slot ${r.slotNumber} (Máy: ${r.machineName}) — Hóa đơn: ${r.rentalId}`)
          .join('\n');

        const isFinalNotice = days <= notice3Days;
        const subject = isFinalNotice
          ? `[Khẩn cấp] Hóa đơn thuê slot sắp hết hạn trong ${days} ngày (${dateStr})`
          : `Thông báo: Hóa đơn thuê slot sắp hết hạn trong ${days} ngày (${dateStr})`;

        const content = isFinalNotice
          ? `Kính gửi Quý đối tác,\n\nĐây là thông báo nhắc nhở lần hai (mốc ${days} ngày trước hạn). Các hợp đồng thuê slot sau sẽ kết thúc vào ngày ${dateStr}:\n${slotLines}\n\nSau thời hạn này, slot sẽ chuyển sang trạng thái ân hạn GRACE và có nguy cơ phát sinh phí hoặc thanh lý hàng tồn. Vui lòng gia hạn sớm tại /rentals.`
          : `Kính gửi Quý đối tác,\n\nCác hợp đồng thuê slot sau sẽ kết thúc vào ngày ${dateStr} (còn ${days} ngày):\n${slotLines}\n\nVui lòng truy cập hệ thống tại /rentals để thực hiện gia hạn hợp đồng kịp thời.`;

        await this.queries.transaction(async (tx) => {
          await this.notifyBrandAdmins(
            tx,
            {
              brandId,
              type,
              subject,
              content,
              referenceId: refId,
              at: now,
            },
            ['IN_APP', 'EMAIL'],
          );

          // Ghi AuditLog cho từng rental được thông báo (FR-EXP-04)
          for (const r of brandRentals) {
            await this.audit.log(
              {
                actorType: 'SYSTEM',
                brandId,
                action: 'EXPIRY_NOTICE_SENT',
                targetType: 'SlotRental',
                targetId: r.rentalId,
                after: { daysNotice: days, targetDate: dateStr, rentalId: r.rentalId },
              },
              tx,
            );
          }
        });
        count++;
      }
      return count;
    };

    const notified7 = await checkDays(expiringDays, 'RENTAL_EXPIRING_7_DAYS');
    const notified3 = await checkDays(notice3Days, 'RENTAL_EXPIRING_3_DAYS');
    return { notified7, notified3 };
  }
}

function viewerOf(actor: AuthenticatedUser): NotificationViewer {
  return hasPermission(actor, NOTIFICATION_MANAGE)
    ? { kind: 'AUDITOR' }
    : { kind: 'RECIPIENT', userId: actor.userId };
}

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

export function toDto(r: NotificationRecord): Notification {
  return {
    id: r.id,
    brandId: r.brandId,
    recipientUserId: r.recipientUserId,
    type: r.type,
    channel: r.channel,
    subject: r.subject,
    content: r.content,
    status: r.status,
    sentAt: iso(r.sentAt),
    readAt: iso(r.readAt),
    createdAt: r.createdAt.toISOString(),
    recipientAddress: r.recipientAddress,
    referenceId: r.referenceId,
    providerMessageId: r.providerMessageId,
    deliveryAttempts: r.deliveryAttempts,
    lastAttemptAt: iso(r.lastAttemptAt),
    lastError: r.lastError,
  };
}

function alertViewerOf(actor: AuthenticatedUser): { viewer: AlertViewer; isOperator: boolean } {
  const isOperator =
    actor.roles.includes('PLATFORM_SUPER_ADMIN') || actor.roles.includes('OPERATIONS_STAFF');
  if (isOperator || !actor.brandId) {
    return { viewer: { kind: 'OPERATOR' }, isOperator: true };
  }
  return { viewer: { kind: 'BRAND', brandId: actor.brandId }, isOperator: false };
}

async function toAlertDto(
  r: AlertRecord,
  isOperator: boolean,
  queries: AlrQueries,
  executor?: Executor,
): Promise<Alert> {
  let affectedBrandIds: string[] | undefined;
  if (isOperator) {
    if (r.brandId) {
      affectedBrandIds = [r.brandId];
    } else {
      affectedBrandIds = await queries.listAffectedBrandIds(
        r.machineId,
        executor ?? queries.database,
      );
    }
  }

  return {
    id: r.id,
    brandId: r.brandId,
    machineId: r.machineId,
    slotId: r.slotId,
    locationId: r.locationId,
    type: r.type,
    severity: r.severity,
    status: r.status,
    title: r.title,
    description: r.description,
    firstOccurredAt: r.firstOccurredAt.toISOString(),
    lastOccurredAt: r.lastOccurredAt.toISOString(),
    occurrenceCount: r.occurrenceCount,
    acknowledgedBy: r.acknowledgedBy,
    acknowledgedAt: iso(r.acknowledgedAt),
    assignedTo: r.assignedTo,
    resolvedBy: r.resolvedBy,
    resolvedAt: iso(r.resolvedAt),
    resolution: r.resolution,
    ...(affectedBrandIds !== undefined ? { affectedBrandIds } : {}),
  };
}

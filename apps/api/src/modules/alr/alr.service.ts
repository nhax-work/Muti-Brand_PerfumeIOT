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
import { AppError } from '../../shared/errors/index.js';
import { hasPermission } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  AlrQueries,
  type NotificationChannel,
  type NotificationFilter,
  type NotificationRecord,
  type NotificationViewer,
  type QueuedNotification,
} from './alr.queries.js';

export type Notification = Schema<'Notification'>;

/** Quyền xem bằng chứng gửi của mọi thương hiệu và gửi lại email lỗi (ADR-0017 mục 5). */
export const NOTIFICATION_MANAGE = 'notification.manage';

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

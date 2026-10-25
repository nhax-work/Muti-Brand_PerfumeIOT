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
import type { NotificationStatus } from '../../shared/db/types.generated.js';

type Executor = Kysely<DB>;

export type NotificationChannel = 'IN_APP' | 'EMAIL';

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

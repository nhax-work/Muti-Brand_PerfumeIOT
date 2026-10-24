/**
 * Truy vấn thông báo và bằng chứng gửi (FR-ALR-16, FR-SLT-43; ADR-0013).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type DB } from '../../shared/db/index.js';
import type { NotificationStatus } from '../../shared/db/types.generated.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';

export type Executor = Kysely<DB> | Transaction<DB>;

export interface NotificationRecord {
  readonly id: string;
  readonly brandId: string;
  readonly brandName?: string | null;
  readonly recipientUserId: string;
  readonly recipientEmail?: string | null;
  readonly recipientName?: string | null;
  readonly type: string;
  readonly channel: string;
  readonly subject: string | null;
  readonly content: string;
  readonly status: NotificationStatus;
  readonly sentAt: Date | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NotificationFilter {
  readonly brandId?: string;
  readonly recipientUserId?: string;
  readonly channel?: string;
  readonly status?: NotificationStatus;
  readonly type?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface BrandAdminUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

@Injectable()
export class AlrQueries {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  /** Chèn bản ghi thông báo mới vào bảng notifications */
  async createNotification(
    data: {
      readonly brandId: string;
      readonly recipientUserId: string;
      readonly type: string;
      readonly channel: string;
      readonly subject: string;
      readonly content: string;
      readonly status: NotificationStatus;
      readonly sentAt?: Date | null;
      readonly createdAt?: Date;
    },
    executor: Executor = this.db,
  ): Promise<NotificationRecord> {
    const row = await executor
      .insertInto('notifications')
      .values({
        brand_id: data.brandId,
        recipient_user_id: data.recipientUserId,
        type: data.type,
        channel: data.channel,
        subject: data.subject,
        content: data.content,
        status: data.status,
        sent_at: data.sentAt ?? null,
        created_at: data.createdAt ?? new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      brandId: row.brand_id,
      recipientUserId: row.recipient_user_id,
      type: row.type,
      channel: row.channel,
      subject: row.subject,
      content: row.content,
      status: row.status,
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      readAt: row.read_at ? new Date(row.read_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /** Cập nhật trạng thái gửi và thời điểm gửi */
  async updateNotificationStatus(
    id: string,
    status: NotificationStatus,
    sentAt: Date | null = null,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('notifications')
      .set({
        status,
        sent_at: sentAt,
      })
      .where('id', '=', id)
      .execute();
  }

  /** Chi tiết một thông báo kèm thông tin người nhận và thương hiệu */
  async findNotificationById(
    id: string,
    scope: BrandScope = { kind: 'UNRESTRICTED' },
    executor: Executor = this.db,
  ): Promise<NotificationRecord | null> {
    const query = executor
      .selectFrom('notifications as n')
      .innerJoin('brands as b', 'b.id', 'n.brand_id')
      .innerJoin('users as u', 'u.id', 'n.recipient_user_id')
      .select([
        'n.id',
        'n.brand_id as brandId',
        'b.name as brandName',
        'n.recipient_user_id as recipientUserId',
        'u.email as recipientEmail',
        'u.full_name as recipientName',
        'n.type',
        'n.channel',
        'n.subject',
        'n.content',
        'n.status',
        'n.sent_at as sentAt',
        'n.read_at as readAt',
        'n.created_at as createdAt',
      ])
      .where('n.id', '=', id)
      .where(brandScopedByColumn(scope, 'n.brand_id'));

    const row = await query.executeTakeFirst();
    if (!row) return null;

    return {
      id: row.id,
      brandId: row.brandId,
      brandName: row.brandName,
      recipientUserId: row.recipientUserId,
      recipientEmail: row.recipientEmail,
      recipientName: row.recipientName,
      type: row.type,
      channel: row.channel,
      subject: row.subject,
      content: row.content,
      status: row.status,
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      readAt: row.readAt ? new Date(row.readAt) : null,
      createdAt: new Date(row.createdAt),
    };
  }

  /** Danh sách thông báo có phân trang và bộ lọc */
  async listNotifications(
    filter: NotificationFilter,
    scope: BrandScope = { kind: 'UNRESTRICTED' },
    executor: Executor = this.db,
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    let baseQuery = executor
      .selectFrom('notifications as n')
      .innerJoin('brands as b', 'b.id', 'n.brand_id')
      .innerJoin('users as u', 'u.id', 'n.recipient_user_id')
      .where(brandScopedByColumn(scope, 'n.brand_id'));

    if (scope.kind === 'UNRESTRICTED' && filter.brandId) {
      baseQuery = baseQuery.where('n.brand_id', '=', filter.brandId);
    }

    if (filter.recipientUserId) {
      baseQuery = baseQuery.where('n.recipient_user_id', '=', filter.recipientUserId);
    }
    if (filter.channel) {
      baseQuery = baseQuery.where('n.channel', '=', filter.channel);
    }
    if (filter.status) {
      baseQuery = baseQuery.where('n.status', '=', filter.status);
    }
    if (filter.type) {
      baseQuery = baseQuery.where('n.type', '=', filter.type);
    }

    const countResult = await baseQuery
      .select(sql<string>`count(*)`.as('total'))
      .executeTakeFirstOrThrow();
    const total = Number(countResult.total);

    const rows = await baseQuery
      .select([
        'n.id',
        'n.brand_id as brandId',
        'b.name as brandName',
        'n.recipient_user_id as recipientUserId',
        'u.email as recipientEmail',
        'u.full_name as recipientName',
        'n.type',
        'n.channel',
        'n.subject',
        'n.content',
        'n.status',
        'n.sent_at as sentAt',
        'n.read_at as readAt',
        'n.created_at as createdAt',
      ])
      .orderBy('n.created_at', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    const items = rows.map((r) => ({
      id: r.id,
      brandId: r.brandId,
      brandName: r.brandName,
      recipientUserId: r.recipientUserId,
      recipientEmail: r.recipientEmail,
      recipientName: r.recipientName,
      type: r.type,
      channel: r.channel,
      subject: r.subject,
      content: r.content,
      status: r.status,
      sentAt: r.sentAt ? new Date(r.sentAt) : null,
      readAt: r.readAt ? new Date(r.readAt) : null,
      createdAt: new Date(r.createdAt),
    }));

    return { items, total };
  }

  /** Tìm danh sách Brand Admin đang hoạt động (ACTIVE) của thương hiệu kèm email */
  async findActiveBrandAdmins(
    brandId: string,
    executor: Executor = this.db,
  ): Promise<BrandAdminUser[]> {
    const rows = await executor
      .selectFrom('users as u')
      .select(['u.id', 'u.email', 'u.full_name as fullName'])
      .where('u.brand_id', '=', brandId)
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

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.fullName,
    }));
  }
}

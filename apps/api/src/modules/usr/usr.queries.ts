/**
 * Truy vấn của module USR. Chỉ module usr được import file này (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { RoleCode } from '@scentstation/contracts';
import { DATABASE, type Database } from '../../shared/db/index.js';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED';

export interface UserRecord {
  readonly id: string;
  readonly brandId: string | null;
  readonly email: string;
  readonly fullName: string;
  readonly status: UserStatus;
  readonly roles: RoleCode[];
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
}

export interface UserFilter {
  readonly brandId?: string;
  readonly role?: RoleCode;
  readonly page: number;
  readonly pageSize: number;
}

@Injectable()
export class UsrQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(filter: UserFilter): Promise<{ items: UserRecord[]; total: number }> {
    let base = this.db.selectFrom('users as u');
    if (filter.brandId) base = base.where('u.brand_id', '=', filter.brandId);
    if (filter.role) {
      const role = filter.role;
      base = base.where((eb) =>
        eb.exists(
          eb
            .selectFrom('user_roles as ur')
            .innerJoin('roles as r', 'r.id', 'ur.role_id')
            .select('ur.id')
            .whereRef('ur.user_id', '=', 'u.id')
            .where('r.code', '=', role),
        ),
      );
    }

    const countRow = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const ids = await base
      .select('u.id')
      .orderBy('u.created_at', 'desc')
      .orderBy('u.id')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    const items = await this.findMany(ids.map((r) => r.id));
    return { items, total: Number(countRow.total) };
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return (await this.findMany([id]))[0];
  }

  async emailExists(email: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst();
    return row !== undefined;
  }

  async brandExists(brandId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('brands')
      .select('id')
      .where('id', '=', brandId)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Tạo tài khoản và gán vai trò hệ thống trong CÙNG một transaction. */
  async create(input: {
    email: string;
    fullName: string;
    brandId: string | null;
    passwordHash: string;
    role: RoleCode;
    assignedBy: string;
  }): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const role = await trx
        .selectFrom('roles')
        .select('id')
        .where('code', '=', input.role)
        .where('is_system', '=', true)
        .executeTakeFirst();
      if (!role) {
        // Vai trò hệ thống phải có sẵn từ seed; thiếu là lỗi cấu hình, không phải lỗi người dùng.
        throw new Error(`Thiếu vai trò hệ thống ${input.role} trong bảng roles — chạy make seed`);
      }

      const user = await trx
        .insertInto('users')
        .values({
          email: input.email,
          full_name: input.fullName,
          brand_id: input.brandId,
          password_hash: input.passwordHash,
          status: 'INVITED',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('user_roles')
        .values({
          user_id: user.id,
          role_id: role.id,
          scope_type: input.brandId === null ? 'PLATFORM' : 'BRAND',
          assigned_by: input.assignedBy,
        })
        .execute();

      return user.id;
    });
  }

  async setStatus(id: string, status: UserStatus): Promise<void> {
    await this.db.updateTable('users').set({ status }).where('id', '=', id).execute();
  }

  private async findMany(ids: string[]): Promise<UserRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('users as u')
      .leftJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .leftJoin('roles as r', 'r.id', 'ur.role_id')
      .select([
        'u.id',
        'u.brand_id',
        'u.email',
        'u.full_name',
        'u.status',
        'u.last_login_at',
        'u.created_at',
        'r.code as role_code',
      ])
      .where('u.id', 'in', ids)
      .execute();

    const byId = new Map<string, UserRecord & { roles: RoleCode[] }>();
    for (const row of rows) {
      let record = byId.get(row.id);
      if (!record) {
        record = {
          id: row.id,
          brandId: row.brand_id,
          email: row.email,
          fullName: row.full_name,
          status: row.status,
          roles: [],
          lastLoginAt: row.last_login_at === null ? null : new Date(row.last_login_at),
          createdAt: new Date(row.created_at),
        };
        byId.set(row.id, record);
      }
      const code = row.role_code as RoleCode | null;
      if (code && !record.roles.includes(code)) record.roles.push(code);
    }
    // Giữ đúng thứ tự id truyền vào — list() đã sắp xếp ở truy vấn trước.
    return ids.map((id) => byId.get(id)).filter((r): r is UserRecord => r !== undefined);
  }
}

/**
 * Quản trị tài khoản — phần quản trị của RBAC (FR-USR-01..05, FR-AUTH-05, FR-AUTH-11).
 *
 * Chỉ Platform Super Admin gọi được, cưỡng chế ở controller bằng quyền `user.manage` mà seed chỉ
 * cấp cho vai trò đó (FR-USR-05). Service không tự kiểm lại vai trò: phân quyền là việc của guard,
 * không trộn vào nghiệp vụ.
 *
 * Mật khẩu KHÔNG xử lý ở đây. Mọi thứ liên quan băm, cấp mật khẩu tạm, thu hồi phiên đi qua
 * AuthService — module usr không chạm vào truy vấn của module auth (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { RoleCode, Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { invalidField, notFoundFor } from '../../shared/errors/index.js';
import { AuthService, generateTemporaryPassword, hashPassword } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { UsrQueries, type UserFilter, type UserRecord } from './usr.queries.js';

type User = Schema<'User'>;
type UserCreated = Schema<'UserCreated'>;

export interface CreateUserInput {
  readonly email: string;
  readonly fullName: string;
  readonly role: RoleCode;
  readonly brandId?: string | undefined;
}

type Queries = Pick<
  UsrQueries,
  'list' | 'findById' | 'emailExists' | 'brandExists' | 'create' | 'setStatus'
>;
type Auth = Pick<AuthService, 'revokeAllAccess' | 'resetToTemporaryPassword'>;
type Audit = Pick<AuditService, 'log'>;

@Injectable()
export class UsrService {
  constructor(
    @Inject(UsrQueries) private readonly queries: Queries,
    @Inject(AuthService) private readonly auth: Auth,
    @Inject(AuditService) private readonly audit: Audit,
  ) {}

  async list(filter: UserFilter): Promise<{ items: User[]; total: number }> {
    const { items, total } = await this.queries.list(filter);
    return { items: items.map(toDto), total };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<User> {
    const record = await this.queries.findById(id);
    if (!record) throw notFoundFor(actor);
    return toDto(record);
  }

  /**
   * FR-USR-01, FR-USR-02, FR-AUTH-05, ADR-0004.
   *
   * Luật liên kết thương hiệu (FR-AUTH-05): Brand Admin BẮT BUỘC gắn đúng một thương hiệu (AC3); vai
   * trò nền tảng KHÔNG được gắn thương hiệu (AC4).
   */
  async create(actor: AuthenticatedUser, input: CreateUserInput): Promise<UserCreated> {
    const isBrandRole = input.role === 'BRAND_ADMIN';
    if (isBrandRole && !input.brandId) {
      throw invalidField('brandId', 'usr.brandAdminNeedsBrand');
    }
    if (!isBrandRole && input.brandId) {
      throw invalidField('brandId', 'usr.platformRoleNoBrand');
    }
    if (input.brandId && !(await this.queries.brandExists(input.brandId))) {
      throw invalidField('brandId', 'usr.brandNotFound');
    }
    if (await this.queries.emailExists(input.email)) {
      // ADR-0004: dùng VALIDATION_ERROR vì spec/errors.md không có mã xung đột chung.
      throw invalidField('email', 'usr.emailTaken');
    }

    const temporaryPassword = generateTemporaryPassword();
    const id = await this.queries.create({
      email: input.email,
      fullName: input.fullName,
      brandId: input.brandId ?? null,
      passwordHash: await hashPassword(temporaryPassword),
      role: input.role,
      assignedBy: actor.userId,
    });
    const created = await this.queries.findById(id);
    if (!created) throw new Error(`Không đọc lại được tài khoản vừa tạo ${id}`);

    const dto = toDto(created);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: created.brandId,
      action: 'usr.user.created',
      targetType: 'user',
      targetId: id,
      // Chụp trạng thái sau — KHÔNG kèm mật khẩu tạm (ADR-0004).
      after: dto,
    });
    return { ...dto, temporaryPassword };
  }

  /**
   * FR-USR-03, FR-AUTH-10, FR-AUTH-11: vô hiệu hóa và cắt ngay mọi phiên.
   *
   * Không cho tự vô hiệu hóa chính mình — tránh trường hợp Super Admin cuối cùng tự khóa nền tảng.
   */
  async disable(actor: AuthenticatedUser, id: string): Promise<void> {
    if (id === actor.userId) {
      throw invalidField('id', 'usr.cannotDisableSelf');
    }
    const before = await this.queries.findById(id);
    if (!before) throw notFoundFor(actor);
    if (before.status === 'DISABLED') return; // idempotent

    await this.queries.setStatus(id, 'DISABLED');
    await this.auth.revokeAllAccess(id);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: before.brandId,
      action: 'usr.user.disabled',
      targetType: 'user',
      targetId: id,
      severity: 'WARNING',
      before: { status: before.status },
      after: { status: 'DISABLED' },
    });
  }

  /**
   * FR-USR-04, ADR-0004: cấp mật khẩu tạm mới, trả về đúng một lần.
   *
   * Từ chối với tài khoản đã vô hiệu hóa: đặt lại sẽ đưa tài khoản về INVITED, tức là âm thầm mở
   * lại một tài khoản đã bị khóa có chủ ý.
   */
  async resetPassword(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<{ temporaryPassword: string }> {
    const before = await this.queries.findById(id);
    if (!before) throw notFoundFor(actor);
    if (before.status === 'DISABLED') {
      throw invalidField('id', 'usr.cannotResetDisabledAccount');
    }

    const temporaryPassword = await this.auth.resetToTemporaryPassword(id);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: before.brandId,
      action: 'usr.user.password_reset',
      targetType: 'user',
      targetId: id,
      severity: 'WARNING',
      before: { status: before.status },
      after: { status: 'INVITED' },
    });
    return { temporaryPassword };
  }
}

function toDto(record: UserRecord): User {
  return {
    id: record.id,
    brandId: record.brandId,
    email: record.email,
    fullName: record.fullName,
    status: record.status,
    roles: record.roles,
    lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

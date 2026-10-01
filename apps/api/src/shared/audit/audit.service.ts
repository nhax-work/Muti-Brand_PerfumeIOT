/**
 * Ghi nhật ký kiểm toán (FR-AUD-01..08).
 *
 * `audit_logs` chỉ cho thêm mới — cưỡng chế ở CSDL bằng cả REVOKE lẫn trigger (schema.sql §11).
 * Service này vì thế chỉ có đúng một thao tác: ghi.
 *
 * Ghi ĐỒNG BỘ, không "bắn rồi quên": một số luồng coi bản ghi kiểm toán là dữ liệu chịu lực — ví
 * dụ khóa tài khoản (FR-AUTH-03) đếm số lần đăng nhập sai từ chính bảng này. Ghi thất bại thì luồng
 * gọi phải thất bại theo, không được lặng lẽ bỏ qua.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DATABASE, type Database, type DB } from '../db/index.js';

export type ActorType = 'SYSTEM' | 'USER' | 'DEVICE' | 'PAYMENT_PROVIDER' | 'ANONYMOUS';

export interface AuditEntry {
  readonly actorType: ActorType;
  readonly actorId?: string | null;
  readonly brandId?: string | null;
  /** Dạng `<miền>.<hành động>.<kết quả>`, ví dụ `auth.login.failed`. */
  readonly action: string;
  readonly targetType: string;
  readonly targetId?: string | null;
  readonly sourceIp?: string | null;
  readonly userAgent?: string | null;
  readonly severity?: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  readonly before?: unknown;
  readonly after?: unknown;
  readonly metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * @param executor transaction đang mở, khi bản ghi kiểm toán phải cùng số phận với thay đổi nó
   *   mô tả — ví dụ webhook ghi nhận tiền (FR-AUD-06): rollback thì nhật ký cũng không được còn.
   *   Bỏ trống thì ghi bằng kết nối riêng.
   */
  async log(entry: AuditEntry, executor: Kysely<DB> = this.db): Promise<void> {
    await executor
      .insertInto('audit_logs')
      .values({
        actor_type: entry.actorType,
        actor_id: entry.actorId ?? null,
        brand_id: entry.brandId ?? null,
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId ?? null,
        source_ip: entry.sourceIp ?? null,
        user_agent: entry.userAgent ?? null,
        severity: entry.severity ?? 'INFO',
        before_data: entry.before === undefined ? null : JSON.stringify(entry.before),
        after_data: entry.after === undefined ? null : JSON.stringify(entry.after),
        metadata: entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
      })
      .execute();
  }
}

/**
 * Quản trị thương hiệu (FR-BND-01..07, FR-BND-09, FR-BND-10, ADR-0013).
 *
 * Tầng nghiệp vụ độc lập hoàn toàn với HTTP (QT2, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { decryptJson, encryptJson, PII_KEY_VERSION } from '../../shared/crypto/pii-cipher.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { BndQueries, type BrandFilter, type BrandRecord, type BrandStatus } from './bnd.queries.js';

type Brand = Schema<'Brand'>;

export interface CreateBrandInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly contactInfo?: Record<string, unknown>;
}

export interface UpdateBrandInput {
  readonly name?: string;
  readonly logoUrl?: string | null;
  readonly description?: string | null;
  readonly contactInfo?: Record<string, unknown> | null;
}

export interface SelfUpdateBrandInput {
  readonly name?: string;
  readonly logoUrl?: string;
  readonly description?: string;
  readonly contactInfo?: Record<string, unknown>;
}

export interface UpdateBrandLegalProfileInput {
  readonly taxCode: string;
  readonly businessLicenseNumber?: string;
  readonly payoutAccount?: {
    readonly bankCode: string;
    readonly accountNumber: string;
    readonly accountHolder: string;
  };
}

type Queries = Pick<
  BndQueries,
  | 'list'
  | 'findById'
  | 'findByCode'
  | 'codeExists'
  | 'create'
  | 'update'
  | 'setStatus'
  | 'updateLegalProfile'
  | 'verifyLegal'
>;
type Audit = Pick<AuditService, 'log'>;
type Config = Pick<AppConfig, 'refundAccountEncKey'>;

@Injectable()
export class BndService {
  constructor(
    @Inject(BndQueries) private readonly queries: Queries,
    @Inject(AuditService) private readonly audit: Audit,
    @Inject(APP_CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(filter: BrandFilter): Promise<{ items: Brand[]; total: number }> {
    const { items, total } = await this.queries.list(filter);
    return { items: items.map((r) => this.toDto(r)), total };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Brand> {
    const record = await this.queries.findById(id);
    if (!record) throw notFoundFor(actor);
    return this.toDto(record);
  }

  /**
   * FR-BND-01: Platform Super Admin tạo thương hiệu mới.
   */
  async create(actor: AuthenticatedUser, input: CreateBrandInput): Promise<Brand> {
    if (await this.queries.codeExists(input.code)) {
      throw invalidField('code', 'bnd.codeTaken');
    }

    const id = await this.queries.create({
      code: input.code,
      name: input.name,
      description: input.description,
      contactInfo: input.contactInfo,
    });

    const created = await this.queries.findById(id);
    if (!created) throw new Error(`Không đọc lại được thương hiệu vừa tạo ${id}`);

    const dto = this.toDto(created);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: id,
      action: 'bnd.brand.created',
      targetType: 'brand',
      targetId: id,
      after: dto,
    });

    return dto;
  }

  /**
   * FR-BND-02: Platform Super Admin cập nhật thông tin thương hiệu.
   */
  async update(actor: AuthenticatedUser, id: string, input: UpdateBrandInput): Promise<Brand> {
    const before = await this.queries.findById(id);
    if (!before) throw notFoundFor(actor);

    await this.queries.update(id, input);
    const updated = await this.queries.findById(id);
    if (!updated) throw notFoundFor(actor);

    const dto = this.toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: id,
      action: 'bnd.brand.updated',
      targetType: 'brand',
      targetId: id,
      before: this.toDto(before),
      after: dto,
    });

    return dto;
  }

  /**
   * FR-BND-03: Platform Super Admin đổi trạng thái thương hiệu (ACTIVE / SUSPENDED / DISABLED).
   */
  async setStatus(actor: AuthenticatedUser, id: string, status: BrandStatus): Promise<Brand> {
    const before = await this.queries.findById(id);
    if (!before) throw notFoundFor(actor);
    if (before.status === status) return this.toDto(before);

    await this.queries.setStatus(id, status);
    const updated = await this.queries.findById(id);
    if (!updated) throw notFoundFor(actor);

    const dto = this.toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: id,
      action: 'bnd.brand.status_changed',
      targetType: 'brand',
      targetId: id,
      severity: 'WARNING',
      before: { status: before.status },
      after: { status },
    });

    return dto;
  }

  /**
   * FR-BND-06: Brand Admin xem thông tin thương hiệu mình.
   */
  async getMyBrand(actor: AuthenticatedUser): Promise<Brand> {
    if (!actor.brandId) {
      throw new AppError('FORBIDDEN_SCOPE', 'bnd.brandAccountOnly');
    }
    const record = await this.queries.findById(actor.brandId);
    if (!record) throw notFoundFor(actor);
    return this.toDto(record);
  }

  /**
   * FR-BND-06: Brand Admin cập nhật thông tin thương hiệu mình.
   */
  async updateMyBrand(actor: AuthenticatedUser, input: SelfUpdateBrandInput): Promise<Brand> {
    if (!actor.brandId) {
      throw new AppError('FORBIDDEN_SCOPE', 'bnd.brandAccountOnly');
    }
    const before = await this.queries.findById(actor.brandId);
    if (!before) throw notFoundFor(actor);

    await this.queries.update(actor.brandId, input);
    const updated = await this.queries.findById(actor.brandId);
    if (!updated) throw notFoundFor(actor);

    const dto = this.toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: actor.brandId,
      action: 'bnd.brand.updated',
      targetType: 'brand',
      targetId: actor.brandId,
      before: this.toDto(before),
      after: dto,
    });

    return dto;
  }

  /**
   * FR-BND-09: Brand Admin khai hồ sơ pháp nhân và tài khoản nhận doanh thu (ADR-0013).
   * Khi cập nhật, trạng thái xác minh trước đó bị xóa (legal_verified_at = null, legal_verified_by = null).
   */
  async updateMyBrandLegalProfile(
    actor: AuthenticatedUser,
    input: UpdateBrandLegalProfileInput,
  ): Promise<Brand> {
    if (!actor.brandId) {
      throw new AppError('FORBIDDEN_SCOPE', 'bnd.brandAccountOnly');
    }
    const before = await this.queries.findById(actor.brandId);
    if (!before) throw notFoundFor(actor);

    let payoutAccountCiphertext = before.payoutAccountCiphertext;
    let payoutAccountKeyVersion = before.payoutAccountKeyVersion;

    if (input.payoutAccount !== undefined) {
      const key = this.config.refundAccountEncKey;
      if (!key) {
        throw new Error('Thiếu REFUND_ACCOUNT_ENC_KEY để mã hóa tài khoản nhận tiền.');
      }
      payoutAccountCiphertext = encryptJson(key, input.payoutAccount);
      payoutAccountKeyVersion = PII_KEY_VERSION;
    }

    await this.queries.updateLegalProfile(actor.brandId, {
      taxCode: input.taxCode,
      businessLicenseNumber:
        input.businessLicenseNumber ?? before.businessLicenseNumber ?? undefined,
      payoutAccountCiphertext,
      payoutAccountKeyVersion,
    });

    const updated = await this.queries.findById(actor.brandId);
    if (!updated) throw notFoundFor(actor);

    const dto = this.toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: actor.brandId,
      action: 'bnd.brand.legal_profile_updated',
      targetType: 'brand',
      targetId: actor.brandId,
      before: this.toDto(before),
      after: dto,
    });

    return dto;
  }

  /**
   * FR-BND-10: Platform Super Admin ghi nhận đã xác minh pháp nhân thương hiệu (ADR-0013).
   * Yêu cầu thương hiệu phải có mã số thuế. Thao tác có tính idempotent.
   */
  async verifyBrandLegal(actor: AuthenticatedUser, brandId: string): Promise<Brand> {
    const brand = await this.queries.findById(brandId);
    if (!brand) throw notFoundFor(actor);

    if (!brand.taxCode) {
      throw new AppError('VALIDATION_ERROR', 'bnd.taxCodeRequiredForVerification');
    }

    // Idempotent: nếu đã xác minh rồi thì trả về luôn không ghi đè hay báo lỗi
    if (brand.legalVerifiedAt !== null) {
      return this.toDto(brand);
    }

    const now = this.clock.now();
    await this.queries.verifyLegal(brandId, actor.userId, now);

    const updated = await this.queries.findById(brandId);
    if (!updated) throw notFoundFor(actor);

    const dto = this.toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId,
      action: 'bnd.legal.verified',
      targetType: 'brand',
      targetId: brandId,
      after: {
        legalVerifiedAt: now.toISOString(),
        legalVerifiedBy: actor.userId,
      },
    });

    return dto;
  }

  private toDto(record: BrandRecord): Brand {
    let payoutAccountMasked = null;
    const key = this.config.refundAccountEncKey;
    if (record.payoutAccountCiphertext && key) {
      try {
        const raw = decryptJson<{ bankCode: string; accountNumber: string; accountHolder: string }>(
          key,
          record.payoutAccountCiphertext,
        );
        const maskedAccountNumber =
          raw.accountNumber && raw.accountNumber.length > 4
            ? '****' + raw.accountNumber.slice(-4)
            : '****';
        payoutAccountMasked = {
          bankCode: raw.bankCode,
          maskedAccountNumber,
          accountHolder: raw.accountHolder,
        };
      } catch {
        payoutAccountMasked = null;
      }
    }

    return {
      id: record.id,
      code: record.code,
      name: record.name,
      logoUrl: record.logoUrl,
      description: record.description,
      contactInfo: record.contactInfo,
      taxCode: record.taxCode,
      businessLicenseNumber: record.businessLicenseNumber,
      hasPayoutAccount: record.payoutAccountCiphertext !== null,
      payoutAccountMasked,
      legalVerifiedAt: record.legalVerifiedAt?.toISOString() ?? null,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

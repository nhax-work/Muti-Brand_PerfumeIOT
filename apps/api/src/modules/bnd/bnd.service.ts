/**
 * Quản trị thương hiệu (FR-BND-01..07).
 *
 * Tầng nghiệp vụ độc lập hoàn toàn với HTTP (QT2, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  BndQueries,
  type BrandFilter,
  type BrandRecord,
  type BrandStatus,
} from './bnd.queries.js';

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

type Queries = Pick<
  BndQueries,
  'list' | 'findById' | 'findByCode' | 'codeExists' | 'create' | 'update' | 'setStatus'
>;
type Audit = Pick<AuditService, 'log'>;

@Injectable()
export class BndService {
  constructor(
    @Inject(BndQueries) private readonly queries: Queries,
    @Inject(AuditService) private readonly audit: Audit,
  ) {}

  async list(filter: BrandFilter): Promise<{ items: Brand[]; total: number }> {
    const { items, total } = await this.queries.list(filter);
    return { items: items.map(toDto), total };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Brand> {
    const record = await this.queries.findById(id);
    if (!record) throw notFoundFor(actor);
    return toDto(record);
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

    const dto = toDto(created);
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

    const dto = toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: id,
      action: 'bnd.brand.updated',
      targetType: 'brand',
      targetId: id,
      before: toDto(before),
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
    if (before.status === status) return toDto(before);

    await this.queries.setStatus(id, status);
    const updated = await this.queries.findById(id);
    if (!updated) throw notFoundFor(actor);

    const dto = toDto(updated);
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
    return toDto(record);
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

    const dto = toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: actor.brandId,
      action: 'bnd.brand.updated',
      targetType: 'brand',
      targetId: actor.brandId,
      before: toDto(before),
      after: dto,
    });

    return dto;
  }
}

function toDto(record: BrandRecord): Brand {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    logoUrl: record.logoUrl,
    description: record.description,
    contactInfo: record.contactInfo,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Danh mục sản phẩm nước hoa (FR-PRD-01..05).
 *
 * Tầng nghiệp vụ độc lập hoàn toàn với HTTP (QT2, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { PrdQueries, type ProductFilter, type ProductRecord } from './prd.queries.js';

type Product = Schema<'Product'>;

export interface CreateProductInput {
  readonly sku: string;
  readonly name: string;
  readonly description?: string;
  readonly fragranceNotes?: Record<string, unknown>;
  readonly imageUrl?: string;
  readonly defaultPrice: string;
  readonly currency?: string;
  readonly fullBottleRetailPrice?: string;
  readonly fullBottleVolumeMl?: number;
}

export interface UpdateProductInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly fragranceNotes?: Record<string, unknown> | null;
  readonly imageUrl?: string | null;
  readonly defaultPrice?: string;
  readonly currency?: string;
  readonly fullBottleRetailPrice?: string | null;
  readonly fullBottleVolumeMl?: number | null;
}

type Queries = Pick<
  PrdQueries,
  'list' | 'findById' | 'skuExists' | 'create' | 'update' | 'setStatus'
>;
type Audit = Pick<AuditService, 'log'>;

@Injectable()
export class PrdService {
  constructor(
    @Inject(PrdQueries) private readonly queries: Queries,
    @Inject(AuditService) private readonly audit: Audit,
  ) {}

  async list(
    scope: BrandScope,
    filter: ProductFilter,
  ): Promise<{ items: Product[]; total: number }> {
    const { items, total } = await this.queries.list(scope, filter);
    return { items: items.map(toDto), total };
  }

  async get(actor: AuthenticatedUser, scope: BrandScope, id: string): Promise<Product> {
    const record = await this.queries.findById(scope, id);
    if (!record) throw notFoundFor(actor);
    return toDto(record);
  }

  /**
   * FR-PRD-01, FR-PRD-03, FR-PRD-05: Brand Admin tạo sản phẩm cho thương hiệu mình.
   */
  async create(actor: AuthenticatedUser, input: CreateProductInput): Promise<Product> {
    if (!actor.brandId) {
      throw new AppError('FORBIDDEN_SCOPE', 'prd.brandAccountOnly');
    }

    if (await this.queries.skuExists(actor.brandId, input.sku)) {
      throw invalidField('sku', 'prd.skuTaken');
    }

    const id = await this.queries.create({
      brandId: actor.brandId,
      sku: input.sku,
      name: input.name,
      description: input.description,
      fragranceNotes: input.fragranceNotes,
      imageUrl: input.imageUrl,
      defaultPrice: input.defaultPrice,
      currency: input.currency ?? 'VND',
      fullBottleRetailPrice: input.fullBottleRetailPrice,
      fullBottleVolumeMl: input.fullBottleVolumeMl,
    });

    const created = await this.queries.findById({ kind: 'BRAND', brandId: actor.brandId }, id);
    if (!created) throw new Error(`Không đọc lại được sản phẩm vừa tạo ${id}`);

    const dto = toDto(created);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: actor.brandId,
      action: 'prd.product.created',
      targetType: 'product',
      targetId: id,
      after: dto,
    });

    return dto;
  }

  /**
   * FR-PRD-02: Brand Admin cập nhật sản phẩm của thương hiệu mình.
   */
  async update(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
    input: UpdateProductInput,
  ): Promise<Product> {
    const before = await this.queries.findById(scope, id);
    if (!before) throw notFoundFor(actor);

    await this.queries.update(id, input);
    const updated = await this.queries.findById(scope, id);
    if (!updated) throw notFoundFor(actor);

    const dto = toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: before.brandId,
      action: 'prd.product.updated',
      targetType: 'product',
      targetId: id,
      before: toDto(before),
      after: dto,
    });

    return dto;
  }

  /**
   * FR-PRD-02: Ngừng kinh doanh sản phẩm.
   */
  async discontinue(actor: AuthenticatedUser, scope: BrandScope, id: string): Promise<Product> {
    const before = await this.queries.findById(scope, id);
    if (!before) throw notFoundFor(actor);
    if (before.status === 'DISCONTINUED') return toDto(before);

    await this.queries.setStatus(id, 'DISCONTINUED');
    const updated = await this.queries.findById(scope, id);
    if (!updated) throw notFoundFor(actor);

    const dto = toDto(updated);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: before.brandId,
      action: 'prd.product.discontinued',
      targetType: 'product',
      targetId: id,
      severity: 'WARNING',
      before: { status: before.status },
      after: { status: 'DISCONTINUED' },
    });

    return dto;
  }
}

function toDto(record: ProductRecord): Product {
  return {
    id: record.id,
    brandId: record.brandId,
    sku: record.sku,
    name: record.name,
    description: record.description,
    fragranceNotes: record.fragranceNotes,
    imageUrl: record.imageUrl,
    defaultPrice: record.defaultPrice,
    currency: record.currency,
    fullBottleRetailPrice: record.fullBottleRetailPrice,
    fullBottleVolumeMl: record.fullBottleVolumeMl,
    status: record.status,
  };
}

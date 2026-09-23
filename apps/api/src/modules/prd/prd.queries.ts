/**
 * Truy vấn của module PRD. Chỉ module prd được import file này (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';

export type ProductStatus = 'ACTIVE' | 'DISCONTINUED';

export interface ProductRecord {
  readonly id: string;
  readonly brandId: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly fragranceNotes: Record<string, unknown> | null;
  readonly imageUrl: string | null;
  readonly defaultPrice: string;
  readonly currency: string;
  readonly fullBottleRetailPrice: string | null;
  readonly fullBottleVolumeMl: number | null;
  readonly status: ProductStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductFilter {
  readonly status?: ProductStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateProductData {
  readonly brandId: string;
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

export interface UpdateProductData {
  readonly name?: string;
  readonly description?: string | null;
  readonly fragranceNotes?: Record<string, unknown> | null;
  readonly imageUrl?: string | null;
  readonly defaultPrice?: string;
  readonly currency?: string;
  readonly fullBottleRetailPrice?: string | null;
  readonly fullBottleVolumeMl?: number | null;
}

@Injectable()
export class PrdQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    scope: BrandScope,
    filter: ProductFilter,
  ): Promise<{ items: ProductRecord[]; total: number }> {
    let base = this.db
      .selectFrom('fragrance_products')
      .where(brandScopedByColumn(scope, 'fragrance_products.brand_id'))
      .where('deleted_at', 'is', null);

    if (filter.status) {
      base = base.where('status', '=', filter.status);
    }

    const countRow = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map(toRecord),
      total: Number(countRow.total),
    };
  }

  async findById(scope: BrandScope, id: string): Promise<ProductRecord | undefined> {
    const row = await this.db
      .selectFrom('fragrance_products')
      .selectAll()
      .where('id', '=', id)
      .where(brandScopedByColumn(scope, 'fragrance_products.brand_id'))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row ? toRecord(row) : undefined;
  }

  async skuExists(brandId: string, sku: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('fragrance_products')
      .select('id')
      .where('brand_id', '=', brandId)
      .where('sku', '=', sku)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row !== undefined;
  }

  async create(input: CreateProductData): Promise<string> {
    const row = await this.db
      .insertInto('fragrance_products')
      .values({
        brand_id: input.brandId,
        sku: input.sku,
        name: input.name,
        description: input.description ?? null,
        fragrance_notes: input.fragranceNotes ? JSON.stringify(input.fragranceNotes) : null,
        image_url: input.imageUrl ?? null,
        default_price: input.defaultPrice,
        currency: input.currency ?? 'VND',
        full_bottle_retail_price: input.fullBottleRetailPrice ?? null,
        full_bottle_volume_ml:
          input.fullBottleVolumeMl !== undefined ? String(input.fullBottleVolumeMl) : null,
        status: 'ACTIVE',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return row.id;
  }

  async update(id: string, input: UpdateProductData): Promise<void> {
    const values: Record<string, unknown> = {
      updated_at: new Date(),
    };
    if (input.name !== undefined) values['name'] = input.name;
    if (input.description !== undefined) values['description'] = input.description;
    if (input.fragranceNotes !== undefined) {
      values['fragrance_notes'] = input.fragranceNotes
        ? JSON.stringify(input.fragranceNotes)
        : null;
    }
    if (input.imageUrl !== undefined) values['image_url'] = input.imageUrl;
    if (input.defaultPrice !== undefined) values['default_price'] = input.defaultPrice;
    if (input.currency !== undefined) values['currency'] = input.currency;
    if (input.fullBottleRetailPrice !== undefined) {
      values['full_bottle_retail_price'] = input.fullBottleRetailPrice;
    }
    if (input.fullBottleVolumeMl !== undefined) {
      values['full_bottle_volume_ml'] =
        input.fullBottleVolumeMl !== null ? String(input.fullBottleVolumeMl) : null;
    }

    await this.db.updateTable('fragrance_products').set(values).where('id', '=', id).execute();
  }

  async setStatus(id: string, status: ProductStatus): Promise<void> {
    await this.db
      .updateTable('fragrance_products')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }
}

function toRecord(row: {
  id: string;
  brand_id: string;
  sku: string;
  name: string;
  description: string | null;
  fragrance_notes: unknown;
  image_url: string | null;
  default_price: string | number;
  currency: string;
  full_bottle_retail_price: string | number | null;
  full_bottle_volume_ml: string | number | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}): ProductRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    fragranceNotes: (row.fragrance_notes as Record<string, unknown> | null) ?? null,
    imageUrl: row.image_url,
    defaultPrice: String(row.default_price),
    currency: row.currency,
    fullBottleRetailPrice:
      row.full_bottle_retail_price !== null ? String(row.full_bottle_retail_price) : null,
    fullBottleVolumeMl:
      row.full_bottle_volume_ml !== null ? Number(row.full_bottle_volume_ml) : null,
    status: row.status as ProductStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

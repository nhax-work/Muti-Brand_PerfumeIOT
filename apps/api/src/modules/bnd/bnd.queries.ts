/**
 * Truy vấn của module BND. Chỉ module bnd được import file này (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DATABASE, type Database } from '../../shared/db/index.js';

export type BrandStatus = Schema<'BrandStatus'>;

export interface BrandRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly description: string | null;
  readonly contactInfo: Record<string, unknown> | null;
  readonly kioskContent: Record<string, unknown> | null;
  readonly status: BrandStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandFilter {
  readonly status?: BrandStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateBrandData {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly contactInfo?: Record<string, unknown>;
}

export interface UpdateBrandData {
  readonly name?: string;
  readonly logoUrl?: string | null;
  readonly description?: string | null;
  readonly contactInfo?: Record<string, unknown> | null;
}

@Injectable()
export class BndQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(filter: BrandFilter): Promise<{ items: BrandRecord[]; total: number }> {
    let base = this.db.selectFrom('brands as b');
    if (filter.status) {
      base = base.where('b.status', '=', filter.status);
    }

    const countRow = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll()
      .orderBy('b.created_at', 'desc')
      .orderBy('b.id')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map(toRecord),
      total: Number(countRow.total),
    };
  }

  async findById(id: string): Promise<BrandRecord | undefined> {
    const row = await this.db
      .selectFrom('brands')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  async findByCode(code: string): Promise<BrandRecord | undefined> {
    const row = await this.db
      .selectFrom('brands')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  async codeExists(code: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('brands')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    return row !== undefined;
  }

  async create(input: CreateBrandData): Promise<string> {
    const row = await this.db
      .insertInto('brands')
      .values({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        contact_info: input.contactInfo ? JSON.stringify(input.contactInfo) : null,
        status: 'ACTIVE',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async update(id: string, input: UpdateBrandData): Promise<void> {
    const values: Record<string, unknown> = {
      updated_at: new Date(),
    };
    if (input.name !== undefined) values['name'] = input.name;
    if (input.logoUrl !== undefined) values['logo_url'] = input.logoUrl;
    if (input.description !== undefined) values['description'] = input.description;
    if (input.contactInfo !== undefined) {
      values['contact_info'] = input.contactInfo ? JSON.stringify(input.contactInfo) : null;
    }

    await this.db.updateTable('brands').set(values).where('id', '=', id).execute();
  }

  async setStatus(id: string, status: BrandStatus): Promise<void> {
    await this.db
      .updateTable('brands')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }
}

function toRecord(row: {
  id: string;
  code: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  contact_info: unknown;
  kiosk_content: unknown;
  status: BrandStatus;
  created_at: Date;
  updated_at: Date;
}): BrandRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    logoUrl: row.logo_url,
    description: row.description,
    contactInfo: (row.contact_info as Record<string, unknown> | null) ?? null,
    kioskContent: (row.kiosk_content as Record<string, unknown> | null) ?? null,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

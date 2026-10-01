/**
 * SQL cho bảng giá thuê slot: gói thuê, gói bảo quản, giá niêm yết slot (FR-SLT-30..32, ADR-0006).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable, Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';

type Executor = Kysely<DB>;

export type RentalPackageRow = Selectable<DB['rental_packages']>;
export type StoragePlanRow = Selectable<DB['storage_plans']>;

export interface RentalPackageChanges {
  readonly name?: string | undefined;
  readonly discountPercent?: number | undefined;
  readonly isActive?: boolean | undefined;
}

export interface StoragePlanValues {
  readonly name: string;
  readonly description: string | null;
  readonly monthlyPrice: string;
  readonly coveragePercent: number;
  readonly coverageCap: string;
}

export type StoragePlanChanges = Partial<StoragePlanValues> & { readonly isActive?: boolean };

@Injectable()
export class CatalogQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  // -----------------------------------------------------------------------------------
  // Gói thuê (FR-SLT-30)
  // -----------------------------------------------------------------------------------

  listPackages(isActive?: boolean): Promise<RentalPackageRow[]> {
    let query = this.db.selectFrom('rental_packages').selectAll();
    if (isActive !== undefined) query = query.where('is_active', '=', isActive);
    return query.orderBy('duration_months').orderBy('name').execute();
  }

  findPackage(id: string, executor: Executor = this.db) {
    return executor
      .selectFrom('rental_packages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  insertPackage(values: {
    readonly name: string;
    readonly durationMonths: number;
    readonly discountPercent: number;
  }): Promise<RentalPackageRow> {
    return this.db
      .insertInto('rental_packages')
      .values({
        name: values.name,
        duration_months: values.durationMonths,
        discount_percent: String(values.discountPercent),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updatePackage(id: string, changes: RentalPackageChanges) {
    return this.db
      .updateTable('rental_packages')
      .set({
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.discountPercent !== undefined
          ? { discount_percent: String(changes.discountPercent) }
          : {}),
        ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  // -----------------------------------------------------------------------------------
  // Gói bảo quản (FR-SLT-31)
  // -----------------------------------------------------------------------------------

  listPlans(isActive?: boolean): Promise<StoragePlanRow[]> {
    let query = this.db.selectFrom('storage_plans').selectAll();
    if (isActive !== undefined) query = query.where('is_active', '=', isActive);
    return query.orderBy('monthly_price').orderBy('name').execute();
  }

  insertPlan(values: StoragePlanValues): Promise<StoragePlanRow> {
    return this.db
      .insertInto('storage_plans')
      .values({
        name: values.name,
        description: values.description,
        monthly_price: values.monthlyPrice,
        coverage_percent: String(values.coveragePercent),
        coverage_cap: values.coverageCap,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Khóa gói cần sửa — ngừng mở bán thì kiểm "còn gói khác đang mở" trong cùng transaction. */
  lockPlan(id: string, tx: Executor) {
    return tx
      .selectFrom('storage_plans')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  /**
   * Khóa mọi gói đang mở bán rồi đếm. Khóa (không chỉ đếm) để hai Super Admin ngừng mở bán hai gói
   * cuối cùng cùng lúc không lọt qua cả hai (FR-SLT-31 AC3).
   */
  async lockActivePlanIds(tx: Executor): Promise<string[]> {
    const rows = await tx
      .selectFrom('storage_plans')
      .select('id')
      .where('is_active', '=', true)
      .forUpdate()
      .execute();
    return rows.map((r) => r.id);
  }

  updatePlan(id: string, changes: StoragePlanChanges, tx: Executor) {
    return tx
      .updateTable('storage_plans')
      .set({
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.description !== undefined ? { description: changes.description } : {}),
        ...(changes.monthlyPrice !== undefined ? { monthly_price: changes.monthlyPrice } : {}),
        ...(changes.coveragePercent !== undefined
          ? { coverage_percent: String(changes.coveragePercent) }
          : {}),
        ...(changes.coverageCap !== undefined ? { coverage_cap: changes.coverageCap } : {}),
        ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // -----------------------------------------------------------------------------------
  // Giá niêm yết slot (FR-SLT-32)
  // -----------------------------------------------------------------------------------

  /** @returns giá cũ, hoặc `undefined` nếu slot không tồn tại. */
  async setSlotRentPrice(
    slotId: string,
    monthlyRentPrice: string | null,
  ): Promise<{ before: string | null } | undefined> {
    return this.db.transaction().execute(async (tx) => {
      const current = await tx
        .selectFrom('machine_slots')
        .select('monthly_rent_price')
        .where('id', '=', slotId)
        .forUpdate()
        .executeTakeFirst();
      if (!current) return undefined;
      await tx
        .updateTable('machine_slots')
        .set({ monthly_rent_price: monthlyRentPrice })
        .where('id', '=', slotId)
        .execute();
      return { before: current.monthly_rent_price };
    });
  }
}

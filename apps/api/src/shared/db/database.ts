/**
 * Kết nối CSDL dùng Kysely (ADR-0003): SQL-first, kiểu sinh từ lược đồ đã migrate.
 *
 * `types.generated.ts` sinh bằng `npm run db:types` từ CSDL đã chạy migration — tức là từ đúng
 * spec/contracts/schema.sql. Không dùng ORM: lược đồ là nguồn sự thật, không phải code (ADR-0002).
 */

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types.generated.js';

export type Database = Kysely<DB>;

/** Token DI để inject Kysely trong Nest. */
export const DATABASE = Symbol('DATABASE');

export function createDatabase(connectionString: string): Database {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 10 }),
    }),
  });
}

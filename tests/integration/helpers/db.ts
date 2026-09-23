/**
 * Kết nối CSDL cho test tích hợp.
 *
 * Ưu tiên `DATABASE_URL_TEST` (CSDL riêng cho test, cổng 5433 theo docker-compose.yml) rồi mới tới
 * `DATABASE_URL` — CI đặt thẳng `DATABASE_URL` trỏ vào CSDL test (.github/workflows/ci.yml).
 *
 * Thiếu cả hai thì NÉM LỖI chứ không `skip`: một bộ test cô lập dữ liệu bị bỏ qua trong im lặng còn
 * nguy hiểm hơn là không có, vì bảng kết quả vẫn xanh.
 */

import pg from 'pg';
import { loadEnvFile } from '../../../apps/api/src/shared/config/env-file.js';
import { createDatabase, type Database } from '../../../apps/api/src/shared/db/database.js';

const TEST_DB_HINT =
  '  DATABASE_URL_TEST=postgresql://scent:scent_test@localhost:5433/scentstation_test';

export function resolveTestDatabaseUrl(): string {
  loadEnvFile();

  const explicit = process.env['DATABASE_URL_TEST'];
  if (explicit) return explicit;

  const fallback = process.env['DATABASE_URL'];
  if (!fallback) {
    throw new Error(
      [
        'Thiếu DATABASE_URL_TEST cho test tích hợp.',
        'Chạy `docker compose up -d db-test` rồi thêm vào .env:',
        TEST_DB_HINT,
        'Sau đó chạy migration lên chính CSDL đó trước khi test.',
      ].join('\n'),
    );
  }

  // CI không đặt DATABASE_URL_TEST mà trỏ thẳng DATABASE_URL vào CSDL test
  // (.github/workflows/ci.yml), nên vẫn phải chấp nhận phương án dự phòng — nhưng chỉ khi tên CSDL
  // tự nói rằng đó là CSDL test.
  //
  // Chốt này có vì buộc: bộ test seed rồi xóa hàng loạt bảng, mà `.env` mẫu ở máy dev lại trỏ
  // DATABASE_URL vào CSDL dev. Chạy nhầm một lần là mất dữ liệu dev, không hoàn lại được.
  const name = databaseNameOf(fallback);
  if (!/test/i.test(name)) {
    throw new Error(
      [
        `Từ chối chạy test tích hợp trên CSDL "${name}".`,
        'Bộ test này seed và xóa dữ liệu, nên chỉ chạy trên CSDL riêng cho test.',
        'Thêm vào .env:',
        TEST_DB_HINT,
      ].join('\n'),
    );
  }
  return fallback;
}

/** Tên CSDL trong chuỗi kết nối; chuỗi hỏng thì trả rỗng để chốt chặn ở trên từ chối. */
function databaseNameOf(connectionString: string): string {
  try {
    return new URL(connectionString).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

export interface TestDb {
  readonly db: Database;
  close(): Promise<void>;
}

export function openTestDb(): TestDb {
  const db = createDatabase(resolveTestDatabaseUrl());
  return {
    db,
    close: () => db.destroy(),
  };
}

/** Client thô cho các test ràng buộc — chúng phải nói chuyện thẳng với CSDL, không qua Kysely. */
export async function openRawClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: resolveTestDatabaseUrl() });
  await client.connect();
  return client;
}

export type { Database };

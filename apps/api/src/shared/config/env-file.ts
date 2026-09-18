/**
 * Nạp `.env` ở gốc repo.
 *
 * `npm run api:dev` chạy qua workspace, nên thư mục làm việc là `apps/api` chứ không phải gốc repo —
 * `import 'dotenv/config'` khi đó không thấy `.env`. Tìm ngược lên các thư mục cha thay vì cố định
 * một đường dẫn tương đối, để chạy đúng cả khi dev (tsx) lẫn khi chạy bản build (dist có cấu trúc
 * thư mục khác).
 *
 * Biến đã có sẵn trong môi trường (CI, Docker) KHÔNG bị ghi đè.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';

export function loadEnvFile(startDir: string = process.cwd()): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate });
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Cấu hình của apps/api.
 *
 * Hai nguồn, thứ tự ưu tiên rõ ràng:
 *   1. Ngưỡng nghiệp vụ lấy từ SPEC_CONSTRAINTS (sinh từ spec/constraints.md). Biến môi trường
 *      cùng tên được phép GHI ĐÈ — hữu ích khi test, ví dụ rút ACCESS_TOKEN_TTL_MIN xuống 1 —
 *      nhưng không bắt buộc. Nhờ vậy .env không phải liệt kê lại 29 hằng.
 *   2. Bí mật và địa chỉ hạ tầng (DATABASE_URL, JWT_SECRET) chỉ có trong môi trường, không bao giờ
 *      có giá trị mặc định trong mã (NFR-SEC-05).
 *
 * Không hardcode ngưỡng ở đâu khác trong apps/api — luôn đọc qua `constraint()` (spec/PROJECT.md Mục 3).
 */

import { SPEC_CONSTRAINTS, type ConstraintName } from './constraints.generated.js';

type ConstraintValue<K extends ConstraintName> = (typeof SPEC_CONSTRAINTS)[K];

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  constraint<K extends ConstraintName>(name: K): ConstraintValue<K>;
}

const PLACEHOLDER_SECRET = 'doi_gia_tri_nay';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = (env['APP_ENV'] ?? 'development') as AppConfig['env'];

  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('Thiếu DATABASE_URL. Sao chép .env.example thành .env.');
  }

  const jwtSecret = env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('Thiếu JWT_SECRET. Không có giá trị mặc định cho bí mật (NFR-SEC-05).');
  }
  if (appEnv === 'production') {
    if (jwtSecret === PLACEHOLDER_SECRET || jwtSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET ở production phải khác giá trị mẫu và dài tối thiểu ${MIN_PRODUCTION_SECRET_LENGTH} ký tự.`,
      );
    }
  }

  const overrides = new Map<ConstraintName, number | readonly number[]>();
  for (const name of Object.keys(SPEC_CONSTRAINTS) as ConstraintName[]) {
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    const parsed: unknown = JSON.parse(raw);
    const isNumberArray = Array.isArray(parsed) && parsed.every((v) => typeof v === 'number');
    if (typeof parsed !== 'number' && !isNumberArray) {
      throw new Error(`Biến môi trường ${name} phải là số hoặc mảng số, nhận được: ${raw}`);
    }
    overrides.set(name, parsed as number | number[]);
  }

  return {
    env: appEnv,
    port: Number(env['PORT'] ?? 3000),
    databaseUrl,
    jwtSecret,
    constraint<K extends ConstraintName>(name: K): ConstraintValue<K> {
      return (overrides.get(name) ?? SPEC_CONSTRAINTS[name]) as ConstraintValue<K>;
    },
  };
}

/** Token DI để inject AppConfig trong Nest. */
export const APP_CONFIG = Symbol('APP_CONFIG');

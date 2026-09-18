/**
 * Đọc bảng trong `spec/constraints.md` và `spec/errors.md`.
 *
 * Dùng chung cho `scripts/gen-spec-constants.ts` (sinh mã) và `tests/contract/spec-constants.test.ts`
 * (kiểm mã đã sinh còn khớp đặc tả). Để một chỗ để hai bên không thể đọc đặc tả theo hai cách khác nhau.
 */

import { readFileSync } from 'node:fs';

export interface ConstraintEntry {
  readonly name: string;
  readonly value: number | readonly number[];
}

export interface ErrorCodeEntry {
  readonly code: string;
  /** null với mã do thiết bị trả về — nhóm "Lệnh xịt" không có cột HTTP. */
  readonly httpStatus: number | null;
}

/** Dòng bảng Markdown mở đầu bằng một định danh trong dấu backtick: | `NAME` | ... | */
const ROW = /^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|(.*)\|\s*$/;

function cells(rest: string): string[] {
  return rest.split('|').map((c) => c.trim());
}

export function readConstraints(path = 'spec/constraints.md'): ConstraintEntry[] {
  const out: ConstraintEntry[] = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = ROW.exec(line.trim());
    if (!m || !m[1] || m[2] === undefined) continue;
    const raw = cells(m[2])[0] ?? '';
    const value: unknown = JSON.parse(raw);
    const isNumberArray = Array.isArray(value) && value.every((v) => typeof v === 'number');
    if (typeof value !== 'number' && !isNumberArray) {
      throw new Error(`spec/constraints.md: giá trị của ${m[1]} không phải số hay mảng số: ${raw}`);
    }
    out.push({ name: m[1], value: value as number | number[] });
  }
  return out;
}

export function readErrorCodes(path = 'spec/errors.md'): ErrorCodeEntry[] {
  const out: ErrorCodeEntry[] = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = ROW.exec(line.trim());
    if (!m || !m[1] || m[2] === undefined) continue;
    const first = cells(m[2])[0] ?? '';
    out.push({ code: m[1], httpStatus: /^\d{3}$/.test(first) ? Number(first) : null });
  }
  return out;
}

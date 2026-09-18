/**
 * Hằng ngưỡng và mã lỗi đã sinh trong apps/api phải khớp đúng đặc tả.
 *
 * Đỏ nghĩa là ai đó sửa spec/constraints.md hoặc spec/errors.md mà quên `npm run spec:generate` —
 * hoặc tệ hơn, sửa tay file .generated.ts.
 */

import { describe, expect, it } from 'vitest';
import { SPEC_CONSTRAINTS } from '../../apps/api/src/shared/config/constraints.generated.js';
import { ERROR_CODES } from '../../apps/api/src/shared/errors/codes.generated.js';
import { readConstraints, readErrorCodes } from '../../scripts/lib/spec-tables.js';

describe('mã đã sinh khớp đặc tả', () => {
  it('hằng ngưỡng khớp spec/constraints.md', () => {
    const fromSpec = Object.fromEntries(readConstraints().map((c) => [c.name, c.value]));
    expect(SPEC_CONSTRAINTS).toEqual(fromSpec);
  });

  it('mã lỗi và HTTP status khớp spec/errors.md', () => {
    const fromSpec = Object.fromEntries(readErrorCodes().map((c) => [c.code, c.httpStatus]));
    expect(ERROR_CODES).toEqual(fromSpec);
  });

  it('các ngưỡng mà module xác thực phụ thuộc đều có mặt', () => {
    for (const name of [
      'ACCESS_TOKEN_TTL_MIN',
      'REFRESH_TOKEN_TTL_DAYS',
      'LOGIN_LOCKOUT_ATTEMPTS',
      'LOGIN_LOCKOUT_MIN',
      'SESSION_REVOKE_MAX_SEC',
      'REAUTH_TOKEN_TTL_SEC',
    ]) {
      expect(SPEC_CONSTRAINTS).toHaveProperty(name);
    }
  });
});

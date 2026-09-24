/**
 * Sinh hằng ngưỡng và mã lỗi cho apps/api từ đặc tả.
 *
 *   npm run spec:generate
 *
 * `spec/constraints.md` và `spec/errors.md` là nguồn duy nhất (spec/PROJECT.md Mục 3). Sinh mã từ
 * chúng thay vì chép tay nghĩa là:
 *   - ngưỡng không bao giờ bị hardcode ở chỗ thứ hai;
 *   - `new AppError('MA_KHONG_CO')` là lỗi BIÊN DỊCH — quy tắc "agent không được tự nghĩ mã lỗi"
 *     được cưỡng chế bằng kiểu chứ không bằng trí nhớ.
 *
 * `tests/contract/spec-constants.test.ts` báo đỏ nếu quên chạy lại sau khi sửa đặc tả.
 */

import { writeFileSync } from 'node:fs';
import { readConstraints, readErrorCodes } from './lib/spec-tables.js';

const HEADER = (source: string) =>
  `// SINH TỰ ĐỘNG từ ${source} bằng \`npm run spec:generate\`. KHÔNG SỬA TAY.\n` +
  `// Muốn đổi: sửa ${source} rồi chạy lại lệnh trên.\n\n`;

/**
 * Mỗi ứng dụng một bản, cùng nội dung. Không đặt vào `packages/contracts` vì gói đó chỉ chứa kiểu
 * ("hằng số thuộc về ứng dụng, không thuộc về contract"); không để kiosk import từ `apps/api` vì
 * client không được chạm ruột server. `tests/contract/spec-constants.test.ts` kiểm mọi bản.
 */
const CONSTRAINT_TARGETS = [
  'apps/api/src/shared/config/constraints.generated.ts',
  'apps/kiosk/src/shared/config/constraints.generated.ts',
] as const;

const constraints = readConstraints();
const constraintsSource =
  HEADER('spec/constraints.md') +
  'export const SPEC_CONSTRAINTS = {\n' +
  constraints.map((c) => `  ${c.name}: ${JSON.stringify(c.value)},\n`).join('') +
  '} as const;\n\n' +
  'export type ConstraintName = keyof typeof SPEC_CONSTRAINTS;\n';
for (const target of CONSTRAINT_TARGETS) {
  writeFileSync(target, constraintsSource);
}

const codes = readErrorCodes();
writeFileSync(
  'apps/api/src/shared/errors/codes.generated.ts',
  HEADER('spec/errors.md') +
    '/** Mã lỗi -> HTTP status. `null` là mã do thiết bị trả về, không đi qua HTTP. */\n' +
    'export const ERROR_CODES = {\n' +
    codes.map((c) => `  ${c.code}: ${c.httpStatus},\n`).join('') +
    '} as const;\n\n' +
    'export type ErrorCode = keyof typeof ERROR_CODES;\n',
);

console.log(`Đã sinh ${constraints.length} hằng ngưỡng và ${codes.length} mã lỗi.`);

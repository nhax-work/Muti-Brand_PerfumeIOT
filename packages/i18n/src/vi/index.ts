/**
 * Catalog tiếng Việt — NGUỒN SỰ THẬT của tập khóa.
 *
 * `packages/i18n/src/en/index.ts` khai báo `const en: typeof vi`, nên thiếu hay thừa một khóa ở bản
 * tiếng Anh là lỗi biên dịch chứ không phải lỗi phát hiện lúc chạy. Thêm khóa ở đây thì phải thêm
 * ở `en/` trong cùng commit (spec/PROJECT.md Mục 3).
 */

import { auth } from './auth.js';
import { bnd } from './bnd.js';
import { common } from './common.js';
import { mch, slotStatus } from './mch.js';
import { prd } from './prd.js';
import { usr } from './usr.js';
import { validation } from './validation.js';

export const vi = { common, validation, auth, mch, slotStatus, bnd, prd, usr } as const;

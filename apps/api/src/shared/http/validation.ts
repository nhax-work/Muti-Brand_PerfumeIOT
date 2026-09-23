/**
 * Kiểm dữ liệu vào bằng zod, lỗi quy về VALIDATION_ERROR kèm danh sách trường sai.
 *
 * Schema zod ở tầng HTTP chỉ kiểm HÌNH DẠNG (kiểu, bắt buộc, định dạng). Luật nghiệp vụ — kỳ hạn
 * chồng lấn, slot đang có hợp đồng — thuộc về service và trả mã nghiệp vụ cụ thể.
 *
 * VỀ NGÔN NGỮ: trước đây file này đẩy thẳng `issue.message` của zod ra phản hồi, tức là tiếng Anh
 * ("Required", "Invalid uuid") nằm trong `details` còn tiếng Việt nằm ở `message` — lai ngôn ngữ
 * ngay trong một phản hồi. Giờ mỗi trường mang `rule` (mã lỗi gốc của zod) và `messageKey` để
 * client tự dịch, `message` chỉ còn là bản dự phòng tiếng Việt.
 */

import { DEFAULT_LOCALE, isMessageKey, translate, type MessageKey } from '@scentstation/i18n';
import type { z } from 'zod';
import { AppError } from '../errors/index.js';

/** Trường hợp `invalid_string` của zod chia nhỏ theo `validation`. */
const STRING_RULE_TO_KEY: Readonly<Record<string, MessageKey>> = {
  email: 'validation.invalidEmail',
  uuid: 'validation.invalidUuid',
  url: 'validation.invalidUrl',
};

const ISSUE_TO_KEY: Readonly<Record<string, MessageKey>> = {
  invalid_type: 'validation.invalidType',
  invalid_enum_value: 'validation.invalidEnum',
  invalid_string: 'validation.invalidFormat',
  too_small: 'validation.tooSmall',
  too_big: 'validation.tooBig',
  not_finite: 'validation.notANumber',
};

/**
 * Suy khóa bản dịch từ một `ZodIssue`.
 *
 * Schema nào cần thông báo riêng thì truyền THẲNG KHÓA làm message của zod, ví dụ
 * `z.string().regex(RE, 'validation.priceFormat')` — nhánh đầu tiên bắt đúng trường hợp đó. Nhờ vậy
 * chuỗi riêng vẫn song ngữ được mà không phải mở thêm một cơ chế thứ hai.
 */
function keyOf(issue: z.ZodIssue): MessageKey {
  if (isMessageKey(issue.message)) return issue.message;

  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    // zod gộp "thiếu trường" vào invalid_type; người dùng cần nghe "bắt buộc nhập", không phải
    // "sai kiểu dữ liệu".
    return 'validation.required';
  }
  if (issue.code === 'invalid_string') {
    const validation = typeof issue.validation === 'string' ? issue.validation : '';
    return STRING_RULE_TO_KEY[validation] ?? 'validation.invalidFormat';
  }
  return ISSUE_TO_KEY[issue.code] ?? 'validation.invalidFormat';
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload', undefined, {
      fields: result.error.issues.map((issue) => {
        const messageKey = keyOf(issue);
        return {
          path: issue.path.join('.'),
          rule: issue.code,
          messageKey,
          message: translate(DEFAULT_LOCALE, messageKey),
        };
      }),
    });
  }
  return result.data as z.infer<T>;
}

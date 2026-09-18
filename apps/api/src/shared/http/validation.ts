/**
 * Kiểm dữ liệu vào bằng zod, lỗi quy về VALIDATION_ERROR kèm danh sách trường sai.
 *
 * Schema zod ở tầng HTTP chỉ kiểm HÌNH DẠNG (kiểu, bắt buộc, định dạng). Luật nghiệp vụ — kỳ hạn
 * chồng lấn, slot đang có hợp đồng — thuộc về service và trả mã nghiệp vụ cụ thể.
 */

import type { z } from 'zod';
import { AppError } from '../errors/index.js';

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Dữ liệu gửi lên không hợp lệ', {
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data as z.infer<T>;
}

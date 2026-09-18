/**
 * Lỗi nghiệp vụ duy nhất được phép ném trong apps/api.
 *
 * `code` có kiểu `ErrorCode` sinh từ spec/errors.md, nên `new AppError('MA_KHONG_CO')` là lỗi biên
 * dịch. HTTP status lấy theo đúng bảng trong đặc tả — người ném không tự chọn status.
 */

import { ERROR_CODES, type ErrorCode } from './codes.generated.js';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    // Mã do thiết bị trả về (nhóm "Lệnh xịt") không có HTTP status; nếu lọt ra tới tầng HTTP thì
    // coi là lỗi hệ thống thay vì đoán một status.
    this.httpStatus = ERROR_CODES[code] ?? 500;
    this.details = details;
  }
}

/**
 * FR-AUTH-08 AC2: người dùng thuộc thương hiệu không được phân biệt được "tài nguyên của thương
 * hiệu khác" với "tài nguyên không tồn tại". Cả hai phải cùng trả FORBIDDEN_SCOPE.
 *
 * Dùng hàm này ở MỌI chỗ tra một tài nguyên theo id rồi không thấy — đừng tự chọn giữa 403 và 404.
 */
export function notFoundFor(principal: { brandId: string | null }): AppError {
  return principal.brandId === null
    ? new AppError('NOT_FOUND')
    : new AppError('FORBIDDEN_SCOPE', 'Tài nguyên ngoài phạm vi slot của thương hiệu');
}

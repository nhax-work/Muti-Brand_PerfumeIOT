/**
 * Lỗi nghiệp vụ duy nhất được phép ném trong apps/api.
 *
 * `code` có kiểu `ErrorCode` sinh từ spec/errors.md, nên `new AppError('MA_KHONG_CO')` là lỗi biên
 * dịch. HTTP status lấy theo đúng bảng trong đặc tả — người ném không tự chọn status.
 *
 * `messageKey` BẮT BUỘC và phải là khóa trong `@scentstation/i18n`; không có đường truyền một chuỗi
 * viết tay vào đây. Đó là cách quy tắc song ngữ (spec/PROJECT.md Mục 3) được cưỡng chế bằng hệ
 * thống kiểu thay vì bằng lời nhắc trong tài liệu — thứ mà 12 module còn lại chắc chắn sẽ quên.
 *
 * `message` luôn là tiếng Việt: contract bắt buộc trường này (openapi.yaml, schema `Error`) và
 * NFR-USA-03 đòi nó đọc được. Client muốn ngôn ngữ khác thì tra `details.messageKey` trong catalog
 * của mình — xem `ApiExceptionFilter`.
 */

import {
  DEFAULT_LOCALE,
  translate,
  type MessageKey,
  type MessageParams,
} from '@scentstation/i18n';
import { ERROR_CODES, type ErrorCode } from './codes.generated.js';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly messageKey: MessageKey;
  readonly messageParams: MessageParams | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    messageKey: MessageKey,
    params?: MessageParams,
    details?: Record<string, unknown>,
  ) {
    super(translate(DEFAULT_LOCALE, messageKey, params));
    this.name = 'AppError';
    this.code = code;
    this.messageKey = messageKey;
    this.messageParams = params;
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
    ? new AppError('NOT_FOUND', 'common.notFound')
    : new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
}

/**
 * Lỗi kiểm dữ liệu gắn vào đúng một trường.
 *
 * Gom về đây thay vì để mỗi service tự viết: trước đó `usr.service.ts` và `mch.service.ts` có hai
 * bản `invalidField` giống hệt nhau, và cả hai đều lặp chuỗi hai lần (mức yêu cầu + mức trường).
 * `messageKey` đi kèm từng trường để client dịch được cả phần chi tiết, không chỉ phần tiêu đề.
 */
export function invalidField(
  path: string,
  messageKey: MessageKey,
  params?: MessageParams,
): AppError {
  return new AppError('VALIDATION_ERROR', messageKey, params, {
    fields: [
      {
        path,
        rule: 'custom',
        messageKey,
        ...(params ? { messageParams: params } : {}),
        message: translate(DEFAULT_LOCALE, messageKey, params),
      },
    ],
  });
}

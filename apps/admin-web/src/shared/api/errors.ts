import type { ApiError } from '@scentstation/contracts';
import { isMessageKey, type MessageParams } from '@scentstation/i18n';
import type { Translate } from '@/shared/i18n';

/**
 * Lỗi của mọi lời gọi API trong app. `status = 0` nghĩa là không tới được máy chủ.
 *
 * Giữ nguyên thân lỗi thay vì chuỗi đã dịch, để khi người dùng đổi ngôn ngữ thì thông báo đang
 * hiện cũng đổi theo.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.message ?? `HTTP ${status}`);
    this.name = 'ApiRequestError';
  }

  get code(): string | null {
    return this.body?.code ?? null;
  }
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).message === 'string'
  );
}

function isMessageParams(value: unknown): value is MessageParams {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'string' || typeof v === 'number')
  );
}

/**
 * Đợi một lời gọi `api.GET/POST/...` và trả `data`, hoặc ném `ApiRequestError`.
 *
 * openapi-fetch trả `{ data, error }` chứ không ném; TanStack Query lại cần lỗi được ném ra để vào
 * trạng thái `error`. Hàm này là cầu nối duy nhất giữa hai quy ước đó.
 */
export async function unwrap<D>(
  request: Promise<{ data?: D; error?: unknown; response: Response }>,
): Promise<D> {
  let result: Awaited<typeof request>;
  try {
    result = await request;
  } catch {
    throw new ApiRequestError(0, null);
  }
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiRequestError(
      result.response.status,
      isApiError(result.error) ? result.error : null,
    );
  }
  return result.data as D;
}

/**
 * Chuỗi hiển thị cho một lỗi, theo thứ tự ADR-0003: `details.messageKey` tra catalog ngôn ngữ
 * đang chọn → không có khóa thì dùng `message` của máy chủ → không có gì thì lỗi chung.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('ui.networkError');
    const details = error.body?.details;
    const key = details?.messageKey;
    if (isMessageKey(key)) {
      const params = details?.messageParams;
      return t(key, isMessageParams(params) ? params : undefined);
    }
    if (error.body?.message) return error.body.message;
  }
  return t('common.internalError');
}

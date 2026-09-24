import { translate, type MessageKey, type MessageParams } from '@scentstation/i18n';
import { describe, expect, it } from 'vitest';
import { ApiRequestError, errorMessage, unwrap } from './errors';

const tVi = (key: MessageKey, params?: MessageParams) => translate('vi', key, params);
const tEn = (key: MessageKey, params?: MessageParams) => translate('en', key, params);

function response(status: number): Response {
  return new Response(null, { status });
}

describe('errorMessage', () => {
  it('dịch theo details.messageKey, kèm tham số, theo ngôn ngữ đang chọn', () => {
    const error = new ApiRequestError(409, {
      code: 'VALIDATION_ERROR',
      message: 'Số serial "M001" đã tồn tại',
      details: { messageKey: 'mch.serialTaken', messageParams: { serialNumber: 'M001' } },
    });

    expect(errorMessage(error, tEn)).toBe('Serial number "M001" already exists');
    expect(errorMessage(error, tVi)).toContain('M001');
  });

  it('khóa không có trong catalog thì rơi về message của máy chủ', () => {
    const error = new ApiRequestError(400, {
      code: 'VALIDATION_ERROR',
      message: 'Thông điệp từ máy chủ',
      details: { messageKey: 'khong.tonTai' },
    });

    expect(errorMessage(error, tEn)).toBe('Thông điệp từ máy chủ');
  });

  it('không tới được máy chủ thì báo lỗi mạng', () => {
    expect(errorMessage(new ApiRequestError(0, null), tEn)).toBe(tEn('ui.networkError'));
  });

  it('lỗi không phải từ API thì báo lỗi chung', () => {
    expect(errorMessage(new TypeError('boom'), tEn)).toBe(tEn('common.internalError'));
  });
});

describe('unwrap', () => {
  it('trả data khi thành công', async () => {
    await expect(
      unwrap(Promise.resolve({ data: { ok: 1 }, response: response(200) })),
    ).resolves.toEqual({
      ok: 1,
    });
  });

  it('ném ApiRequestError mang status và thân lỗi', async () => {
    const body = { code: 'NOT_FOUND', message: 'Không tìm thấy' };
    const error = await unwrap(Promise.resolve({ error: body, response: response(404) })).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(404);
    expect((error as ApiRequestError).code).toBe('NOT_FOUND');
  });

  it('fetch bị từ chối (mất mạng) thành status 0', async () => {
    const error = await unwrap(Promise.reject(new TypeError('Failed to fetch'))).catch(
      (e: unknown) => e,
    );

    expect((error as ApiRequestError).status).toBe(0);
  });
});

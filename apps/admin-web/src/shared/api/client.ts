import type { paths, TokenPair } from '@scentstation/contracts';
import createClient from 'openapi-fetch';
import { sessionStore } from '@/shared/auth/session';
import { config } from '@/shared/config';

/** Các endpoint tự lo xác thực; 401 ở đây là kết quả thật, không phải tín hiệu để refresh. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/reauth'];

let refreshing: Promise<boolean> | null = null;

/**
 * Đổi refresh token lấy cặp token mới. Nhiều request cùng dính 401 thì dùng chung MỘT lần refresh
 * — refresh token bị xoay vòng sau mỗi lần dùng, gọi song song thì lần thứ hai chắc chắn hỏng.
 */
export function refreshSession(): Promise<boolean> {
  const refreshToken = sessionStore.get()?.refreshToken ?? sessionStore.savedRefreshToken();
  if (!refreshToken) return Promise.resolve(false);

  refreshing ??= fetch(`${config.apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        sessionStore.clear();
        return false;
      }
      sessionStore.set((await response.json()) as TokenPair);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function withBearer(request: Request): Request {
  const token = sessionStore.get()?.accessToken;
  const next = new Request(request);
  if (token) next.headers.set('Authorization', `Bearer ${token}`);
  return next;
}

async function authFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const response = await fetch(withBearer(request));

  const path = new URL(request.url).pathname;
  if (response.status !== 401 || NO_REFRESH_PATHS.some((p) => path.endsWith(p))) {
    return response;
  }
  return (await refreshSession()) ? fetch(withBearer(retry)) : response;
}

/**
 * Client API duy nhất của web quản trị. Đường dẫn, tham số và kiểu trả về đều suy từ
 * `spec/contracts/openapi.yaml` qua `@scentstation/contracts` — không tự khai báo DTO.
 *
 *   const machines = await unwrap(api.GET('/machines', { params: { query: { page: 1 } } }));
 */
export const api = createClient<paths>({ baseUrl: config.apiBaseUrl, fetch: authFetch });

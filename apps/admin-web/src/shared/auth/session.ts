import type { CurrentUser, TokenPair } from '@scentstation/contracts';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: CurrentUser;
}

/**
 * Kho phiên đăng nhập, sống ngoài React để API client đọc được mà không cần hook.
 *
 * Access token chỉ giữ trong bộ nhớ. Refresh token giữ ở `sessionStorage` để F5 không bắt đăng
 * nhập lại — đổi lại nó đọc được bằng JavaScript, nên một lỗ XSS lấy được refresh token. Contract
 * trả refresh token trong thân phản hồi (`TokenPair`), không qua cookie httpOnly; muốn chặt hơn thì
 * phải đổi contract qua ADR. `sessionStorage` (không phải `localStorage`) để đóng tab là hết phiên.
 */
const REFRESH_KEY = 'scentstation.admin.refreshToken';

let current: Session | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const sessionStore = {
  get(): Session | null {
    return current;
  },

  savedRefreshToken(): string | null {
    try {
      return sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },

  set(pair: TokenPair): void {
    current = { accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: pair.user };
    try {
      sessionStorage.setItem(REFRESH_KEY, pair.refreshToken);
    } catch {
      // Không lưu được thì chỉ mất khả năng giữ phiên qua F5.
    }
    emit();
  },

  clear(): void {
    current = null;
    try {
      sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      // như trên
    }
    emit();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

import { createContext } from 'react';

/**
 * Mở hộp nhập lại mật khẩu, trả `reauthToken` để gắn vào header `X-Reauth-Token` (FR-AUTH-09).
 * Người dùng bấm Hủy thì promise bị từ chối với `ReauthCancelled`.
 */
export type RequestReauth = () => Promise<string>;

export class ReauthCancelled extends Error {
  constructor() {
    super('Người dùng hủy xác thực lại');
    this.name = 'ReauthCancelled';
  }
}

export const ReauthContext = createContext<RequestReauth | null>(null);

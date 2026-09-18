/**
 * Dựng TokenService từ cấu hình. Tách thành provider riêng vì TokenService nhận giá trị (bí mật,
 * TTL) chứ không nhận phụ thuộc Nest, nên không đánh dấu @Injectable được.
 */

import type { Provider } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { TokenService } from './tokens.js';

const SECONDS_PER_MINUTE = 60;

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export const tokenServiceProvider: Provider = {
  provide: TOKEN_SERVICE,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) =>
    new TokenService(
      config.jwtSecret,
      config.constraint('ACCESS_TOKEN_TTL_MIN') * SECONDS_PER_MINUTE,
      config.constraint('REAUTH_TOKEN_TTL_SEC'),
    ),
};

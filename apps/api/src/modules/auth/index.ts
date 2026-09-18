/**
 * Mặt tiền của module auth. Module khác CHỈ import từ file này (QT3, ADR-0003).
 */
export { AuthModule } from './auth.module.js';
export { AuthService } from './auth.service.js';
export type { AuthenticatedUser } from './principal.loader.js';
export {
  Public,
  RequirePermissions,
  RequireReauth,
  CurrentUser,
  CurrentBrandScope,
} from './decorators.js';
export { hashPassword } from './password.js';

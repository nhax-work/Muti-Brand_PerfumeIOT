/**
 * Mặt tiền của chốt chặn cô lập dữ liệu. Module khác chỉ import từ đây (QT3, ADR-0003).
 */
export type { Principal, PrincipalScope } from './principal.js';
export { isBrandScoped, hasPermission } from './principal.js';
export type { BrandScope } from './brand-scope.js';
export {
  resolveBrandScope,
  brandScopedByColumn,
  brandScopedOrders,
  brandScopedBySlotAndTime,
  brandOccupiesSlotNow,
  OCCUPYING_RENTAL_STATUSES,
} from './brand-scope.js';

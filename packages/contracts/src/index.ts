/**
 * Mặt tiền của contract dùng chung cho apps/api, apps/admin-web và apps/kiosk (ADR-0003).
 *
 * `openapi.ts` SINH TỰ ĐỘNG từ `spec/contracts/openapi.yaml` bằng `npm run contracts:generate`.
 * Không sửa tay file đó. Muốn đổi kiểu thì sửa contract — và vì contract đã đóng băng, việc đó
 * cần ADR (spec/contracts/README.md).
 *
 * Chiều sinh là contract-first: openapi.yaml -> TypeScript, không bao giờ ngược lại (ADR-0003).
 *
 * Gói này CHỈ CHỨA KIỂU, không có mã chạy. Nhờ vậy ba ứng dụng dùng chung qua path mapping mà
 * không cần bước build riêng. Hằng số thuộc về ứng dụng, không thuộc về contract.
 */

import type { components, operations, paths } from './openapi.js';

export type { components, operations, paths };

/** Mọi schema khai báo trong openapi.yaml. */
export type Schemas = components['schemas'];

/** Lấy nhanh một schema: `Schema<'CurrentUser'>`. */
export type Schema<K extends keyof Schemas> = Schemas[K];

// --- Kiểu dùng thường xuyên, đặt tên ngắn cho dễ đọc ---------------------------------

export type RoleCode = Schemas['RoleCode'];
export type CurrentUser = Schemas['CurrentUser'];
export type LoginRequest = Schemas['LoginRequest'];
export type TokenPair = Schemas['TokenPair'];
export type ReauthRequest = Schemas['ReauthRequest'];
export type ReauthResponse = Schemas['ReauthResponse'];
export type ApiError = Schemas['Error'];
export type PageMeta = Schemas['PageMeta'];
export type RevenueOwner = Schemas['RevenueOwner'];
export type SlotRentalStatus = Schemas['SlotRentalStatus'];
export type OrderStatus = Schemas['OrderStatus'];
export type CommandStatus = Schemas['CommandStatus'];

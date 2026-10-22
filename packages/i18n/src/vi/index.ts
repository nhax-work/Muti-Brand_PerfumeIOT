/**
 * Catalog tiếng Việt — NGUỒN SỰ THẬT của tập khóa.
 *
 * `packages/i18n/src/en/index.ts` khai báo `const en: typeof vi`, nên thiếu hay thừa một khóa ở bản
 * tiếng Anh là lỗi biên dịch chứ không phải lỗi phát hiện lúc chạy. Thêm khóa ở đây thì phải thêm
 * ở `en/` trong cùng commit (spec/PROJECT.md Mục 3).
 */

import { alr, notificationChannel, notificationStatus } from './alr.js';
import { auth } from './auth.js';
import { bnd } from './bnd.js';
import { actorType, credentialStatus, orderCode, revenueOwner, statusSource } from './codes.js';
import { common } from './common.js';
import { authenticityStatus, inv, refillSessionStatus, shipmentStatus } from './inv.js';
import { kiosk } from './kiosk.js';
import { machineOperatingMode, machineStatus, mch, slotRentalStatus, slotStatus } from './mch.js';
import { ord } from './ord.js';
import { prd } from './prd.js';
import { slt } from './slt.js';
import { ui } from './ui.js';
import { usr } from './usr.js';
import { validation } from './validation.js';

export const vi = {
  common,
  validation,
  auth,
  mch,
  alr,
  notificationStatus,
  notificationChannel,
  slotStatus,
  machineStatus,
  machineOperatingMode,
  slotRentalStatus,
  orderCode,
  actorType,
  revenueOwner,
  credentialStatus,
  statusSource,
  bnd,
  prd,
  slt,
  ord,
  usr,
  ui,
  kiosk,
  inv,
  shipmentStatus,
  authenticityStatus,
  refillSessionStatus,
} as const;

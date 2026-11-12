/**
 * Mặt tiền của module RFQ. Module khác CHỈ import từ file này (QT3, ADR-0003).
 */
export { RfqModule } from './rfq.module.js';
export { RfqService, canTransitionRefillRequest, type RefillRequest } from './rfq.service.js';

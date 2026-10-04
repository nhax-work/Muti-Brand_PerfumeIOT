/**
 * Mặt tiền của module ORD. Module khác CHỈ import từ file này (QT3, ADR-0003).
 */
export { OrdModule } from './ord.module.js';
export { OrdService, type OrderPaymentOutcome } from './ord.service.js';
export { canCreateDispenseCommand, canTransition, isTerminal } from './order-status.js';
export { revenueOwnerFor } from './revenue-owner.js';

// Thanh toán dùng chung (ADR-0008) — SLT dùng để tạo thanh toán phiên và nhận kết quả webhook.
export { PaymentModule } from './payment/payment.module.js';
export {
  PaymentService,
  type CreatePendingPaymentInput,
  type PaymentIntent,
} from './payment/payment.service.js';
export type { PaymentTarget } from './payment/payment.queries.js';
export { newPaymentReference, type PaymentReferencePrefix } from './payment/payment-reference.js';
export {
  RENTAL_CHECKOUT_PAYMENT_HANDLER,
  type CheckoutPaymentOutcome,
  type CheckoutPaymentSucceeded,
  type RentalCheckoutPaymentHandler,
} from './payment/rental-checkout-payment.port.js';

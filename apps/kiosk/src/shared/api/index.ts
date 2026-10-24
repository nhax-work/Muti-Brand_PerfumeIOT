export { useKioskCatalog, catalogQueryKey, type CatalogItem } from './catalog';

export { api } from './client';
export {
  ApiRequestError,
  errorMessage,
  isMachineBusy,
  isMachineInMaintenance,
  unwrap,
} from './errors';
export { recordKioskInteraction, type RecordInteractionParams } from './interactions';
export {
  cancelKioskOrder,
  cancelOrphanedOrder,
  forgetPendingOrder,
  isNotCancellable,
  rememberPendingOrder,
  isSettled,
  useCancelOrder,
  useCreateOrder,
  useOrderStatus,
  type CreateOrderParams,
  type OrderCreated,
  type OrderStatusView,
} from './orders';

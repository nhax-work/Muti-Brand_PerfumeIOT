import { useEffect, useRef, useState } from 'react';
import type { components } from '@scentstation/contracts';
import {
  cancelOrphanedOrder,
  forgetPendingOrder,
  isMachineBusy,
  isNotCancellable,
  rememberPendingOrder,
  useCancelOrder,
  useCreateOrder,
  useOrderStatus,
} from '@/shared/api';
import { config } from '@/shared/config';
import { useKioskSession } from '@/shared/session';
import { phaseOf, secondsUntil } from './checkout-phase';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

export type KioskOrderFlow = ReturnType<typeof useKioskOrderFlow>;

/** Rời luồng về đâu: danh mục (khách đổi ý, chọn mùi khác) hay màn chờ (lượt đã kết thúc). */
export type ExitTarget = 'catalog' | 'home';

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Vòng đời một đơn kiosk cho sản phẩm `item` (FR-ORD-08, 11, 16, 25, 33, ADR-0015): tạo đơn khi
 * khách đồng ý điều khoản, poll trạng thái, đếm theo hạn máy chủ trả, hủy đơn khi khách rời màn QR
 * hoặc mã hết hạn, và tự rời màn khi đơn đã kết thúc. Chỉ đọc trạng thái máy chủ trả — không tự suy
 * nghiệp vụ (QT5).
 *
 * @param onExit việc của màn hình khi khách rời luồng (đóng trang, điều hướng tới `to`). Đơn đang
 *   hiện đã được bỏ trước khi gọi.
 */
export function useKioskOrderFlow(item: KioskCatalogItem | null, onExit: (to: ExitTarget) => void) {
  const { kioskSessionId, setActiveOrder } = useKioskSession();

  // Khách đã đồng ý điều khoản bấm nút (FR-ORD-25) và đang ở màn mã QR.
  const [paying, setPaying] = useState(false);
  // Khách vừa bấm hủy khi đã có mã QR — đang hỏi lại trước khi bỏ đơn.
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const createOrder = useCreateOrder();
  const cancelOrder = useCancelOrder();
  const created = createOrder.data;
  // Theo dõi cả sau khi mã hết hạn, chừng nào màn thanh toán còn mở (xem useOrderStatus).
  const statusQuery = useOrderStatus(created?.order.id ?? null, { followLatePayment: paying });
  const view = statusQuery.data;

  // Báo cho khung kiosk biết đang có đơn: chỉ khi đó mới tắt tự về màn chờ, giữ màn giao dịch khi mất
  // kết nối, và hủy đơn nếu phiên bị reset (KioskShell, ADR-0015 mục 3). Tạo đơn lỗi thì không có
  // đơn — kiosk vẫn tự về màn chờ nếu khách bỏ đi.
  const activeOrderId = created?.order.id;
  const activeReference = created?.order.paymentReference;
  useEffect(() => {
    setActiveOrder(
      activeOrderId && activeReference
        ? { id: activeOrderId, paymentReference: activeReference }
        : null,
    );
  }, [activeOrderId, activeReference, setActiveOrder]);
  useEffect(() => () => setActiveOrder(null), [setActiveOrder]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const [prevStatus, setPrevStatus] = useState<string | null>(null);
  const [paidSince, setPaidSince] = useState<number | null>(null);
  const currentStatus = view?.status ?? null;
  if (currentStatus !== prevStatus) {
    setPrevStatus(currentStatus);
    setPaidSince(currentStatus === 'PAID' ? now : null);
  }

  const phase = phaseOf(view, paidSince === null ? 0 : now - paidSince);
  const isPostPayment = created !== undefined && phase !== 'PAYING' && phase !== 'EXPIRED';
  // Mở thẳng /checkout/:slot (vd. tải lại trang) vẫn phải qua màn chi tiết có điều khoản trước
  // (FR-ORD-25): chỉ khi khách bấm đồng ý thì mới mở mã QR.
  const paymentOpen = paying && item !== null;

  // Đếm theo hạn của chính đơn đang hiện (máy chủ trả), không đếm cục bộ — đơn mới thì hạn mới.
  const qrSecondsLeft = secondsUntil(created?.order.expiresAt, now);
  // Hết hạn: máy chủ đã báo EXPIRED, hoặc đồng hồ về 0 mà lần poll kế chưa tới. Từ lúc này không bao
  // giờ hiện mã QR nữa — khách không được quét một mã đã (hoặc sắp) bị hủy ở cổng (FR-ORD-16, 33).
  const qrExpired =
    created !== undefined &&
    (phase === 'EXPIRED' || (phase === 'PAYING' && qrSecondsLeft !== null && qrSecondsLeft <= 0));

  // Phiên trước bị cắt ngang (tải lại trang) khi còn mã QR → hủy đơn đó trước (ADR-0015 mục 3).
  useEffect(() => {
    void cancelOrphanedOrder();
  }, []);

  // Ghi nhớ đơn chỉ trong lúc nó còn chờ thanh toán — đã trả tiền hay đã kết thúc thì không hủy nữa.
  const pendingOrderId = created && phase === 'PAYING' ? created.order.id : null;
  useEffect(() => {
    if (pendingOrderId) rememberPendingOrder(pendingOrderId);
    else forgetPendingOrder();
  }, [pendingOrderId]);

  // Tự động gọi API tạo đơn khi khách đã đồng ý điều khoản. Lỗi thì DỪNG — không tự gọi lại: lỗi như
  // MACHINE_BUSY sẽ lặp lại ở mọi lần render sau, dội 409 liên tục vào máy chủ. Khách bấm "Thử lại".
  useEffect(() => {
    if (item && paymentOpen && !created && !createOrder.isPending && !createOrder.isError) {
      createOrder.mutate({ slotId: item.slotId, kioskSessionId, idempotencyKey });
    }
  }, [item, paymentOpen, created, createOrder, kioskSessionId, idempotencyKey]);

  // Máy đang bận với khách khác (chưa tạo được đơn): tự thử lại theo chu kỳ kiosk hỏi lại máy chủ
  // (HEARTBEAT_INTERVAL_SEC — thưa hơn hẳn ORDER_RATE_LIMIT_PER_MIN), được thì tự sang mã QR. Không
  // thử dồn dập: lỗi 409 lặp ở mọi lần render từng dội máy chủ (FR-ORD-35).
  const machineBusy = paymentOpen && isMachineBusy(createOrder.error);
  const retryCreate = () => {
    createOrder.reset();
    setIdempotencyKey(newIdempotencyKey());
  };
  // Hẹn giờ chỉ đặt lại khi trạng thái bận đổi — không đặt lại theo nhịp đồng hồ 500ms.
  const retryRef = useRef(retryCreate);
  useEffect(() => {
    retryRef.current = retryCreate;
  });
  useEffect(() => {
    if (!machineBusy) return;
    const timer = setTimeout(() => retryRef.current(), config.catalogPollMs);
    return () => clearTimeout(timer);
  }, [machineBusy]);

  const timeoutCancelledRef = useRef(false);
  useEffect(() => {
    if (!paymentOpen) {
      timeoutCancelledRef.current = false;
    }
  }, [paymentOpen]);

  useEffect(() => {
    if (
      created &&
      paymentOpen &&
      phase === 'PAYING' &&
      qrSecondsLeft !== null &&
      qrSecondsLeft <= 0 &&
      !timeoutCancelledRef.current
    ) {
      timeoutCancelledRef.current = true;
      cancelOrder.mutate(created.order.id);
    }
  }, [created, paymentOpen, phase, qrSecondsLeft, cancelOrder]);

  // Bỏ đơn đang hiện (nếu có). Đơn chưa trả tiền tự hết hạn phía máy chủ; khách chọn lại là đơn mới,
  // khoá idempotency mới — không bao giờ hiện lại mã QR/đồng hồ của sản phẩm trước.
  const discard = () => {
    setPaying(false);
    setConfirmingCancel(false);
    cancelOrder.reset();
    createOrder.reset();
    setPaidSince(null);
    setPrevStatus(null);
    setIdempotencyKey(newIdempotencyKey());
  };

  const exit = (to: ExitTarget = 'catalog') => {
    discard();
    onExit(to);
  };

  // Khách có thể đã chuyển khoản dù đang bấm hủy — đã có mã QR thì phải hỏi lại. Chưa có mã (đang
  // tạo đơn) thì khách chưa thể trả tiền, đóng luôn.
  const requestCancel = () => {
    // Mã đã hết hạn thì đơn đã (hoặc đang) bị hủy ở máy chủ — không còn gì để hỏi lại.
    if (created && !qrExpired) setConfirmingCancel(true);
    else exit(qrExpired ? 'home' : 'catalog');
  };

  // FR-ORD-33: hủy đơn ở máy chủ (máy chủ hủy luôn link ở cổng) rồi mới đóng. Cổng báo tiền đã/đang
  // về → ở lại màn QR, poll trạng thái sẽ đưa khách sang màn nhận lượt xịt. Lỗi khác (mất mạng…) →
  // vẫn đóng: khách đã quyết rời đi, và tiền nếu vẫn tới sẽ vào danh sách hoàn tiền.
  const confirmCancel = () => {
    if (!created) {
      exit();
      return;
    }
    cancelOrder.mutate(created.order.id, {
      onSuccess: () => exit(),
      onError: (error) => {
        if (isNotCancellable(error)) setConfirmingCancel(false);
        else exit();
      },
    });
  };

  const settled =
    created !== undefined && ['DISPENSED', 'FORFEITED', 'EXPIRED', 'PROBLEM'].includes(phase);

  // Luôn trỏ tới bản mới nhất để hẹn giờ không gọi closure cũ.
  const exitRef = useRef(exit);
  useEffect(() => {
    exitRef.current = exit;
  });

  // FR-ORD-26 AC3: hiện kết quả rồi về màn chờ sau KIOSK_IDLE_TIMEOUT_SEC. Đếm lại khi đổi pha: tiền
  // về muộn đưa màn "hết hạn" sang màn hoàn tiền — khách cần đủ thời gian quét QR khiếu nại.
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => exitRef.current('home'), config.idleTimeoutMs);
    return () => clearTimeout(timer);
  }, [settled, phase]);

  return {
    created,
    view,
    phase,
    now,
    paymentOpen,
    isPostPayment,
    qrSecondsLeft,
    qrExpired,
    confirmingCancel,
    createFailed: createOrder.isError,
    machineBusy,
    createError: createOrder.error,
    cancelError: cancelOrder.error,
    cancelPending: cancelOrder.isPending,
    /** Khách bấm đồng ý điều khoản (FR-ORD-25) → vào thẳng mã QR. */
    startPayment: () => setPaying(true),
    retryCreate,
    discard,
    exit,
    requestCancel,
    confirmCancel,
    dismissCancel: () => setConfirmingCancel(false),
  };
}

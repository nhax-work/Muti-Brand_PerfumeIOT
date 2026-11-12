/**
 * Cổng thanh toán — điểm nối DUY NHẤT giữa hệ thống và nhà cung cấp (mock, sandbox, thật).
 *
 * Đơn kiosk (ORD) và phiên thuê slot (SLT, ADR-0008) cùng đi qua đây: tạo thanh toán thì gọi
 * `createPayment`, kết quả về qua webhook thì `verifyWebhook`. Thêm cổng mới chỉ là thêm một lớp
 * hiện thực interface này và đăng ký vào `PaymentGatewayRegistry` (NFR-SCA-03) — PayOS: ADR-0016.
 */

/** Yêu cầu tạo một thanh toán ở cổng. */
export interface CreatePaymentRequest {
  /**
   * Mã tham chiếu gửi cổng; cổng gửi lại trong webhook. Duy nhất theo provider — lưu vào
   * `payments.provider_reference` (uq_payment_provider_reference, ADR-0009).
   */
  readonly reference: string;
  /** Chuỗi `Money`, ví dụ `'35000.0000'`. */
  readonly amount: string;
  readonly currency: string;
  /** Sau mốc này cổng nên từ chối thanh toán — hạn đơn hoặc hạn giữ chỗ của phiên. */
  readonly expiresAt: Date;
  /** Nội dung chuyển khoản / mô tả hiện trên app ngân hàng. */
  readonly description: string;
  /** URL chuyển hướng khi thanh toán thành công (nếu cổng hỗ trợ). */
  readonly returnUrl?: string;
  /** URL chuyển hướng khi hủy thanh toán (nếu cổng hỗ trợ). */
  readonly cancelUrl?: string;
}

export interface CreatedPayment {
  /**
   * Mã cổng sẽ gửi lại trong webhook, nếu cổng tự đặt mã (PayOS: `orderCode` số nguyên, ADR-0016).
   * Có thì lưu vào `payments.provider_reference` thay cho `request.reference`.
   */
  readonly providerReference?: string;
  /** Nội dung mã QR (FR-ORD-08). */
  readonly qrPayload: string;
  /** Trang thanh toán của cổng, nếu cổng có (web quản trị dùng cho phiên thuê slot). */
  readonly checkoutUrl: string | null;
  /**
   * Phản hồi của cổng, lưu vào `payments.raw_response` để lần gọi lại (Idempotency-Key, bấm thanh
   * toán lần hai) trả đúng QR cũ thay vì tạo thanh toán mới. KHÔNG chứa dữ liệu thẻ (NFR-DAT-04).
   */
  readonly raw: Record<string, unknown>;
}

/** Hủy một thanh toán còn chờ ở cổng — khách hủy trên kiosk (ADR-0015 mục 3). */
export interface CancelPaymentRequest {
  /** `payments.provider_reference` — mã cổng đã nhận lúc tạo. */
  readonly providerReference: string;
  /** Lý do gửi cổng, chỉ để đối soát. */
  readonly reason: string;
}

export type CancelPaymentResult =
  /** Cổng không nhận tiền cho mã này nữa — vừa hủy, hoặc đã hủy/hết hạn từ trước. */
  | { readonly kind: 'CANCELLED' }
  /** Cổng đã (hoặc đang) ghi nhận tiền — không được hủy; webhook sẽ báo về như thường. */
  | { readonly kind: 'ALREADY_PAID' };

/** Sự kiện webhook đã qua kiểm chữ ký và kiểm hình dạng. */
export interface VerifiedPaymentEvent {
  /** Khóa chống trùng — `payment_events.provider_event_id` (uq_payment_event, FR-ORD-15). */
  readonly eventId: string;
  /** Mã tham chiếu đã gửi lúc `createPayment`. */
  readonly reference: string;
  readonly transactionId: string;
  readonly status: 'SUCCEEDED' | 'FAILED';
  readonly amount: string;
  readonly currency: string;
  /** Thời điểm cổng ghi nhận giao dịch (không phải lúc webhook tới). */
  readonly occurredAt: Date;
}

export type WebhookVerification =
  | { readonly kind: 'VERIFIED'; readonly event: VerifiedPaymentEvent; readonly payload: unknown }
  /** Chữ ký sai hoặc thiếu (FR-ORD-13 AC2). `payload` để lưu lại rà soát bảo mật. */
  | { readonly kind: 'INVALID_SIGNATURE'; readonly payload: unknown }
  /** Không đọc được JSON, hoặc đúng chữ ký nhưng thiếu trường (FR-ORD-12 AC2). */
  | { readonly kind: 'MALFORMED'; readonly payload: unknown; readonly reason: string };

export type WebhookHeaders = Readonly<Record<string, string | string[] | undefined>>;

export interface PaymentGateway {
  /** Tên trong đường dẫn `POST /webhooks/payments/{provider}` và cột `payments.provider`. */
  readonly provider: string;
  createPayment(request: CreatePaymentRequest): Promise<CreatedPayment>;
  /**
   * Hủy thanh toán còn chờ để khách không trả được nữa. Ném lỗi khi không hỏi được cổng (mạng,
   * cổng trả lời lạ) — người gọi tự quyết có hủy phía hệ thống hay không.
   */
  cancelPayment(request: CancelPaymentRequest): Promise<CancelPaymentResult>;
  /** Phải kiểm chữ ký trên đúng các byte nhận được, không trên JSON đã parse rồi serialize lại. */
  verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): WebhookVerification;
}

/** Token DI của `PaymentGatewayRegistry`. */
export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');

export class PaymentGatewayRegistry {
  private readonly byProvider: ReadonlyMap<string, PaymentGateway>;

  constructor(
    gateways: readonly PaymentGateway[],
    private readonly activeProvider: string,
  ) {
    this.byProvider = new Map(gateways.map((g) => [g.provider, g]));
    if (!this.byProvider.has(activeProvider)) {
      throw new Error(
        `PAYMENT_PROVIDER=${activeProvider} chưa có hiện thực. Có: ${[...this.byProvider.keys()].join(', ')}`,
      );
    }
  }

  /** Cổng dùng để TẠO thanh toán mới (PAYMENT_PROVIDER). */
  current(): PaymentGateway {
    return this.byProvider.get(this.activeProvider) as PaymentGateway;
  }

  /**
   * Cổng nhận webhook theo tên trong URL. Không chỉ cổng hiện tại: đổi PAYMENT_PROVIDER lúc còn
   * thanh toán dở của cổng cũ thì webhook của cổng cũ vẫn phải xử lý được.
   */
  get(provider: string): PaymentGateway | null {
    return this.byProvider.get(provider) ?? null;
  }
}

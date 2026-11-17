/**
 * Cổng gửi email cho khách về phiếu khiếu nại (FR-ORD-37, ADR-0031).
 *
 * Gửi thẳng qua EMAIL_PROVIDER, KHÔNG qua bảng `notifications`: địa chỉ email của khách chỉ được
 * nằm trong khối liên hệ mã hóa của phiếu (ADR-0012 quy tắc 1, 2). Nội dung chỉ có mã khiếu nại,
 * số tiền, trạng thái chung và liên kết tra cứu — không có tài khoản ngân hàng, lý do từ chối hay
 * mã giao dịch.
 *
 * Tách interface như `PasswordResetSender` để test lấy được nội dung thư mà không cần SMTP.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { translate, type Locale } from '@scentstation/i18n';
import { EMAIL_PROVIDER, type EmailProvider } from '../../../adapters/email/index.js';

export type ClaimOutcome = 'REFUNDED' | 'REJECTED' | 'EXPIRED';

export interface ClaimReceiptEmail {
  readonly to: string;
  readonly locale: Locale;
  readonly code: string;
  readonly amount: string;
  readonly currency: string;
  readonly deadline: string;
  readonly link: string;
}

export interface ClaimClosedEmail {
  readonly to: string;
  readonly locale: Locale;
  readonly code: string;
  readonly outcome: ClaimOutcome;
  readonly link: string;
}

export interface RefundClaimMailer {
  /** @returns true nếu dịch vụ email nhận thư; không bao giờ ném. */
  sendReceipt(email: ClaimReceiptEmail): Promise<boolean>;
  sendClosed(email: ClaimClosedEmail): Promise<boolean>;
}

export const REFUND_CLAIM_MAILER = Symbol('REFUND_CLAIM_MAILER');

const OUTCOME_KEY = {
  REFUNDED: 'ord.claimOutcomeRefunded',
  REJECTED: 'ord.claimOutcomeRejected',
  EXPIRED: 'ord.claimOutcomeExpired',
} as const;

@Injectable()
export class DefaultRefundClaimMailer implements RefundClaimMailer {
  private readonly logger = new Logger('ORD/claim-mailer');

  constructor(
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider?: EmailProvider,
  ) {}

  sendReceipt(email: ClaimReceiptEmail): Promise<boolean> {
    const params = {
      code: email.code,
      amount: email.amount,
      currency: email.currency,
      deadline: email.deadline,
      link: email.link,
    };
    return this.send(email.to, email.code, {
      subject: translate(email.locale, 'ord.claimReceiptEmailSubject', params),
      text: translate(email.locale, 'ord.claimReceiptEmailBody', params),
    });
  }

  sendClosed(email: ClaimClosedEmail): Promise<boolean> {
    const params = {
      code: email.code,
      outcome: translate(email.locale, OUTCOME_KEY[email.outcome]),
      link: email.link,
    };
    return this.send(email.to, email.code, {
      subject: translate(email.locale, 'ord.claimClosedEmailSubject', params),
      text: translate(email.locale, 'ord.claimClosedEmailBody', params),
    });
  }

  /** Log chỉ ghi mã khiếu nại, không ghi địa chỉ email (ADR-0031 mục 4). */
  private async send(
    to: string,
    code: string,
    message: { subject: string; text: string },
  ): Promise<boolean> {
    if (!this.emailProvider) return false;
    try {
      const result = await this.emailProvider.send({ to, ...message });
      if (!result.success)
        this.logger.warn(`Gửi email khiếu nại ${code} thất bại: ${result.error}`);
      return result.success;
    } catch (err: unknown) {
      this.logger.warn(
        `Ngoại lệ khi gửi email khiếu nại ${code}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}

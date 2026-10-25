/**
 * Cấu hình của apps/api.
 *
 * Hai nguồn, thứ tự ưu tiên rõ ràng:
 *   1. Ngưỡng nghiệp vụ lấy từ SPEC_CONSTRAINTS (sinh từ spec/constraints.md). Biến môi trường
 *      cùng tên được phép GHI ĐÈ — hữu ích khi test, ví dụ rút ACCESS_TOKEN_TTL_MIN xuống 1 —
 *      nhưng không bắt buộc. Nhờ vậy .env không phải liệt kê lại 29 hằng.
 *   2. Bí mật và địa chỉ hạ tầng (DATABASE_URL, JWT_SECRET) chỉ có trong môi trường, không bao giờ
 *      có giá trị mặc định trong mã (NFR-SEC-05).
 *
 * Không hardcode ngưỡng ở đâu khác trong apps/api — luôn đọc qua `constraint()` (spec/PROJECT.md Mục 3).
 */

import { SPEC_CONSTRAINTS, type ConstraintName } from './constraints.generated.js';

type ConstraintValue<K extends ConstraintName> = (typeof SPEC_CONSTRAINTS)[K];

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  /** Cổng thanh toán dùng cho đơn và phiên thuê slot mới, ví dụ `mock` (PAYMENT_PROVIDER). */
  readonly paymentProvider: string;
  /**
   * Bí mật xác minh chữ ký webhook (PAYMENT_WEBHOOK_SECRET, FR-ORD-13). `null` khi chưa cấu hình ở
   * máy dev: API vẫn chạy, nhưng mọi webhook bị từ chối vì không kiểm được chữ ký.
   */
  readonly paymentWebhookSecret: string | null;
  /**
   * Thông tin kênh thanh toán PayOS (ADR-0016). `null` khi chưa cấu hình — cổng PayOS không được
   * đăng ký. `PAYMENT_PROVIDER=payos` mà thiếu thì API không khởi động.
   */
  readonly payos: PayosConfig | null;
  /**
   * Địa chỉ broker MQTT (MQTT_URL), ví dụ `mqtt://localhost:1883`. `null` thì cửa vào MQTT và vòng
   * điều phối lệnh xịt không chạy — API vẫn phục vụ HTTP bình thường (test tích hợp chạy kiểu này).
   */
  readonly mqttUrl: string | null;
  /**
   * Khóa riêng Ed25519 dạng PEM để ký lệnh xịt (DISPENSE_SIGNING_KEY, FR-DSP-04). `null` khi chưa
   * cấu hình ở máy dev: lệnh mang chữ ký giả `dev-unsigned`, firmware phải bật
   * `DEV_ALLOW_UNSIGNED_COMMANDS`. Production bắt buộc có.
   */
  readonly dispenseSigningKey: string | null;
  /**
   * Bật Swagger UI tại `/api/docs` (SWAGGER_ENABLED). Mặc định bật ở development/test, tắt ở
   * production — tài liệu liệt kê toàn bộ bề mặt API, không công khai ở môi trường thật trừ khi
   * chủ động bật.
   */
  readonly swaggerEnabled: boolean;
  /**
   * Khóa AES-256 (32 byte, base64) mã hóa tài khoản nhận hoàn tiền và liên hệ trong phiếu khiếu nại
   * (REFUND_ACCOUNT_ENC_KEY, ADR-0012, NFR-DAT-04). `null` khi chưa cấu hình ở máy dev: tính năng
   * khiếu nại tắt (kiosk không hiện QR sự cố). Production bắt buộc có.
   */
  readonly refundAccountEncKey: Buffer | null;
  /**
   * Bí mật ký mã khiếu nại dùng một lần trên QR sự cố (REFUND_CLAIM_TOKEN_SECRET, ADR-0012). Cùng
   * quy tắc với khóa trên: thiếu ở dev thì tính năng tắt, production bắt buộc có.
   */
  readonly refundClaimTokenSecret: string | null;
  /**
   * Địa chỉ URL cơ sở của ứng dụng web quản trị (ADMIN_WEB_BASE_URL). Mặc định http://localhost:5173.
   */
  readonly adminWebBaseUrl: string;
  /**
   * Cờ dev in link xác minh email ra console (DEV_LOG_EMAIL_VERIFICATION_TOKEN). Mặc định TẮT.
   * Cấm bật ở production.
   */
  readonly devLogEmailVerificationToken: boolean;
  /** Cấu hình máy chủ gửi thư SMTP thật (FR-USR-07, FR-ALR-16). `null` khi chạy ở chế độ console log. */
  readonly smtp: SmtpConfig | null;
  constraint<K extends ConstraintName>(name: K): ConstraintValue<K>;
}

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string | null;
  readonly pass: string | null;
  readonly from: string;
}

export interface PayosConfig {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly apiKey: string;
  /** Khóa checksum: ký yêu cầu tạo link và kiểm chữ ký webhook. */
  readonly checksumKey: string;
  readonly returnUrl: string;
  readonly cancelUrl: string;
}

const PLACEHOLDER_SECRET = 'doi_gia_tri_nay';
const PAYOS_DEFAULT_BASE_URL = 'https://api-merchant.payos.vn';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = (env['APP_ENV'] ?? 'development') as AppConfig['env'];

  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('Thiếu DATABASE_URL. Sao chép .env.example thành .env.');
  }

  const jwtSecret = env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('Thiếu JWT_SECRET. Không có giá trị mặc định cho bí mật (NFR-SEC-05).');
  }
  if (appEnv === 'production') {
    if (jwtSecret === PLACEHOLDER_SECRET || jwtSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET ở production phải khác giá trị mẫu và dài tối thiểu ${MIN_PRODUCTION_SECRET_LENGTH} ký tự.`,
      );
    }
  }

  const paymentProvider = env['PAYMENT_PROVIDER'] || 'mock';
  const paymentWebhookSecret = env['PAYMENT_WEBHOOK_SECRET'] || null;
  const payos = loadPayosConfig(env);
  if (paymentProvider === 'payos' && !payos) {
    throw new Error(
      'PAYMENT_PROVIDER=payos cần đủ PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY, PAYOS_RETURN_URL, PAYOS_CANCEL_URL (ADR-0016).',
    );
  }
  if (appEnv === 'production') {
    if (paymentProvider === 'mock') {
      throw new Error(
        'PAYMENT_PROVIDER=mock không được dùng ở production — ai cũng tự ký được webhook.',
      );
    }
    // PayOS ký webhook bằng khóa checksum riêng; PAYMENT_WEBHOOK_SECRET chỉ dành cho cổng khác.
    if (
      paymentProvider !== 'payos' &&
      (!paymentWebhookSecret ||
        paymentWebhookSecret === PLACEHOLDER_SECRET ||
        paymentWebhookSecret.length < MIN_PRODUCTION_SECRET_LENGTH)
    ) {
      throw new Error(
        `PAYMENT_WEBHOOK_SECRET ở production phải có, khác giá trị mẫu và dài tối thiểu ${MIN_PRODUCTION_SECRET_LENGTH} ký tự.`,
      );
    }
  }

  const mqttUrl = env['MQTT_URL'] || null;
  const rawSigningKey = env['DISPENSE_SIGNING_KEY'];
  const dispenseSigningKey =
    rawSigningKey && rawSigningKey !== PLACEHOLDER_SECRET ? rawSigningKey : null;
  if (appEnv === 'production' && !dispenseSigningKey) {
    throw new Error(
      'DISPENSE_SIGNING_KEY ở production phải là khóa riêng Ed25519 dạng PEM (FR-DSP-04).',
    );
  }
  const rawSwagger = env['SWAGGER_ENABLED'];
  if (rawSwagger !== undefined && rawSwagger !== '' && !['true', 'false'].includes(rawSwagger)) {
    throw new Error(`SWAGGER_ENABLED phải là true hoặc false, nhận được: ${rawSwagger}`);
  }
  const swaggerEnabled =
    rawSwagger === 'true' || ((rawSwagger ?? '') === '' && appEnv !== 'production');

  const refundAccountEncKey = parseAesKey(env['REFUND_ACCOUNT_ENC_KEY']);
  const rawClaimSecret = env['REFUND_CLAIM_TOKEN_SECRET'];
  const refundClaimTokenSecret =
    rawClaimSecret && rawClaimSecret !== PLACEHOLDER_SECRET ? rawClaimSecret : null;
  if (appEnv === 'production') {
    if (!refundAccountEncKey) {
      throw new Error(
        'REFUND_ACCOUNT_ENC_KEY ở production phải là khóa AES-256 32 byte dạng base64 (ADR-0012).',
      );
    }
    if (!refundClaimTokenSecret || refundClaimTokenSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `REFUND_CLAIM_TOKEN_SECRET ở production phải có và dài tối thiểu ${MIN_PRODUCTION_SECRET_LENGTH} ký tự.`,
      );
    }
  }

  const adminWebBaseUrl = env['ADMIN_WEB_BASE_URL'] || 'http://localhost:5173';
  const rawDevLogToken = env['DEV_LOG_EMAIL_VERIFICATION_TOKEN'];
  if (
    rawDevLogToken !== undefined &&
    rawDevLogToken !== '' &&
    !['true', 'false'].includes(rawDevLogToken)
  ) {
    throw new Error(
      `DEV_LOG_EMAIL_VERIFICATION_TOKEN phải là true hoặc false, nhận được: ${rawDevLogToken}`,
    );
  }
  const devLogEmailVerificationToken = rawDevLogToken === 'true';
  if (appEnv === 'production' && devLogEmailVerificationToken) {
    throw new Error(
      'DEV_LOG_EMAIL_VERIFICATION_TOKEN không được bật ở production (nguy cơ lộ token xác minh email).',
    );
  }

  const smtp = loadSmtpConfig(env);
  if (appEnv === 'production' && !smtp) {
    throw new Error(
      'SMTP_HOST ở production là bắt buộc — bằng chứng gửi email không được là bản ghi chỉ ghi log (FR-ALR-16, ADR-0017).',
    );
  }

  const overrides = new Map<ConstraintName, number | readonly number[]>();
  for (const name of Object.keys(SPEC_CONSTRAINTS) as ConstraintName[]) {
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    const parsed: unknown = JSON.parse(raw);
    const isNumberArray = Array.isArray(parsed) && parsed.every((v) => typeof v === 'number');
    if (typeof parsed !== 'number' && !isNumberArray) {
      throw new Error(`Biến môi trường ${name} phải là số hoặc mảng số, nhận được: ${raw}`);
    }
    overrides.set(name, parsed as number | number[]);
  }

  return {
    env: appEnv,
    port: Number(env['PORT'] ?? 3000),
    databaseUrl,
    jwtSecret,
    paymentProvider,
    paymentWebhookSecret,
    payos,
    mqttUrl,
    dispenseSigningKey,
    swaggerEnabled,
    refundAccountEncKey,
    refundClaimTokenSecret,
    adminWebBaseUrl,
    devLogEmailVerificationToken,
    smtp,
    constraint<K extends ConstraintName>(name: K): ConstraintValue<K> {
      return (overrides.get(name) ?? SPEC_CONSTRAINTS[name]) as ConstraintValue<K>;
    },
  };
}

/** Tải cấu hình SMTP gửi email thật; thiếu SMTP_HOST hoặc SMTP_USER thì trả `null`. */
function loadSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig | null {
  const host = env['SMTP_HOST'];
  if (!host || host === PLACEHOLDER_SECRET) return null;
  const port = Number(env['SMTP_PORT'] ?? 587);
  const secure = env['SMTP_SECURE'] === 'true' || port === 465;
  const user = env['SMTP_USER'] || null;
  const pass = env['SMTP_PASS'] || null;
  const from =
    env['SMTP_FROM'] ||
    (user ? `"ScentStation" <${user}>` : '"ScentStation" <no-reply@scentstation.vn>');
  return { host, port, secure, user, pass, from };
}

/** Đủ năm biến PAYOS_* (khác giá trị mẫu) thì trả cấu hình; thiếu biến nào thì `null`. */
function loadPayosConfig(env: NodeJS.ProcessEnv): PayosConfig | null {
  const read = (name: string) => {
    const value = env[name];
    return value && value !== PLACEHOLDER_SECRET ? value : null;
  };
  const clientId = read('PAYOS_CLIENT_ID');
  const apiKey = read('PAYOS_API_KEY');
  const checksumKey = read('PAYOS_CHECKSUM_KEY');
  const returnUrl = read('PAYOS_RETURN_URL');
  const cancelUrl = read('PAYOS_CANCEL_URL');
  if (!clientId || !apiKey || !checksumKey || !returnUrl || !cancelUrl) return null;
  return {
    baseUrl: read('PAYOS_BASE_URL') ?? PAYOS_DEFAULT_BASE_URL,
    clientId,
    apiKey,
    checksumKey,
    returnUrl,
    cancelUrl,
  };
}

/** Khóa AES-256 dạng base64; trống hoặc giá trị mẫu → `null`; sai độ dài → lỗi khởi động. */
function parseAesKey(raw: string | undefined): Buffer | null {
  if (!raw || raw === PLACEHOLDER_SECRET) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `REFUND_ACCOUNT_ENC_KEY phải là đúng 32 byte mã hóa base64, nhận được ${key.length} byte.`,
    );
  }
  return key;
}

/** Token DI để inject AppConfig trong Nest. */
export const APP_CONFIG = Symbol('APP_CONFIG');

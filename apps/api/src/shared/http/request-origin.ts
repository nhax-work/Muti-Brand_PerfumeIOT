/**
 * Trích nguồn gốc yêu cầu ra khỏi đối tượng request của framework, để truyền xuống tầng nghiệp vụ
 * dưới dạng dữ liệu thuần (QT2, ADR-0003).
 */

export interface RequestOrigin {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

interface MinimalRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

export function originOf(request: MinimalRequest): RequestOrigin {
  const ua = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: (Array.isArray(ua) ? ua[0] : ua) ?? null,
  };
}

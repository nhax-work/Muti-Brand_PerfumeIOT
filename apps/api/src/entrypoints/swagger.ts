/**
 * Swagger UI cho API, phục vụ NGUYÊN VĂN `spec/contracts/openapi.yaml`.
 *
 * Contract-first (ADR-0003 "Chiều sinh contract"): tài liệu không sinh từ decorator trong code —
 * làm vậy sẽ có hai file OpenAPI lệch nhau. Code đồng bộ với contract được chứng minh bằng
 * `tests/contract/`, còn trang này chỉ hiển thị contract.
 *
 *   GET /api/docs        giao diện Swagger UI
 *   GET /api/docs/json   contract dạng JSON (cho Postman, Insomnia…)
 *
 * Route do plugin Fastify đăng ký nên nằm ngoài tiền tố `api/v1` và ngoài AccessGuard của Nest.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export const SWAGGER_ROUTE = '/api/docs';
const SPEC_RELATIVE_PATH = join('spec', 'contracts', 'openapi.yaml');

/**
 * Tìm contract từ thư mục làm việc ngược lên gốc repo — `npm run api:dev` chạy với cwd là
 * `apps/api`, bản build chạy từ chỗ khác (cùng lý do với `shared/config/env-file.ts`).
 */
export function findOpenApiSpec(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, SPEC_RELATIVE_PATH);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Thêm máy chủ đang phục vụ trang lên đầu `servers`, để "Try it out" gọi đúng API kể cả khi mở tài
 * liệu qua IP LAN thay vì `localhost` như trong contract.
 */
export function withCurrentServer(
  spec: Readonly<Record<string, unknown>>,
  origin: string,
): Record<string, unknown> {
  const declared = Array.isArray(spec['servers']) ? (spec['servers'] as { url?: string }[]) : [];
  const current = `${origin}/api/v1`;
  return {
    ...spec,
    servers: [
      { url: current, description: 'Máy chủ đang mở tài liệu này' },
      ...declared.filter((s) => s.url !== current),
    ],
  };
}

/** @returns đường dẫn file contract đã nạp */
export async function registerSwagger(app: NestFastifyApplication): Promise<string> {
  const specPath = findOpenApiSpec();
  if (!specPath) {
    throw new Error(`Không tìm thấy ${SPEC_RELATIVE_PATH} để dựng Swagger UI.`);
  }

  await app.register(fastifySwagger, {
    mode: 'static',
    specification: { path: specPath, baseDir: dirname(specPath) },
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: SWAGGER_ROUTE,
    uiConfig: {
      // Giữ access token sau khi tải lại trang — khỏi đăng nhập lại mỗi lần sửa code.
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
    },
    transformSpecificationClone: true,
    transformSpecification: (spec, request) =>
      withCurrentServer(spec, `${request.protocol}://${request.headers.host ?? 'localhost'}`),
    uiHooks: {
      // @fastify/swagger-ui 4.x dựng đường dẫn CSS/JS tương đối `./api/docs/static/…` khi URL không có
      // `/` cuối — trình duyệt đứng ở `/api/docs` hiểu thành `/api/api/docs/static/…` và trả 404 với
      // routePrefix nhiều cấp. Có `/` cuối thì plugin dùng `./static/…`, đúng.
      onRequest: (request, reply, done) => {
        const [path, query] = request.url.split('?', 2);
        if (path === SWAGGER_ROUTE) {
          void reply.redirect(`${SWAGGER_ROUTE}/${query ? `?${query}` : ''}`);
          return;
        }
        done();
      },
    },
  });
  return specPath;
}

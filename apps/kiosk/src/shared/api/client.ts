import type { paths } from '@scentstation/contracts';
import createClient from 'openapi-fetch';
import { config } from '@/shared/config';

/**
 * Client API duy nhất của kiosk. Endpoint `/kiosk/*` không dùng token người dùng
 * (`security: []` trong openapi.yaml) — máy được nhận diện bằng số serial trên đường dẫn.
 */
export const api = createClient<paths>({ baseUrl: config.apiBaseUrl });

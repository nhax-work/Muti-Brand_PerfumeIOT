/** Chạy backend cho ESP thật qua broker MQTT trên laptop. */
import { loadEnvFile } from '../apps/api/src/shared/config/env-file.js';

loadEnvFile();
process.env['MQTT_URL'] ||= 'mqtt://127.0.0.1:1883';
await import('../apps/api/src/entrypoints/http.js');

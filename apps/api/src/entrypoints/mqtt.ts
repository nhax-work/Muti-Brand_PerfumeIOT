/**
 * Cửa vào MQTT (ADR-0003). Hiện chạy chung tiến trình với HTTP — `http.ts` gọi `startMqtt()` khi có
 * MQTT_URL. Muốn tách thành tiến trình riêng: dựng `NestFactory.createApplicationContext(AppModule)`
 * rồi gọi đúng hàm này, không đổi nghiệp vụ.
 *
 * Không chặn: broker chưa lên thì thư viện tự thử lại; vòng điều phối chỉ ghi và gửi lệnh khi đã
 * kết nối (`DspJobs.tick`).
 */

import { hostname } from 'node:os';
import type { INestApplicationContext } from '@nestjs/common';
import { MqttClientAdapter } from '../adapters/mqtt/index.js';
import { DspMqttGateway } from '../modules/dsp/index.js';

export function startMqtt(app: INestApplicationContext, url: string): void {
  // clientId cố định theo máy chủ: phiên bền (clean=false) giữ bản tin QoS 1 lúc API khởi động lại.
  app.get(MqttClientAdapter).connect(url, `scentstation-api-${hostname()}`);
  app.get(DspMqttGateway).start();
}

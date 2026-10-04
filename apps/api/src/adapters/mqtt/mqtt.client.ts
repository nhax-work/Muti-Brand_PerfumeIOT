/**
 * Adapter MQTT (ADR-0003 "Ba chỗ có seam" mục 2). Module DSP/IOT gọi lớp này, không gọi thẳng
 * thư viện `mqtt`.
 *
 * Không tự kết nối khi Nest khởi tạo: cửa vào MQTT (`entrypoints/mqtt.ts`) gọi `connect()` khi có
 * MQTT_URL. Nhờ vậy test tích hợp dựng AppModule mà không cần broker.
 *
 * Kết nối KHÔNG chặn: broker chưa lên thì API vẫn khởi động, thư viện tự thử lại, và mọi subscription
 * được đăng ký lại mỗi lần kết nối thành công. Ai cần biết đã sẵn sàng thì đọc `connected`.
 */

import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { connect, type MqttClient } from 'mqtt';

export type MqttMessageHandler = (topic: string, payload: Buffer) => Promise<void> | void;

export interface PublishOptions {
  readonly qos: 0 | 1;
  readonly retain?: boolean;
}

interface Subscription {
  readonly pattern: string;
  readonly qos: 0 | 1;
  readonly handle: MqttMessageHandler;
}

@Injectable()
export class MqttClientAdapter implements OnApplicationShutdown {
  private readonly logger = new Logger('MQTT');
  private client: MqttClient | null = null;
  private readonly subscriptions: Subscription[] = [];

  connect(url: string, clientId: string): void {
    if (this.client) return;
    const client = connect(url, {
      clientId,
      // Phiên bền: broker giữ bản tin QoS 1 của topic đã subscribe trong lúc API khởi động lại.
      clean: false,
      reconnectPeriod: 2000,
      connectTimeout: 5000,
    });
    client.on('connect', () => {
      this.logger.log(`Đã kết nối broker ${url} (clientId=${clientId})`);
      for (const s of this.subscriptions) this.sendSubscribe(s);
    });
    client.on('message', (topic, payload) => void this.dispatch(topic, payload));
    client.on('offline', () => this.logger.warn(`Mất kết nối broker ${url}, đang thử lại…`));
    client.on('error', (error) => this.logger.error(`Lỗi MQTT: ${error.message}`));
    this.client = client;
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  async publish(topic: string, message: unknown, options: PublishOptions): Promise<void> {
    if (!this.client?.connected) throw new Error('MQTT chưa kết nối');
    await this.client.publishAsync(topic, JSON.stringify(message), {
      qos: options.qos,
      retain: options.retain ?? false,
    });
  }

  /** Đăng ký ngay nếu đang kết nối, và đăng ký lại sau mỗi lần kết nối lại. */
  subscribe(pattern: string, qos: 0 | 1, handle: MqttMessageHandler): void {
    const subscription = { pattern, qos, handle };
    this.subscriptions.push(subscription);
    if (this.client?.connected) this.sendSubscribe(subscription);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.endAsync();
    this.client = null;
  }

  private sendSubscribe({ pattern, qos }: Subscription): void {
    this.client?.subscribe(pattern, { qos }, (error) => {
      if (error) this.logger.error(`Subscribe ${pattern} lỗi: ${error.message}`);
      else this.logger.log(`Đang nghe ${pattern}`);
    });
  }

  private async dispatch(topic: string, payload: Buffer): Promise<void> {
    for (const { pattern, handle } of this.subscriptions) {
      if (!topicMatches(pattern, topic)) continue;
      try {
        await handle(topic, payload);
      } catch (error) {
        this.logger.error(
          `Xử lý bản tin ${topic} lỗi: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

/** So topic với mẫu có `+` (một cấp) và `#` (mọi cấp còn lại). */
export function topicMatches(pattern: string, topic: string): boolean {
  const p = pattern.split('/');
  const t = topic.split('/');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '#') return true;
    if (i >= t.length) return false;
    if (p[i] !== '+' && p[i] !== t[i]) return false;
  }
  return p.length === t.length;
}

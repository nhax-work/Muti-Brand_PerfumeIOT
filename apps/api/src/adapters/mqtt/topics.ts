/**
 * Topic MQTT theo spec/contracts/mqtt.md §1. Định danh máy trong topic là `serial_number`, không
 * phải `machines.id`.
 */

const PREFIX = 'scentstation';

export type DeviceTopicSuffix =
  'heartbeat' | 'telemetry' | 'event' | 'command' | 'command/result' | 'config';

export function deviceTopic(serial: string, suffix: DeviceTopicSuffix): string {
  return `${PREFIX}/${serial}/${suffix}`;
}

/** Mẫu subscribe mọi máy cho một loại bản tin, ví dụ `scentstation/+/command/result`. */
export function allDevicesTopic(suffix: DeviceTopicSuffix): string {
  return `${PREFIX}/+/${suffix}`;
}

/** Tách serial từ topic đúng dạng `scentstation/{serial}/{suffix}`; sai dạng trả `null`. */
export function serialFromTopic(topic: string, suffix: DeviceTopicSuffix): string | null {
  const head = `${PREFIX}/`;
  const tail = `/${suffix}`;
  if (!topic.startsWith(head) || !topic.endsWith(tail)) return null;
  const serial = topic.slice(head.length, topic.length - tail.length);
  return serial.length > 0 && !serial.includes('/') ? serial : null;
}

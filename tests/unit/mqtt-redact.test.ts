/**
 * Log kết nối MQTT không được lộ mật khẩu broker (NFR-SEC-05). Staging truyền credential của
 * backend qua MQTT_URL (infra/staging/docker-compose.yml).
 */
import { describe, expect, it } from 'vitest';
import { redactBrokerUrl } from '../../apps/api/src/adapters/mqtt/mqtt.client.js';

describe('MQTT — ẩn mật khẩu trong URL broker khi ghi log', () => {
  it('thay mật khẩu bằng *** và giữ user, host, cổng', () => {
    const shown = redactBrokerUrl('mqtt://scent-backend:s3cr3t-value@mqtt:1883');
    expect(shown).toBe('mqtt://scent-backend:***@mqtt:1883');
    expect(shown).not.toContain('s3cr3t-value');
  });

  it('giữ nguyên URL không có credential (máy dev)', () => {
    expect(redactBrokerUrl('mqtt://localhost:1883')).toBe('mqtt://localhost:1883');
  });

  it('không in lại chuỗi không phải URL, vì chuỗi đó có thể chứa bí mật', () => {
    expect(redactBrokerUrl('broker scent-backend:s3cr3t-value')).not.toContain('s3cr3t-value');
  });
});

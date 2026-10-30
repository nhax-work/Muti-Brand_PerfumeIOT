import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Rào chắn mã nguồn; không thay thế đo mức GPIO và thử tải trên thiết bị thật.
const source = readFileSync('arduino/ScentStationDevice/ScentStationDevice.ino', 'utf8');
function body(name: string) {
  const start = source.search(new RegExp(`^(?:void|bool) ${name}\\(`, 'm'));
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

describe('Tách test mode khỏi luồng thanh toán trên firmware', () => {
  it('khởi động với test/mồi tắt, đặt bơm OFF và không gọi hàm chạy tải', () => {
    expect(source).toContain('bool testMode = false;');
    expect(source).toContain('bool testPumpRunning = false;');
    expect(source).toContain('bool primeActive = false;');
    expect(body('setup')).toContain('digitalWrite(PUMP_PINS[i], PUMP_OFF_LEVEL)');
    expect(body('setup')).not.toMatch(/start(?:Test)?Pump\(|PUMP_ON_LEVEL|processTestCommand\(/);
  });

  it('khách chỉ chạy đúng slot đã được cấp quyền và bật đèn', () => {
    const pump = body('startPump');
    expect(pump).toContain('!customerArmed || state != DeviceState::WAITING || activeSlot < 0');
    expect(pump).toContain('digitalRead(LIGHT_PINS[activeSlot]) != LIGHT_ON_LEVEL');
    expect(pump).toContain('customerArmed = false;');
    expect(body('updateButtons')).toContain('state == DeviceState::WAITING && activeSlot == i');
    expect(body('updateButtons')).toContain('startPump(true)');
  });

  it('test dùng slot và thời điểm riêng, không ghi đè đơn khách', () => {
    for (const name of ['startTestPump', 'stopTestPump']) {
      expect(body(name)).not.toMatch(/\bactiveSlot\b|\bpumpStartedAtMs\b|\bcommandToken\b/);
    }
    expect(body('startTestPump')).toContain('!testMode');
    expect(body('startTestPump')).toContain('state != DeviceState::IDLE');
    expect(body('startTestPump')).toContain('slot >= SLOT_COUNT');
    expect(body('startTestPump')).toContain('testStartedAtMs = millis()');
  });

  it('không cho vào test khi đang chờ/running đơn khách và không tự chạy khi bật test', () => {
    const action = body('processTestCommand');
    const on = action.slice(
      action.indexOf('line == "TEST ON"'),
      action.indexOf('line.startsWith("PRIME ")'),
    );
    expect(on).toContain('state != DeviceState::IDLE');
    expect(on).toContain('incomingCommand = ""');
    expect(on).not.toMatch(/start(?:Test)?Pump\(/);
  });

  it('giữ thứ tự xử lý nút và đơn khách trước lệnh test Wi-Fi ở chế độ thường', () => {
    const loop = body('loop');
    const normal = loop.slice(loop.indexOf('// Original payment/button flow:'));
    expect(normal.indexOf('updateButtons()')).toBeLessThan(normal.indexOf('connectNetwork()'));
    expect(normal.indexOf('applyConfiguration(doc)')).toBeLessThan(
      normal.indexOf('acceptCommand(doc)'),
    );
    expect(normal.indexOf('acceptCommand(doc)')).toBeLessThan(normal.indexOf('handleWifiTest()'));
    expect(loop).toContain('slots[activeSlot].runMs');
  });

  it('không nhận lệnh retained và không giữ lệnh khách phát trong lúc test để chạy về sau', () => {
    expect(body('readIncoming')).toContain('topic("test/command") && !retained');
    expect(body('readIncoming')).toContain('topic("command") && !testMode && !retained');
    expect(body('handleWifiTest')).toContain('!verifyCommand(doc)');
    expect(body('handleWifiTest')).toContain('tokenSeen(token)');
    expect(body('acceptCommand')).toContain('if (testMode) return;');
  });
});

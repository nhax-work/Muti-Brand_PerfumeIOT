import { describe, expect, it, vi } from 'vitest';
import { translate, type MessageKey, type MessageParams } from '@scentstation/i18n';
import { getMachineColumns } from './columns';
import type { Location, Machine } from './api';

const t = (key: MessageKey, params?: MessageParams) => translate('vi', key, params);

describe('getMachineColumns', () => {
  const mockLocation: Location = {
    id: 'loc-1',
    code: 'HCM_Q1',
    name: 'Vincom Đồng Khởi',
    address: '72 Lê Thánh Tôn',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'ACTIVE',
  };

  const locationsMap = new Map<string, Location>([['loc-1', mockLocation]]);
  const onViewDetail = vi.fn();

  const columns = getMachineColumns({
    t,
    locationsMap,
    onViewDetail,
  });

  const mockMachine: Machine = {
    id: 'm-1',
    locationId: 'loc-1',
    serialNumber: 'M001',
    displayName: 'Máy Vincom #1',
    status: 'ONLINE',
    operatingMode: 'NORMAL',
    slotCount: 4,
    lastSeenAt: '2026-09-25T08:00:00.000Z',
    firmwareVersion: '1.0.0',
    configurationVersion: 1,
  };

  it('định nghĩa đủ các cột cần thiết cho danh sách máy', () => {
    const keys = columns.map((c) => ('key' in c ? c.key : undefined));
    expect(keys).toContain('serialNumber');
    expect(keys).toContain('displayName');
    expect(keys).toContain('locationId');
    expect(keys).toContain('slotCount');
    expect(keys).toContain('status');
    expect(keys).toContain('operatingMode');
    expect(keys).toContain('lastSeenAt');
    expect(keys).toContain('actions');
  });

  it('ánh xạ đúng tên địa điểm từ locationsMap', () => {
    const locationCol = columns.find((c) => 'key' in c && c.key === 'locationId');
    expect(locationCol).toBeDefined();
    if (locationCol && 'render' in locationCol && typeof locationCol.render === 'function') {
      const rendered = locationCol.render('loc-1', mockMachine, 0);
      expect(String(rendered)).toContain('Vincom Đồng Khởi');
      expect(String(rendered)).toContain('HCM_Q1');
    }
  });
});

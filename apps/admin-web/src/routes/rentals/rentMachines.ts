import type { AvailableSlot } from './api';

/** Một máy trên màn thuê: các slot trống của nó và tổng số ô để vẽ đủ dãy như máy thật. */
export interface RentMachine {
  readonly machineId: string;
  readonly machineName: string;
  readonly locationName: string;
  /** Số ô cần vẽ: tổng slot của máy, không nhỏ hơn số thứ tự slot trống lớn nhất. */
  readonly bayCount: number;
  /** Slot trống theo số thứ tự ô. */
  readonly freeSlots: ReadonlyMap<number, AvailableSlot>;
}

/** Gom danh sách slot trống thành từng máy, giữ thứ tự máy chủ trả (địa điểm, tên máy). */
export function groupByMachine(slots: readonly AvailableSlot[]): RentMachine[] {
  const machines = new Map<
    string,
    { machine: Omit<RentMachine, 'bayCount'>; free: Map<number, AvailableSlot>; total: number }
  >();
  for (const slot of slots) {
    let entry = machines.get(slot.machineId);
    if (!entry) {
      const free = new Map<number, AvailableSlot>();
      entry = {
        machine: {
          machineId: slot.machineId,
          machineName: slot.machineDisplayName || slot.machineId,
          locationName: slot.locationName,
          freeSlots: free,
        },
        free,
        total: slot.machineSlotCount ?? 0,
      };
      machines.set(slot.machineId, entry);
    }
    entry.free.set(slot.slotNumber, slot);
  }
  return [...machines.values()].map(({ machine, free, total }) => ({
    ...machine,
    bayCount: Math.max(total, ...free.keys()),
  }));
}

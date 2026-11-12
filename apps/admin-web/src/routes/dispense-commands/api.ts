import type { components } from '@scentstation/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type DispenseCommand = components['schemas']['DispenseCommand'];
export type CommandStatus = components['schemas']['CommandStatus'];
export type DispenseType = components['schemas']['DispenseType'];

export interface CommandSearch {
  readonly page: number;
  readonly pageSize: number;
  readonly machineId?: string;
  readonly commandType?: DispenseType;
  readonly status?: CommandStatus;
  readonly from?: string;
  readonly to?: string;
}

/** FR-DSP-20: lệnh xịt mới nhất trước; lọc loại lệnh để tách lượt chẩn đoán khỏi lượt của khách. */
export function useDispenseCommands(search: CommandSearch) {
  return useQuery({
    queryKey: ['dispense-commands', search],
    queryFn: () => unwrap(api.GET('/dispense-commands', { params: { query: search } })),
  });
}

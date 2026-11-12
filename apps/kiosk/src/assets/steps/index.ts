/**
 * HÌNH TẠM cho ba bước nhận lượt xịt ở màn nhấn nút — vẽ line-art bằng `currentColor`, chờ nhóm phần
 * cứng cung cấp hình/hoạt ảnh đúng tư thế thật. Thay hình: đổi `source` của bước tương ứng trong
 * `STEP_SOURCES` (SVG inline có CSS animation, hoặc `{ kind: 'video', src }` cho file WebM), không
 * cần sửa bố cục màn hình.
 *
 * Quy ước khi vẽ hình thật: KHÔNG vẽ ngón tay chạm vào vòi xịt.
 */
import type { StepSource } from '@/screens/checkout/StepAnimation';
import { MistRelease } from './MistRelease';
import { PressLitButton } from './PressLitButton';
import { WristUnderNozzle } from './WristUnderNozzle';

export const STEP_SOURCES: readonly [StepSource, StepSource, StepSource] = [
  { kind: 'svg', Art: WristUnderNozzle },
  { kind: 'svg', Art: PressLitButton },
  { kind: 'svg', Art: MistRelease },
];

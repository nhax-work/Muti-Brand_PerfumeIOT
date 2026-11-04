import type { MessageKey } from '@scentstation/i18n';
import { Tour, type TourProps } from 'antd';
import { useI18n } from '@/shared/i18n';

/**
 * Hướng dẫn lần đầu cho Brand Admin: lớp phủ mờ, lần lượt trỏ vào từng mục menu. Mỗi bước trỏ vào
 * phần tử mang `data-tour="<target>"` (AdminLayout gắn lên nhãn mục menu và nút xem lại); bước
 * không có `target` hiện giữa màn hình.
 */
interface OnboardingStep {
  target?: string;
  title: MessageKey;
  description: MessageKey;
}

const STEPS: readonly OnboardingStep[] = [
  { title: 'ui.onboardingWelcomeTitle', description: 'ui.onboardingWelcomeDesc' },
  {
    target: 'email-verification',
    title: 'ui.onboardingEmailTitle',
    description: 'ui.onboardingEmailDesc',
  },
  { target: 'rental', title: 'ui.onboardingRentalTitle', description: 'ui.onboardingRentalDesc' },
  {
    target: 'inventory',
    title: 'ui.onboardingInventoryTitle',
    description: 'ui.onboardingInventoryDesc',
  },
  { target: '/orders', title: 'ui.onboardingOrdersTitle', description: 'ui.onboardingOrdersDesc' },
  { target: '/alerts', title: 'ui.onboardingAlertsTitle', description: 'ui.onboardingAlertsDesc' },
  {
    target: 'finance',
    title: 'ui.onboardingFinanceTitle',
    description: 'ui.onboardingFinanceDesc',
  },
  {
    target: '/brand-profile',
    title: 'ui.onboardingProfileTitle',
    description: 'ui.onboardingProfileDesc',
  },
  { target: 'help', title: 'ui.onboardingHelpTitle', description: 'ui.onboardingHelpDesc' },
];

const AGREEMENT_STEP: OnboardingStep = {
  title: 'ui.onboardingAgreementTitle',
  description: 'ui.onboardingAgreementDesc',
};
const READY_STEP: OnboardingStep = {
  title: 'ui.onboardingReadyTitle',
  description: 'ui.onboardingReadyDesc',
};

/** Mục menu nằm bên trái nên khung chỉ dẫn mở sang phải; thứ nằm trên header thì mở xuống dưới. */
const PLACEMENT: Record<string, 'bottom' | 'bottomRight'> = {
  help: 'bottomRight',
  'email-verification': 'bottom',
};

/**
 * Phần tử cần làm nổi bật: cả dòng menu chứ không chỉ chữ của nhãn. Bước chỉ được giữ khi đích
 * có trên màn hình, nên chỉ phòng hờ trường hợp menu vừa đổi thì trỏ vào thân trang.
 */
function tourTarget(key: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  return el?.closest<HTMLElement>('.ant-menu-item, .ant-menu-submenu-title') ?? el ?? document.body;
}

interface Props {
  open: boolean;
  /** Các `data-tour` đang có trên màn hình; bước trỏ vào thứ không có thì bỏ qua. */
  targets: readonly string[];
  /** Thương hiệu chưa đồng ý hợp đồng khung thì bước cuối mời đồng ý ngay sau khi hoàn thành. */
  agreementPending: boolean;
  onClose: () => void;
  onFinish: () => void;
}

export function BrandOnboardingTour({ open, targets, agreementPending, onClose, onFinish }: Props) {
  const { t } = useI18n();

  const chosen: OnboardingStep[] = [
    ...STEPS.filter((step) => !step.target || targets.includes(step.target)),
    agreementPending ? AGREEMENT_STEP : READY_STEP,
  ];
  const steps: TourProps['steps'] = chosen.map(({ target, title, description }) => ({
    title: t(title),
    description: t(description),
    target: target ? () => tourTarget(target) : null,
    placement: PLACEMENT[target ?? ''] ?? ('right' as const),
  }));

  return <Tour open={open} steps={steps} onClose={onClose} onFinish={onFinish} />;
}

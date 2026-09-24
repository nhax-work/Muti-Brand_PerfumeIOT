import { Button, Result } from 'antd';
import { useNavigate } from 'react-router';
import { useI18n } from '@/shared/i18n';

export default function NotFoundPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="404"
      subTitle={t('ui.notFound')}
      extra={
        <Button type="primary" onClick={() => void navigate('/')}>
          {t('ui.backHome')}
        </Button>
      }
    />
  );
}

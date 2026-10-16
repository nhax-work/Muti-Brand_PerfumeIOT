import { KeyOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { ReauthCancelled } from '@/shared/auth';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { useIssueCredential, useMachineCredential, useRevokeCredential } from '../api';

/**
 * Khóa MQTT của máy (FR-MCH-02, FR-AUTH-11, NFR-SEC-07). Chỉ hiện metadata; bí mật gốc xuất hiện
 * đúng một lần sau khi cấp, trong hộp thoại — đóng là mất, phải cấp lại (NFR-SEC-05). Cấp và thu hồi
 * đều cần xác thực lại (FR-AUTH-09).
 */
export function MachineCredentialsCard({ machineId }: { machineId: string }) {
  const { t } = useI18n();
  const credential = useMachineCredential(machineId);
  const issue = useIssueCredential();
  const revoke = useRevokeCredential();
  const [secret, setSecret] = useState<{ identifier: string; secret: string } | null>(null);

  const current = credential.data;
  const active = current?.status === 'ACTIVE';

  const onIssue = async () => {
    try {
      const issued = await issue.mutateAsync(machineId);
      setSecret({ identifier: issued.credentialIdentifier, secret: issued.secret });
    } catch (error) {
      if (!(error instanceof ReauthCancelled)) message.error(errorMessage(error, t));
    }
  };

  const onRevoke = async () => {
    try {
      await revoke.mutateAsync(machineId);
      message.success(t('ui.credentialRevoked'));
    } catch (error) {
      if (!(error instanceof ReauthCancelled)) message.error(errorMessage(error, t));
    }
  };

  return (
    <Card
      className="premium-card"
      style={{ marginTop: 24 }}
      title={
        <Space>
          <KeyOutlined style={{ color: '#0284c7' }} />
          <span>{t('ui.credentialTitle')}</span>
        </Space>
      }
      extra={
        <Space>
          {active && (
            <Popconfirm
              title={t('ui.credentialRevokeConfirm')}
              okText={t('ui.credentialRevoke')}
              cancelText={t('ui.cancel')}
              onConfirm={() => onRevoke()}
            >
              <Button danger loading={revoke.isPending}>
                {t('ui.credentialRevoke')}
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title={active ? t('ui.credentialReissueConfirm') : t('ui.credentialIssueConfirm')}
            okText={t('ui.confirm')}
            cancelText={t('ui.cancel')}
            onConfirm={() => onIssue()}
          >
            <Button type="primary" loading={issue.isPending}>
              {active ? t('ui.credentialReissue') : t('ui.credentialIssue')}
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      {current ? (
        <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label={t('ui.credentialIdentifier')}>
            <Typography.Text copyable>{current.credentialIdentifier}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.pricingStatus')}>
            <Tag color={active ? 'green' : 'default'}>{current.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.credentialIssuedAt')}>
            {formatDateTime(current.issuedAt)}
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.credentialLastAuth')}>
            {formatDateTime(current.lastAuthenticatedAt)}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">{t('ui.credentialNone')}</Typography.Text>
      )}

      <Modal
        open={secret !== null}
        title={t('ui.credentialSecretTitle')}
        onCancel={() => setSecret(null)}
        footer={
          <Button type="primary" onClick={() => setSecret(null)}>
            {t('ui.userTempPasswordDone')}
          </Button>
        }
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('ui.credentialSecretWarning')}
        />
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('ui.credentialIdentifier')}>
            <Typography.Text copyable>{secret?.identifier}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.credentialSecret')}>
            <Typography.Text copyable code>
              {secret?.secret}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    </Card>
  );
}

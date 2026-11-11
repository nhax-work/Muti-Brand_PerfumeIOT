import { CheckCircleOutlined, EyeOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { ReauthCancelled, useReauth } from '@/shared/auth';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type AgreementVersion,
  type AgreementVersionCreate,
  useAgreementVersions,
  useCreateAgreementVersion,
  usePublishAgreementVersion,
} from './api';

/**
 * Quản lý phiên bản hợp đồng khung của Platform Super Admin (FR-SLT-48, ADR-0013).
 *
 * - Liệt kê toàn bộ phiên bản (nháp, đang hiện hành, đã công bố cũ) kèm số thương hiệu đã đồng ý.
 * - Soạn bản nháp mới (`POST /agreements`): máy chủ tự tính `contentHash` SHA-256 hex.
 * - Công bố phiên bản (`POST /agreements/{version}/publish`): yêu cầu xác nhận và xác thực lại mật khẩu
 *   (`FR-AUTH-09` AC4, header `X-Reauth-Token`). Phiên bản đã công bố bất biến nội dung.
 */
export default function AgreementsPage() {
  const { t } = useI18n();
  const requestReauth = useReauth();
  const { data: versions, isLoading } = useAgreementVersions();
  const createMutation = useCreateAgreementVersion();
  const publishMutation = usePublishAgreementVersion();

  const [createOpen, setCreateOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<AgreementVersion | null>(null);
  const [publishingVersion, setPublishingVersion] = useState<AgreementVersion | null>(null);
  const [form] = Form.useForm<AgreementVersionCreate>();

  const openCreateModal = () => {
    form.resetFields();
    setCreateOpen(true);
  };

  const handleCreateDraft = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;

    try {
      await createMutation.mutateAsync({
        version: values.version.trim(),
        title: values.title.trim(),
        content: values.content,
      });
      message.success(t('ui.agreementDraftCreatedSuccess'));
      setCreateOpen(false);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const handleConfirmPublish = async () => {
    if (!publishingVersion) return;
    const targetVersion = publishingVersion.version;

    try {
      const reauthToken = await requestReauth();
      await publishMutation.mutateAsync({ version: targetVersion, reauthToken });
      message.success(t('ui.agreementPublishSuccess'));
      setPublishingVersion(null);
    } catch (error) {
      if (error instanceof ReauthCancelled) return;
      message.error(errorMessage(error, t));
    }
  };

  const renderStatusTag = (record: AgreementVersion) => {
    if (record.isCurrent) {
      return (
        <Tag color="green" icon={<CheckCircleOutlined />}>
          {t('ui.agreementStatusCurrent')}
        </Tag>
      );
    }
    if (!record.publishedAt) {
      return <Tag color="gold">{t('ui.agreementStatusDraft')}</Tag>;
    }
    return <Tag color="default">{t('ui.agreementStatusPublished')}</Tag>;
  };

  const columns: ColumnsType<AgreementVersion> = [
    {
      title: t('ui.agreementVersionLabel'),
      dataIndex: 'version',
      key: 'version',
      width: 140,
      render: (version: string) => <Typography.Text strong>{version}</Typography.Text>,
    },
    {
      title: t('ui.agreementTitleLabel'),
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: t('ui.pricingStatus'),
      key: 'status',
      width: 170,
      render: (_, record) => renderStatusTag(record),
    },
    {
      title: t('ui.agreementAcceptedColumn'),
      key: 'acceptedBrandCount',
      width: 170,
      render: (_, record) => (
        <Tag color="blue">
          {t('ui.agreementAcceptedBrandsCount', { count: record.acceptedBrandCount ?? 0 })}
        </Tag>
      ),
    },
    {
      title: t('ui.contentHashLabel'),
      dataIndex: 'contentHash',
      key: 'contentHash',
      width: 180,
      render: (hash: string) => (
        <Tooltip title={hash}>
          <Typography.Text code>{hash.slice(0, 12)}…</Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: t('ui.agreementPublishedAtLabel'),
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      width: 170,
      render: (publishedAt: string | null | undefined) =>
        publishedAt ? formatDateTime(publishedAt) : '—',
    },
    {
      title: t('ui.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (createdAt: string) => formatDateTime(createdAt),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewingVersion(record)}
          >
            {t('ui.agreementViewContent')}
          </Button>
          {!record.publishedAt && (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              onClick={() => setPublishingVersion(record)}
            >
              {t('ui.agreementPublishBtn')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
          }}
        >
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              {t('ui.agreementsTitle')}
            </Typography.Title>
            <Typography.Text type="secondary">{t('ui.agreementsSubtitle')}</Typography.Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {t('ui.agreementCreateDraft')}
          </Button>
        </div>

        <Table<AgreementVersion>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={versions ?? []}
          locale={{ emptyText: t('ui.noAgreementVersions') }}
          pagination={{ pageSize: 20 }}
        />

        {/* Modal soạn bản nháp mới */}
        <Modal
          open={createOpen}
          title={t('ui.agreementCreateModalTitle')}
          okText={t('ui.save')}
          cancelText={t('ui.cancel')}
          confirmLoading={createMutation.isPending}
          onOk={() => void handleCreateDraft()}
          onCancel={() => setCreateOpen(false)}
          width={720}
          destroyOnHidden
        >
          <Form form={form} layout="vertical" preserve={false}>
            <Form.Item
              name="version"
              label={t('ui.agreementVersionLabel')}
              rules={[
                { required: true, whitespace: true, message: t('validation.required') },
                { max: 20, message: t('validation.tooBig') },
              ]}
            >
              <Input maxLength={20} placeholder={t('ui.agreementVersionPlaceholder')} />
            </Form.Item>
            <Form.Item
              name="title"
              label={t('ui.agreementTitleLabel')}
              rules={[
                { required: true, whitespace: true, message: t('validation.required') },
                { max: 200, message: t('validation.tooBig') },
              ]}
            >
              <Input maxLength={200} placeholder={t('ui.agreementTitlePlaceholder')} />
            </Form.Item>
            <Form.Item
              name="content"
              label={t('ui.agreementContentLabel')}
              rules={[{ required: true, whitespace: true, message: t('validation.required') }]}
            >
              <Input.TextArea
                rows={10}
                placeholder={t('ui.agreementContentPlaceholder')}
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal xem toàn văn nội dung phiên bản */}
        <Modal
          open={viewingVersion !== null}
          title={
            viewingVersion ? `${viewingVersion.title} (v${viewingVersion.version})` : undefined
          }
          footer={[
            <Button key="close" onClick={() => setViewingVersion(null)}>
              {t('ui.cancel')}
            </Button>,
          ]}
          onCancel={() => setViewingVersion(null)}
          width={760}
        >
          {viewingVersion && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label={t('ui.agreementVersionLabel')}>
                  {viewingVersion.version}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.pricingStatus')}>
                  {renderStatusTag(viewingVersion)}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.agreementAcceptedColumn')}>
                  {t('ui.agreementAcceptedBrandsCount', {
                    count: viewingVersion.acceptedBrandCount ?? 0,
                  })}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.agreementPublishedAtLabel')}>
                  {viewingVersion.publishedAt ? formatDateTime(viewingVersion.publishedAt) : '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.contentHashLabel')} span={2}>
                  <Typography.Text code>{viewingVersion.contentHash}</Typography.Text>
                </Descriptions.Item>
              </Descriptions>
              <div
                style={{
                  maxHeight: 380,
                  overflowY: 'auto',
                  padding: 16,
                  background: '#fafafa',
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              >
                {viewingVersion.content}
              </div>
            </Space>
          )}
        </Modal>

        {/* Modal xác nhận công bố phiên bản */}
        <Modal
          open={publishingVersion !== null}
          title={
            publishingVersion
              ? t('ui.agreementPublishModalTitle', { version: publishingVersion.version })
              : undefined
          }
          okText={t('ui.agreementPublishBtn')}
          cancelText={t('ui.cancel')}
          confirmLoading={publishMutation.isPending}
          onOk={() => void handleConfirmPublish()}
          onCancel={() => setPublishingVersion(null)}
          destroyOnHidden
        >
          {publishingVersion && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Alert
                type="warning"
                showIcon
                message={publishingVersion.title}
                description={t('ui.agreementPublishConfirmText')}
              />
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label={t('ui.agreementVersionLabel')}>
                  <Typography.Text strong>{publishingVersion.version}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.contentHashLabel')}>
                  <Typography.Text code>{publishingVersion.contentHash}</Typography.Text>
                </Descriptions.Item>
              </Descriptions>
            </Space>
          )}
        </Modal>
      </div>
    </RequireRole>
  );
}


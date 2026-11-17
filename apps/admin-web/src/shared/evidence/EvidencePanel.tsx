import { UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  List,
  Modal,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { bytesToMb } from '@/shared/image-upload';
import {
  type CameraEvidence,
  type EvidenceTarget,
  evidenceSrc,
  useEvidenceList,
  useEvidenceWindow,
  useRemoveEvidence,
  useUploadEvidence,
} from './api';

interface UploadValues {
  note?: string;
}

/** Thẻ video/ảnh cho một bằng chứng còn tệp. */
export function EvidenceMedia({
  kind,
  url,
  label,
}: {
  kind: CameraEvidence['kind'];
  url: string;
  label: string;
}) {
  return kind === 'VIDEO' ? (
    <video
      className="evidence-media"
      src={evidenceSrc(url)}
      controls
      preload="metadata"
      aria-label={label}
    />
  ) : (
    <img className="evidence-media" src={evidenceSrc(url)} alt={label} />
  );
}

/**
 * Bằng chứng camera của một hồ sơ (ADR-0032): khung giờ cần tua, biểu mẫu tải lên và danh sách tệp.
 * Máy chủ quyết định ai tải, ai gỡ được; màn hình chỉ ẩn nút với người chắc chắn không làm được.
 */
export function EvidencePanel({
  target,
  canUpload,
  closed,
  currentUserId,
}: {
  target: EvidenceTarget;
  /** Người xem có quyền tải lên (và không phải người đã nạp với phiếu nạp). */
  canUpload: boolean;
  /** Hồ sơ đã đóng — không thêm, không gỡ. */
  closed: boolean;
  currentUserId: string | null;
}) {
  const { t } = useI18n();
  const list = useEvidenceList(target);
  const showForm = canUpload && !closed;
  const timeWindow = useEvidenceWindow(target, showForm);
  const upload = useUploadEvidence(target);
  const remove = useRemoveEvidence(target);
  const [form] = Form.useForm<UploadValues>();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [removing, setRemoving] = useState<CameraEvidence | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  const items = list.data?.items ?? [];
  const max = list.data?.maxItems ?? SPEC_CONSTRAINTS.CAMERA_EVIDENCE_MAX_PER_TARGET;
  const full = items.length >= max;

  const submit = (values: UploadValues) => {
    const file = files[0]?.originFileObj;
    const range = timeWindow.data;
    if (!file || !range) {
      void message.error(t('ui.evidenceFileRequired'));
      return;
    }
    // Không bắt người tải nhập camera, khung giờ hay độ lệch đồng hồ: lấy nhãn camera của máy (chưa
    // có thì tên máy) và đúng khung giờ cần xem, coi đồng hồ camera đã đồng bộ NTP.
    upload.mutate(
      {
        file,
        cameraLabel: (range.cameraLabel ?? range.machineName).slice(0, 100),
        recordedFrom: range.from,
        recordedTo: range.to,
        clockOffsetSec: 0,
        ...(values.note?.trim() ? { note: values.note.trim() } : {}),
      },
      {
        onSuccess: () => {
          void message.success(t('ui.evidenceUploaded'));
          setFiles([]);
          form.resetFields(['note']);
        },
        onError: (e) => void message.error(errorMessage(e, t)),
      },
    );
  };

  const confirmRemove = () => {
    if (!removing || !removeReason.trim()) return;
    remove.mutate(
      { id: removing.id, reason: removeReason.trim() },
      {
        onSuccess: () => {
          void message.success(t('ui.evidenceRemovedNotice'));
          setRemoving(null);
          setRemoveReason('');
        },
        onError: (e) => void message.error(errorMessage(e, t)),
      },
    );
  };

  return (
    <Space orientation="vertical" size="middle" className="evidence-panel">
      <Space>
        <Typography.Title level={5} className="evidence-heading">
          {t('ui.evidenceTitle')}
        </Typography.Title>
        <Tag>{t('ui.evidenceCount', { count: items.length, max })}</Tag>
      </Space>

      {showForm && timeWindow.data && !full && (
        <>
          <Typography.Text type="secondary">{t('ui.evidenceIntro')}</Typography.Text>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('ui.evidenceMachine')}>
              {timeWindow.data.machineName}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.evidenceCamera')}>
              {timeWindow.data.cameraLabel ?? (
                <Typography.Text type="secondary">{t('ui.evidenceNoCameraLabel')}</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.evidenceWindow')}>
              {formatDateTime(timeWindow.data.from)} – {formatDateTime(timeWindow.data.to)}
            </Descriptions.Item>
          </Descriptions>

          <Form<UploadValues> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
            <Form.Item
              label={t('ui.evidenceFile')}
              extra={t('ui.evidenceFileHint', {
                clipMb: bytesToMb(SPEC_CONSTRAINTS.CAMERA_CLIP_MAX_BYTES),
                imageMb: bytesToMb(SPEC_CONSTRAINTS.CAMERA_IMAGE_MAX_BYTES),
              })}
            >
              <Upload
                accept="video/mp4,image/jpeg,image/png,image/webp"
                maxCount={1}
                fileList={files}
                beforeUpload={() => false}
                onChange={({ fileList }) => setFiles(fileList.slice(-1))}
              >
                <Button icon={<UploadOutlined />}>{t('ui.evidenceFile')}</Button>
              </Upload>
            </Form.Item>
            <Form.Item name="note" label={t('ui.evidenceNote')}>
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={upload.isPending}>
              {t('ui.evidenceUpload')}
            </Button>
          </Form>
        </>
      )}

      <List<CameraEvidence>
        loading={list.isLoading}
        dataSource={items}
        locale={{ emptyText: t('ui.evidenceEmpty') }}
        renderItem={(item) => {
          const label = `${item.cameraLabel} · ${formatDateTime(item.recordedFrom)}`;
          const mine = item.uploadedBy === currentUserId;
          return (
            <List.Item
              actions={
                mine && !closed && item.url
                  ? [
                      <Button key="remove" type="link" danger onClick={() => setRemoving(item)}>
                        {t('ui.evidenceRemove')}
                      </Button>,
                    ]
                  : []
              }
            >
              <Space orientation="vertical" size={4} className="evidence-item">
                {item.url ? (
                  <EvidenceMedia kind={item.kind} url={item.url} label={label} />
                ) : (
                  <Tag>
                    {item.removedAt
                      ? t('ui.evidenceRemoved', { reason: item.removedReason ?? '' })
                      : t('ui.evidencePurged')}
                  </Tag>
                )}
                <Typography.Text>
                  {t('ui.evidenceRecorded')}: {formatDateTime(item.recordedFrom)} –{' '}
                  {formatDateTime(item.recordedTo)} · {item.cameraLabel}
                </Typography.Text>
                {item.note && <Typography.Text type="secondary">{item.note}</Typography.Text>}
                <Typography.Text type="secondary">
                  {t('ui.evidenceUploadedAt', { at: formatDateTime(item.uploadedAt) })} · SHA-256{' '}
                  <Typography.Text code copyable={{ text: item.sha256 }}>
                    {item.sha256.slice(0, 12)}…
                  </Typography.Text>
                </Typography.Text>
              </Space>
            </List.Item>
          );
        }}
      />

      <Modal
        open={removing !== null}
        title={t('ui.evidenceRemoveTitle')}
        okText={t('ui.evidenceRemove')}
        okButtonProps={{ danger: true, disabled: !removeReason.trim(), loading: remove.isPending }}
        onOk={confirmRemove}
        onCancel={() => {
          setRemoving(null);
          setRemoveReason('');
        }}
      >
        <Input.TextArea
          rows={2}
          maxLength={1000}
          placeholder={t('ui.evidenceRemoveReason')}
          aria-label={t('ui.evidenceRemoveReason')}
          value={removeReason}
          onChange={(e) => setRemoveReason(e.target.value)}
        />
      </Modal>

      {list.isError && <Alert type="error" showIcon title={errorMessage(list.error, t)} />}
    </Space>
  );
}

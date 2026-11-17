import { VideoCameraOutlined } from '@ant-design/icons';
import { Button, Card, Input, Space, Typography, message } from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useSetCameraLabel } from '../api';

/**
 * Nhãn camera an ninh quay máy (FR-MCH-20, ADR-0032 mục 5) — người đi lấy hình biết tua đầu ghi nào.
 * Chỉ Super Admin (machine.manage).
 */
export function CameraLabelCard({
  machineId,
  cameraLabel,
}: {
  machineId: string;
  cameraLabel: string | null;
}) {
  const { t } = useI18n();
  const save = useSetCameraLabel();
  const [value, setValue] = useState(cameraLabel ?? '');
  const changed = value.trim() !== (cameraLabel ?? '');

  return (
    <Card
      title={
        <Space>
          <VideoCameraOutlined /> {t('ui.cameraLabel')}
        </Space>
      }
    >
      <Space.Compact className="camera-label-input">
        <Input
          value={value}
          maxLength={100}
          aria-label={t('ui.cameraLabel')}
          placeholder="Cam-03 · …"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          type="primary"
          disabled={!changed}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { id: machineId, cameraLabel: value.trim() || null },
              {
                onSuccess: () => void message.success(t('ui.cameraLabelSaved')),
                onError: (e) => void message.error(errorMessage(e, t)),
              },
            )
          }
        >
          {t('ui.save')}
        </Button>
      </Space.Compact>
      <Typography.Paragraph type="secondary" className="camera-label-hint">
        {t('ui.cameraLabelHint')}
      </Typography.Paragraph>
    </Card>
  );
}

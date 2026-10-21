import { Alert, Input, Modal, message } from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { ReauthCancelled } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';
import { useDiagnosticDispense, type MachineSlot } from '../api';

/**
 * Lượt xịt chẩn đoán trên một slot (FR-MNT-09, FR-DSP-27). Máy xịt ngay, không chờ bấm nút; không
 * tạo đơn, không tính doanh thu (FR-DSP-20). Xác nhận ở đây rồi mới hỏi mật khẩu (FR-AUTH-09).
 */
export function DiagnosticDispenseModal({
  machineId,
  slot,
  onClose,
}: {
  machineId: string;
  slot: MachineSlot | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const diagnose = useDiagnosticDispense();
  const [note, setNote] = useState('');

  const close = () => {
    setNote('');
    onClose();
  };

  const onConfirm = async () => {
    if (!slot) return;
    try {
      const command = await diagnose.mutateAsync({
        machineId,
        slotId: slot.id,
        note: note.trim() || undefined,
      });
      message.success(t('ui.diagnosticSent', { token: command.commandToken }));
      close();
    } catch (error) {
      if (!(error instanceof ReauthCancelled)) message.error(errorMessage(error, t));
    }
  };

  return (
    <Modal
      open={slot !== null}
      title={slot ? t('ui.diagnosticTitle', { slotNumber: slot.slotNumber }) : undefined}
      okText={t('ui.diagnosticDispense')}
      cancelText={t('ui.cancel')}
      confirmLoading={diagnose.isPending}
      onOk={() => void onConfirm()}
      onCancel={close}
      destroyOnHidden
    >
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('ui.diagnosticHint')} />
      <Input.TextArea
        rows={3}
        maxLength={1000}
        placeholder={t('ui.diagnosticNote')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </Modal>
  );
}

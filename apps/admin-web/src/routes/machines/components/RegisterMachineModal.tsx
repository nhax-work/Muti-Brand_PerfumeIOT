import { Form, Input, InputNumber, Modal, Select, message } from 'antd';
import { useNavigate } from 'react-router';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { type Location, type MachineCreate, useRegisterMachine } from '../api';

/**
 * Đăng ký máy mới (FR-MCH-01, 04, 05). Số slot do người dùng nhập — không cố định trong mã
 * (NFR-SCA-04). Xong thì sang trang chi tiết để cấp khóa MQTT cho máy (FR-MCH-02).
 */
export function RegisterMachineModal({
  open,
  locations,
  onClose,
}: {
  open: boolean;
  locations: readonly Location[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const register = useRegisterMachine();
  const [form] = Form.useForm<MachineCreate>();

  const submit = async () => {
    // Form sai: antd đã hiện lỗi cạnh từng ô — không ném tiếp thành lỗi promise không ai bắt.
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    try {
      const machine = await register.mutateAsync(values);
      message.success(t('ui.machineRegistered'));
      onClose();
      void navigate(`/machines/${machine.id}`);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  return (
    <Modal
      open={open}
      title={t('ui.machineRegister')}
      okText={t('ui.machineRegister')}
      cancelText={t('ui.cancel')}
      confirmLoading={register.isPending}
      onOk={() => void submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ slotCount: 5 }}>
        <Form.Item
          name="serialNumber"
          label={t('ui.serialNumber')}
          extra={t('ui.machineSerialHint')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Input maxLength={100} placeholder="M002" />
        </Form.Item>
        <Form.Item
          name="displayName"
          label={t('ui.displayName')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item
          name="locationId"
          label={t('ui.location')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={locations.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }))}
          />
        </Form.Item>
        <Form.Item
          name="slotCount"
          label={t('ui.slotCount')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <InputNumber min={1} max={20} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

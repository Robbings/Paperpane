import { Button, Dialog } from '@/ui/components';

interface Props {
  open: boolean;
  detail?: string;
  onConfirm: () => void;
  onSettings: () => void;
  onClose: () => void;
}

export function TranslationConfirm({ open, detail, onConfirm, onSettings, onClose }: Props) {
  if (!open) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title="开始翻译"
      description={
        <>
          待翻译的文本会发送给所选服务，可能产生费用。{detail && <p>{detail}</p>}
        </>
      }
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button onClick={onSettings}>去设置</Button>
          <Button variant="primary" onClick={onConfirm}>
            翻译
          </Button>
        </>
      }
    />
  );
}

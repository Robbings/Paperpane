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
          翻译将调用 API，可能产生费用。若尚未配置，请先在设置中配置 API 后再使用。{detail && <p>{detail}</p>}
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

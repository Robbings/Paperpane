import { useEffect } from 'react';
import { Switch, toast } from '@/ui/components';
import { useBrowserEntry } from '@/runtime/use-browser-entry';
import { SettingGroup, SettingRow } from '../SettingRow';

export function BrowserEntrySection() {
  const { settings, save, error } = useBrowserEntry();
  useEffect(() => {
    if (error) toast.show({ tone: 'error', message: error });
  }, [error]);
  return <SettingGroup title="打开 PDF">
    <SettingRow label="自动在纸窗中打开">
      <Switch label="自动在纸窗中打开 PDF" hideLabel checked={settings.autoOpenPdf} onChange={value => void save({ autoOpenPdf: value })}/>
    </SettingRow>
    <SettingRow label="网页快捷按钮" hint="在论文网页、PDF 链接和嵌入的 PDF 旁显示「用纸窗打开」">
      <Switch label="网页快捷按钮" hideLabel checked={settings.showPdfButtons} onChange={value => void save({ showPdfButtons: value })}/>
    </SettingRow>
  </SettingGroup>;
}

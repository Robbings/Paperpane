import { Switch } from '@/ui/components';
import { useBrowserEntry } from '@/runtime/use-browser-entry';
import { SettingGroup, SettingRow } from '../SettingRow';

export function BrowserEntrySection() {
  const { settings, save, error } = useBrowserEntry();
  return <SettingGroup title="浏览器入口">
    <SettingRow label="自动用纸窗打开 PDF" description="打开在线 PDF 时直接进入纸窗。返回原 PDF 后，当前标签页保留原生查看方式。">
      <Switch label="自动用纸窗打开 PDF" hideLabel checked={settings.autoOpenPdf} onChange={value => void save({ autoOpenPdf: value })}/>
    </SettingRow>
    <SettingRow label="显示网页打开按钮" description="在支持的论文页面、PDF 链接和嵌入的 PDF 旁显示按钮。关闭后仍可使用扩展弹窗；不影响自动打开。">
      <Switch label="显示网页打开按钮" hideLabel checked={settings.showPdfButtons} onChange={value => void save({ showPdfButtons: value })}/>
    </SettingRow>
    {error && <p role="alert" className="pp-set-notice" data-tone="danger">{error}</p>}
  </SettingGroup>;
}

import { Badge, HintLabel, Icon, IconButton, Switch } from '@/ui/components';
import { useEffect, useState, type CSSProperties } from 'react';
import { sinceText } from '@/ui/settings/StatusLine';
import type { SettingsSection, StatusSummary } from '@/ui/settings/types';
import type { ActiveTabView, PopupViewProps } from './types';
import './popup.css';

/** The mark: a sheet of paper seen through a window frame. */
function LogoMark() {
  return (
    <svg className="pp-popup__logo" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="var(--pp-accent)" />
      <path d="M7 5.5h6l3 3v8a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-10.5a.5.5 0 0 1 .5-.5z" fill="#fff" />
      <path d="M8.5 10.5h5 M8.5 12.75h5 M8.5 15h3" stroke="var(--pp-accent)" strokeWidth="1" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** A small first page, standing in for the PDF. */
function PageThumb() {
  return (
    <span className="pp-popup__thumb" aria-hidden="true">
      <span className="pp-popup__thumb-lines" />
      <span className="pp-popup__thumb-tag">PDF</span>
    </span>
  );
}

/** Things worth a line in the popup: only what needs the reader's attention. */
function problems(status: StatusSummary): { text: string; section: SettingsSection }[] {
  const list: { text: string; section: SettingsSection }[] = [];
  if (status.local === 'failed') list.push({ text: '有内容没能保存', section: 'general' });
  if (status.sync === 'failed') list.push({ text: '同步失败', section: 'sync' });
  if (status.sync === 'conflict') list.push({ text: '同步有冲突', section: 'sync' });
  if (status.modelAvailability === 'unavailable') list.push({ text: status.modelMessage ?? '模型暂不可用', section: 'models' });
  return list;
}

/** The current tab, only when it holds something the reader can open. */
function CurrentTab({ tab, onOpen, onImport }: { tab: ActiveTabView; onOpen: () => void; onImport: () => void }) {
  // A local PDF the browser will not let us read: offer to import it instead.
  const local = !tab.canOpenInReader && tab.block === 'file-access';
  return (
    <section className="pp-popup__card pp-popup__tab" aria-label="当前页面">
      <div className="pp-popup__tab-row">
        <PageThumb />
        <div className="pp-popup__tab-text">
          <p className="pp-popup__tab-title" title={tab.title}>
            {tab.title}
          </p>
          <p className="pp-popup__tab-meta">
            <span className="pp-popup__tab-url" title={tab.displayUrl}>
              {tab.displayUrl}
            </span>
            {tab.inLibrary && <Badge>已收藏</Badge>}
          </p>
        </div>
      </div>
      <button type="button" className="pp-popup__primary" onClick={local ? onImport : onOpen}>
        {local ? '选择文件导入' : '在纸窗中打开'}
      </button>
    </section>
  );
}

/**
 * The extension's toolbar popup: the current paper when there is one, the two
 * browser switches, recent papers, and the way into the library.
 */
export function PopupView(props: PopupViewProps) {
  const { activeTab: tab, recent } = props;
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
  const openable = !!tab && (tab.canOpenInReader || tab.block === 'file-access') && tab.pdf !== 'checking' && tab.pdf !== 'unknown';
  const issues = problems(props.status);

  return (
    <div className="pp-popup">
      <header className="pp-popup__head">
        <LogoMark />
        <span className="pp-popup__name">纸窗</span>
        <IconButton icon="settings" label="设置" shape="pill" onClick={() => props.onOpenSettings()} />
      </header>

      {openable && <CurrentTab tab={tab} onOpen={() => props.onOpenInReader(tab.tabId)} onImport={props.onAllowFileAccess} />}

      <section className="pp-popup__card pp-popup__group" aria-label="浏览器">
        <div className="pp-popup__row">
          <span className="pp-popup__row-label">自动打开 PDF</span>
          <Switch label="自动打开 PDF" hideLabel checked={props.autoOpenPdf} onChange={props.onAutoOpenPdf} />
        </div>
        {props.onShowPdfButtons && <div className="pp-popup__row">
          <span className="pp-popup__row-label"><HintLabel hint="在论文网页和 PDF 链接旁显示「用纸窗打开」按钮">网页快捷按钮</HintLabel></span>
          <Switch label="网页快捷按钮" hideLabel checked={props.showPdfButtons??true} onChange={props.onShowPdfButtons}/>
        </div>}
      </section>

      {recent.length > 0 && (
        <section className="pp-popup__recent" aria-labelledby="pp-popup-recent">
          <h2 id="pp-popup-recent">最近阅读</h2>
          <ul>
            {recent.slice(0, 3).map((paper) => (
              <li key={paper.id}>
                <button type="button" onClick={() => props.onOpenRecent(paper.id)}>
                  <span className="pp-popup__recent-title">{paper.title}</span>
                  <span className="pp-popup__recent-meta">{sinceText(paper.lastReadAt,now)}</span>
                  {paper.progress !== undefined && paper.progress > 0 && paper.progress < 1 && (
                    <span className="pp-popup__recent-progress" style={{ '--pp-progress': `${Math.round(paper.progress * 100)}%` } as CSSProperties} aria-label={`读到 ${Math.round(paper.progress * 100)}%`} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(props.error || issues.length > 0) && (
        <ul className="pp-popup__issues" role="alert">
          {props.error && <li><span>{props.error}</span></li>}
          {issues.map((issue) => (
            <li key={issue.text}>
              <button type="button" onClick={() => props.onOpenSettings(issue.section)}>{issue.text}</button>
            </li>
          ))}
        </ul>
      )}

      <nav className="pp-popup__card pp-popup__dock" aria-label="打开">
        <button type="button" onClick={props.onOpenLibrary}>
          <Icon name="library" size={17} />
          文献库
        </button>
        <button type="button" onClick={props.onOpenFile}>
          <Icon name="upload" size={17} />
          打开文件
        </button>
      </nav>
    </div>
  );
}

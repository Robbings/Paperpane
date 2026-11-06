import { Badge, Icon, IconButton, LogoMark } from '@/ui/components';
import { useEffect, useState, type CSSProperties } from 'react';
import { sinceText } from '@/ui/settings/StatusLine';
import type { SettingsSection, StatusSummary } from '@/ui/settings/types';
import type { ActiveTabView, PopupViewProps } from './types';
import './popup.css';

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
function CurrentTab({ tab, onOpen, onImport, onFileAccess }: { tab: ActiveTabView; onOpen: () => void; onImport: () => void; onFileAccess?: () => void }) {
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
        {local ? '选择文件打开' : '在纸间中打开'}
      </button>
      {local && onFileAccess && (
        <p className="pp-popup__hint">
          想直接打开本地 PDF：在扩展详情中开启「允许访问文件网址」，然后刷新这个页面。
          <button type="button" onClick={onFileAccess}>前往开启</button>
        </p>
      )}
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
        <LogoMark className="pp-popup__logo" />
        <span className="pp-popup__name">纸间</span>
        <IconButton icon="settings" label="设置" shape="pill" onClick={() => props.onOpenSettings()} />
      </header>

      {props.update && (
        <section className="pp-popup__card pp-popup__update" aria-labelledby="pp-popup-update">
          <span className="pp-popup__update-icon" aria-hidden="true">
            <Icon name="download" size={17} />
          </span>
          <h2 id="pp-popup-update">纸间 {props.update.version} 可以更新了</h2>
          {props.onDismissUpdate && (
            <IconButton icon="close" label="不再提示这个版本" onClick={props.onDismissUpdate} />
          )}
          {props.onOpenUpdate && (
            <button type="button" className="pp-popup__primary" onClick={props.onOpenUpdate}>
              查看更新内容和步骤
            </button>
          )}
        </section>
      )}

      {props.setupNeeded && props.onOpenGuide && (
        <section className="pp-popup__card pp-popup__setup" aria-labelledby="pp-popup-setup">
          <span className="pp-popup__setup-icon" aria-hidden="true">
            <Icon name="sliders" size={17} />
          </span>
          <div className="pp-popup__setup-text">
            <h2 id="pp-popup-setup">完成配置</h2>
            <p>添加模型或翻译服务后，就能翻译和提问。</p>
          </div>
          <button type="button" className="pp-popup__primary" onClick={props.onOpenGuide}>
            开始配置引导
          </button>
        </section>
      )}

      {openable && <CurrentTab tab={tab} onOpen={() => props.onOpenInReader(tab.tabId)} onImport={props.onAllowFileAccess} onFileAccess={props.onOpenFileAccessSettings} />}

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

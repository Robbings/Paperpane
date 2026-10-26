import { Badge, Icon, Skeleton, Switch, type IconName } from '@/ui/components';
import { sinceText, StatusLine } from '@/ui/settings/StatusLine';
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

const blockText: Record<NonNullable<ActiveTabView['block']>, { icon: IconName; title: string; detail: string }> = {
  'not-pdf': { icon: 'file', title: '当前页面不是 PDF', detail: '打开论文的 PDF 链接后，可以在这里一键转到纸窗阅读。' },
  restricted: { icon: 'lock', title: '这个页面无法打开', detail: '浏览器不允许扩展读取设置页、扩展商店等页面。' },
  'file-access': { icon: 'lock', title: '需要允许访问本地文件', detail: '在扩展详情里打开「允许访问文件网址」后，就能用纸窗打开电脑上的 PDF。' },
  'in-reader': { icon: 'check', title: '正在纸窗中阅读', detail: '这篇论文已经在阅读器里打开了。' },
};

function CurrentTab({ tab, onOpen, onAllowFileAccess }: { tab: ActiveTabView | null; onOpen: () => void; onAllowFileAccess: () => void }) {
  if (!tab || tab.pdf === 'checking' || tab.pdf === 'unknown') {
    return (
      <section className="pp-popup__card pp-popup__tab" aria-busy="true" aria-label="当前页面">
        <div className="pp-popup__tab-row">
          <span className="pp-popup__thumb pp-popup__thumb--empty" aria-hidden="true" />
          <div className="pp-popup__tab-text">
            <Skeleton lines={2} />
          </div>
        </div>
      </section>
    );
  }

  if (!tab.canOpenInReader) {
    const block = blockText[tab.block ?? 'not-pdf'];
    return (
      <section className="pp-popup__card pp-popup__tab" data-state="blocked" aria-label="当前页面">
        <div className="pp-popup__tab-row">
          <span className="pp-popup__badge-icon" data-block={tab.block ?? 'not-pdf'} aria-hidden="true">
            <Icon name={block.icon} size={18} />
          </span>
          <div className="pp-popup__tab-text">
            <p className="pp-popup__tab-title">{block.title}</p>
            <p className="pp-popup__tab-detail">{block.detail}</p>
          </div>
        </div>
        {tab.block === 'file-access' && (
          <button type="button" className="pp-popup__primary pp-popup__primary--soft" onClick={onAllowFileAccess}>
            打开扩展详情
            <Icon name="openExternal" size={15} />
          </button>
        )}
      </section>
    );
  }

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
            {tab.inLibrary && <Badge>已在文献库</Badge>}
          </p>
        </div>
      </div>
      <button type="button" className="pp-popup__primary" onClick={onOpen}>
        在纸窗中打开
      </button>
    </section>
  );
}

/**
 * The extension's toolbar popup: the current tab and a way into the reader,
 * auto-open, recent papers, and the library and settings.
 */
export function PopupView(props: PopupViewProps) {
  const { activeTab: tab, recent } = props;

  return (
    <div className="pp-popup">
      <header className="pp-popup__head">
        <LogoMark />
        <span className="pp-popup__name">纸窗</span>
        <span className="pp-popup__name-en">Paperpane</span>
      </header>

      <CurrentTab tab={tab} onOpen={() => tab && props.onOpenInReader(tab.tabId)} onAllowFileAccess={props.onAllowFileAccess} />

      <section className="pp-popup__card pp-popup__group" aria-label="自动打开">
        <div className="pp-popup__row">
          <span className="pp-popup__row-label">自动打开 PDF</span>
          <Switch label="自动打开 PDF" hideLabel checked={props.autoOpenPdf} onChange={props.onAutoOpenPdf} />
        </div>
      </section>

      {recent.length > 0 && (
        <section className="pp-popup__recent" aria-labelledby="pp-popup-recent">
          <h2 id="pp-popup-recent">继续阅读</h2>
          <ul>
            {recent.slice(0, 3).map((paper) => (
              <li key={paper.id}>
                <button type="button" onClick={() => props.onOpenRecent(paper.id)}>
                  <span className="pp-popup__recent-title">{paper.title}</span>
                  <span className="pp-popup__recent-meta">
                    {paper.progress !== undefined && paper.progress > 0 && paper.progress < 1 ? `读到 ${Math.round(paper.progress * 100)}% · ` : ''}
                    {sinceText(paper.lastReadAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <StatusLine status={props.status} inline className="pp-popup__status" onOpen={props.onOpenSettings} />

      <nav className="pp-popup__card pp-popup__dock" aria-label="打开">
        <button type="button" onClick={props.onOpenLibrary}>
          <Icon name="library" size={17} />
          文献库
        </button>
        <button type="button" onClick={props.onOpenFile}>
          <Icon name="upload" size={17} />
          打开文件
        </button>
        <button type="button" onClick={() => props.onOpenSettings()}>
          <Icon name="settings" size={17} />
          设置
        </button>
      </nav>
    </div>
  );
}

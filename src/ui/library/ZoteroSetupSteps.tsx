import { useState } from 'react';
import { Icon } from '@/ui/components';
import './zotero.css';

const KEYS_URL = 'https://www.zotero.org/settings/keys/new';

/** How to get a Zotero API key: folded by default, three short steps when opened. */
export function ZoteroSetupSteps({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pp-zotero-steps" data-open={open || undefined}>
      <button type="button" className="pp-zotero-steps__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="chevronRight" size={13} />
        如何获取 API 密钥
      </button>
      {open && (
        <ol>
          <li>
            登录 Zotero 网站，打开
            <a href={KEYS_URL} target="_blank" rel="noopener noreferrer">
              新建密钥
            </a>
            页面。
          </li>
          <li>勾选「Allow library access」和「Allow notes access」；要导出到 Zotero，再勾选「Allow write access」。</li>
          <li>保存后复制密钥，粘贴到纸窗「设置 › 同步与备份 › Zotero」。</li>
        </ol>
      )}
    </div>
  );
}

import { browser } from 'wxt/browser';
import { Button, Markdown } from '@/ui/components';
import { useUpdate } from '@/runtime/use-update';
import { REPOSITORY, type UpdateState } from '@/update/check';
import { SettingGroup, SettingRow } from '../SettingRow';
import { sinceText } from '../StatusLine';

interface AboutViewProps {
  /** null while the recorded check is being read. */
  state: UpdateState | null;
  checking: boolean;
  onCheck: () => void;
  onOpen: (url: string) => void;
  onOpenExtensions: () => void;
}

function checkLine(state: UpdateState | null, checking: boolean): string {
  if (!state) return '正在读取…';
  if (state.store) return '由应用商店自动更新';
  if (checking) return '正在检查…';
  if (state.error) return `上次检查没有成功：${state.error}`;
  if (state.available) return `有新版本 ${state.latest!.version}`;
  if (state.latest && state.checkedAt) return `已是最新版本 · ${sinceText(state.checkedAt)}检查`;
  return '每天自动检查一次';
}

const dateText = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日发布`;
};

/** Version, update check and, when there is one, the new version with how to install it. */
export function AboutView({ state, checking, onCheck, onOpen, onOpenExtensions }: AboutViewProps) {
  const latest = state?.available ? state.latest! : null;
  return (
    <>
      <SettingGroup title="版本">
        <SettingRow label="当前版本">
          <span className="pp-about__version">{state?.current ?? '—'}</span>
        </SettingRow>
        <SettingRow label="检查更新" description={checkLine(state, checking)}>
          {!state?.store && (
            <Button size="sm" onClick={onCheck} disabled={!state || checking}>
              {checking ? '正在检查' : '检查更新'}
            </Button>
          )}
        </SettingRow>
      </SettingGroup>

      {latest && (
        <SettingGroup title={`新版本 ${latest.version}`} description={latest.publishedAt ? dateText(latest.publishedAt) : undefined}>
          <div className="pp-about__update">
            <ol className="pp-about__steps">
              <li>
                下载 <strong>{latest.asset ?? '对应浏览器的 zip 压缩包'}</strong> 并解压。
              </li>
              <li>用解压出来的文件替换原来那个扩展文件夹里的全部文件，文件夹本身不要换。</li>
              <li>打开扩展管理页，点纸间卡片上的「重新加载」。</li>
            </ol>
            <p className="pp-about__note">
              换一个文件夹加载会被浏览器当成另一个扩展，已有的文献库和笔记就看不到了。不放心可以先在「同步与备份」里导出一份备份。
            </p>
            <div className="pp-about__actions">
              <Button variant="primary" size="sm" icon="download" onClick={() => onOpen(latest.url)}>
                下载新版
              </Button>
              <Button size="sm" onClick={onOpenExtensions}>
                打开扩展管理页
              </Button>
            </div>
            {latest.notes && (
              <section className="pp-about__notes" aria-label="更新内容">
                <h3>更新内容</h3>
                <Markdown text={latest.notes} />
              </section>
            )}
          </div>
        </SettingGroup>
      )}

      <SettingGroup title="项目">
        <SettingRow label="项目主页" description="源代码、问题反馈和全部版本">
          <Button size="sm" icon="openExternal" onClick={() => onOpen(REPOSITORY)}>
            GitHub
          </Button>
        </SettingRow>
        <SettingRow label="许可证">
          <span className="pp-about__version">AGPL-3.0</span>
        </SettingRow>
      </SettingGroup>
    </>
  );
}

const open = (url: string) => void browser.tabs.create({ url }).catch(() => window.open(url, '_blank', 'noopener'));

export function AboutSection() {
  const { state, checking, check } = useUpdate();
  return (
    <AboutView
      state={state}
      checking={checking}
      onCheck={() => void check()}
      onOpen={open}
      onOpenExtensions={() => open(`${/\bEdg\//.test(navigator.userAgent) ? 'edge' : 'chrome'}://extensions/?id=${browser.runtime.id}`)}
    />
  );
}

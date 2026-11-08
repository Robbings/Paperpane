import { useRef, useState, type RefObject } from 'react';
import { Button, Checkbox, Icon, IconButton, Menu, Popover, Segmented, Spinner, Tooltip, type MenuEntry } from '@/ui/components';
import { columnLabels, optionalColumns } from './columns';
import type { ColumnId, LibraryViewPreferences, SearchField } from './types';

export const searchFieldLabels: Record<SearchField, string> = {
  title: '标题',
  authors: '作者',
  abstract: '摘要',
  venue: '期刊 / 会议',
  note: '短注释',
  body: '正文',
  summary: 'AI 概览',
};

const fieldOrder: SearchField[] = ['title', 'authors', 'abstract', 'venue', 'note', 'body', 'summary'];

export type ImportKind = 'pdf' | 'csl' | 'bibtex';

interface LibraryToolbarProps {
  heading: string;
  count: number;
  /** What is counted; papers unless said otherwise (the trash also holds folders). */
  countUnit?: string;
  text: string;
  onText: (text: string) => void;
  fields: readonly SearchField[];
  onFields: (fields: SearchField[]) => void;
  prefs: LibraryViewPreferences;
  onPrefs: (patch: Partial<LibraryViewPreferences>) => void;
  onResetColumns: () => void;
  onImport: (kind: ImportKind, files: File[]) => void;
  /** Adds "从网址导入 PDF…" to the import menu. */
  onImportUrl?: () => void;
  onImportZotero?: () => void;
  onRestoreBackup?: () => void;
  /** The import queue's button, shown while there are jobs. */
  tasks?: { ref: RefObject<HTMLButtonElement | null>; active: number; failed: number; open: boolean; onToggle: () => void };
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
}

type Open = 'scope' | 'view' | 'import' | null;

const accept: Record<ImportKind, string> = {
  pdf: 'application/pdf,.pdf',
  csl: 'application/json,.json',
  bibtex: '.bib,.bibtex,text/plain',
};

/** The list card's header: pane toggles, the heading, search, view options and import. */
export function LibraryToolbar(props: LibraryToolbarProps) {
  const { text, fields, prefs } = props;
  const [open, setOpen] = useState<Open>(null);
  const scopeRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const importRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importKind, setImportKind] = useState<ImportKind>('pdf');

  const anchorOf = (button: HTMLButtonElement | null) => {
    const box = button?.getBoundingClientRect();
    return box ? { x: box.right, y: box.bottom + 6 } : { x: 0, y: 0 };
  };

  const allFields = fields.length === fieldOrder.length;
  const scopeSummary = allFields ? '全部字段' : fields.length === 1 ? searchFieldLabels[fields[0]!] : `${fields.length} 个字段`;
  const scopeEntries: MenuEntry[] = fieldOrder.map((field) => ({
    id: field,
    label: searchFieldLabels[field],
    checked: fields.includes(field),
    // At least one field stays selected.
    disabled: fields.length === 1 && fields.includes(field),
  }));
  const importEntries: MenuEntry[] = [
    { id: 'pdf', label: '导入 PDF 文件…', icon: 'file' },
    ...(props.onImportUrl ? [{ id: 'url', label: '从网址导入 PDF…', icon: 'link' } as MenuEntry] : []),
    ...(props.onImportZotero?[{id:'zotero',label:'从 Zotero 导入…',icon:'library'} as MenuEntry]:[]),
    ...(props.onRestoreBackup?[{id:'restore-backup',label:'恢复备份…',icon:'file'} as MenuEntry]:[]),
    { kind: 'separator', id: 'sep-bib' },
    { id: 'csl', label: '导入 CSL JSON 书目…', icon: 'quote' },
    { id: 'bibtex', label: '导入 BibTeX 书目…', icon: 'quote' },
  ];

  const toggleColumn = (column: ColumnId) =>
    props.onPrefs({
      visibleColumns: prefs.visibleColumns.includes(column)
        ? prefs.visibleColumns.filter((c) => c !== column)
        : optionalColumns.filter((c) => c === column || prefs.visibleColumns.includes(c)),
    });

  return (
    <header className="pp-lib-head">
      <IconButton
        icon={props.sidebarOpen ? 'sidebarShown' : 'sidebar'}
        label={props.sidebarOpen ? '隐藏侧栏' : '显示侧栏'}
        shape="pill"
        aria-pressed={props.sidebarOpen}
        onClick={props.onToggleSidebar}
      />
      <div className="pp-lib-head__title">
        <h1>{props.heading}</h1>
        <span className="pp-lib-head__count">{props.count} {props.countUnit ?? '篇'}</span>
      </div>

      <div className="pp-lib-search" role="search">
        <Icon name="search" size={14} className="pp-lib-search__icon" />
        <input
          type="search"
          aria-label="搜索文献库"
          placeholder="搜索"
          value={text}
          onChange={(event) => props.onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && text) {
              event.stopPropagation();
              props.onText('');
            }
          }}
        />
        <Tooltip label={`搜索范围：${scopeSummary}`} labelsChild>
          <button
            ref={scopeRef}
            type="button"
            className="pp-lib-search__scope"
            data-narrowed={allFields ? undefined : 'true'}
            aria-label={`搜索范围：${scopeSummary}`}
            aria-haspopup="menu"
            aria-expanded={open === 'scope'}
            onClick={() => setOpen(open === 'scope' ? null : 'scope')}
          >
            <Icon name="filter" size={14} strokeWidth={1.8} />
          </button>
        </Tooltip>
      </div>

      <IconButton
        ref={viewRef}
        icon="settings"
        label="视图选项"
        shape="pill"
        aria-haspopup="dialog"
        aria-expanded={open === 'view'}
        tooltip={open !== 'view'}
        onClick={() => setOpen(open === 'view' ? null : 'view')}
      />
      {props.tasks && (
        <Tooltip label={props.tasks.active ? `导入任务：${props.tasks.active} 项进行中` : props.tasks.failed ? `导入任务：${props.tasks.failed} 项失败` : '导入任务'} labelsChild disabled={props.tasks.open}>
          <button
            ref={props.tasks.ref}
            type="button"
            className="pp-lib-tasks"
            data-state={props.tasks.active ? 'active' : props.tasks.failed ? 'failed' : 'done'}
            aria-label={props.tasks.active ? `导入任务，${props.tasks.active} 项进行中` : '导入任务'}
            aria-haspopup="dialog"
            aria-expanded={props.tasks.open}
            onClick={props.tasks.onToggle}
          >
            {props.tasks.active ? <Spinner size={13} /> : <Icon name={props.tasks.failed ? 'alert' : 'check'} size={14} />}
            {props.tasks.active > 0 && <span>{props.tasks.active}</span>}
          </button>
        </Tooltip>
      )}
      <Button
        ref={importRef}
        size="sm"
        shape="pill"
        variant="primary"
        icon="upload"
        aria-haspopup="menu"
        aria-expanded={open === 'import'}
        onClick={() => setOpen(open === 'import' ? null : 'import')}
      >
        导入
      </Button>
      <IconButton
        icon={props.detailOpen ? 'paneRightShown' : 'paneRight'}
        label={props.detailOpen ? '隐藏详情' : '显示详情'}
        shape="pill"
        aria-pressed={props.detailOpen}
        onClick={props.onToggleDetail}
      />

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept={accept[importKind]}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) props.onImport(importKind, files);
          event.target.value = '';
        }}
      />

      {open === 'scope' && (
        <Menu
          label="搜索范围"
          entries={scopeEntries}
          anchor={anchorOf(scopeRef.current)}
          align="end"
          multiple
          triggerRef={scopeRef}
          onSelect={(id) => {
            const field = id as SearchField;
            props.onFields(fields.includes(field) ? fields.filter((f) => f !== field) : fieldOrder.filter((f) => f === field || fields.includes(f)));
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'import' && (
        <Menu
          label="导入"
          entries={importEntries}
          anchor={anchorOf(importRef.current)}
          align="end"
          triggerRef={importRef}
          onSelect={(id) => {
            if(id==='zotero'){props.onImportZotero?.();return;}
            if(id==='restore-backup'){props.onRestoreBackup?.();return;}
            if (id === 'url') {
              props.onImportUrl?.();
              return;
            }
            setImportKind(id as ImportKind);
            // Let the accept attribute update before opening the picker.
            window.setTimeout(() => fileRef.current?.click(), 0);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      <Popover anchorRef={viewRef} open={open === 'view'} onClose={() => setOpen(null)} label="视图选项" placement="bottom-end" width={232}>
        <div className="pp-lib-view">
          <Segmented
            label="列表视图"
            size="sm"
            stretch
            options={[
              { value: 'compact', label: '简洁' },
              { value: 'detailed', label: '详细' },
            ]}
            value={prefs.mode}
            onChange={(mode) => props.onPrefs({ mode })}
          />
          <section className="pp-lib-view__section" aria-label="显示的列">
            <h3 className="pp-lib-view__label">显示的列</h3>
            {prefs.mode === 'detailed' ? (
              <p className="pp-lib-view__hint">详细视图在每一行里显示作者、来源、年份和摘要，不分列。</p>
            ) : (
              <>
                {optionalColumns.map((column) => (
                  <Checkbox key={column} label={columnLabels[column]} checked={prefs.visibleColumns.includes(column)} onChange={() => toggleColumn(column)} />
                ))}
                <p className="pp-lib-view__hint">窗口较窄时，放不下的列会暂时隐去。</p>
              </>
            )}
          </section>
          {prefs.mode === 'compact' && (
            <Button size="sm" variant="quiet" className="pp-lib-view__reset" onClick={props.onResetColumns}>
              恢复默认列
            </Button>
          )}
        </div>
      </Popover>
    </header>
  );
}

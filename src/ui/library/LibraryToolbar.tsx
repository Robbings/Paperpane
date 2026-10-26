import { useRef, useState } from 'react';
import { Button, Checkbox, Icon, IconButton, Menu, Popover, Segmented, Tooltip, type MenuEntry } from '@/ui/components';
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
  text: string;
  onText: (text: string) => void;
  fields: readonly SearchField[];
  onFields: (fields: SearchField[]) => void;
  prefs: LibraryViewPreferences;
  onPrefs: (patch: Partial<LibraryViewPreferences>) => void;
  onResetColumns: () => void;
  onImport: (kind: ImportKind, files: File[]) => void;
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
        <span className="pp-lib-head__count">{props.count} 篇</span>
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
            {!allFields && <span>{scopeSummary}</span>}
            <Icon name="chevronDown" size={12} strokeWidth={2} />
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

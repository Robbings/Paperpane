import { useRef, useState, type RefObject } from 'react';
import { Button, GlassSurface, Icon, IconButton, Menu, Segmented, Tooltip, type MenuEntry } from '@/ui/components';
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
  text: string;
  onText: (text: string) => void;
  fields: readonly SearchField[];
  onFields: (fields: SearchField[]) => void;
  starredOnly: boolean;
  onStarredOnly: (on: boolean) => void;
  prefs: LibraryViewPreferences;
  onPrefs: (patch: Partial<LibraryViewPreferences>) => void;
  onResetColumns: () => void;
  onImport: (kind: ImportKind, files: File[]) => void;
}

type OpenMenu = 'scope' | 'columns' | 'import' | null;

const accept: Record<ImportKind, string> = {
  pdf: 'application/pdf,.pdf',
  csl: 'application/json,.json',
  bibtex: '.bib,.bibtex,text/plain',
};

export function LibraryToolbar(props: LibraryToolbarProps) {
  const { text, fields, starredOnly, prefs } = props;
  const [menu, setMenu] = useState<OpenMenu>(null);
  const scopeRef = useRef<HTMLButtonElement>(null);
  const columnsRef = useRef<HTMLButtonElement>(null);
  const importRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importKind, setImportKind] = useState<ImportKind>('pdf');

  const anchorOf = (ref: RefObject<HTMLButtonElement | null>, align: 'start' | 'end') => {
    const box = ref.current?.getBoundingClientRect();
    return box ? { x: align === 'end' ? box.right : box.left, y: box.bottom + 6 } : { x: 0, y: 0 };
  };

  const scopeEntries: MenuEntry[] = fieldOrder.map((field) => ({
    id: field,
    label: searchFieldLabels[field],
    checked: fields.includes(field),
    // At least one field stays selected.
    disabled: fields.length === 1 && fields.includes(field),
  }));
  const columnEntries: MenuEntry[] = [
    ...optionalColumns.map((column) => ({ id: column, label: columnLabels[column], checked: prefs.visibleColumns.includes(column) })),
    { kind: 'separator' as const, id: 'sep' },
    { id: 'reset', label: '恢复默认列' },
  ];
  const importEntries: MenuEntry[] = [
    { id: 'pdf', label: '导入 PDF 文件…', icon: 'file' },
    { id: 'csl', label: '导入 CSL JSON 书目…', icon: 'quote' },
    { id: 'bibtex', label: '导入 BibTeX 书目…', icon: 'quote' },
  ];

  const scopeSummary = fields.length === fieldOrder.length ? '全部字段' : fields.length === 1 ? searchFieldLabels[fields[0]!] : `${fields.length} 个字段`;

  return (
    <GlassSurface as="header" tone="bar" radius="pill" className="pp-lib-toolbar">
      <div className="pp-lib-search" role="search">
        <Icon name="search" size={15} className="pp-lib-search__icon" />
        <input
          type="search"
          aria-label="搜索文献库"
          placeholder="搜索标题、作者、摘要…"
          value={text}
          onChange={(event) => props.onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && text) {
              event.stopPropagation();
              props.onText('');
            }
          }}
        />
        <Tooltip label="选择搜索范围" labelsChild>
          <button
            ref={scopeRef}
            type="button"
            className="pp-lib-search__scope"
            aria-label={`搜索范围：${scopeSummary}`}
            aria-haspopup="menu"
            aria-expanded={menu === 'scope'}
            onClick={() => setMenu(menu === 'scope' ? null : 'scope')}
          >
            {scopeSummary}
            <Icon name="chevronDown" size={12} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>

      <IconButton icon="star" label="只看标星" shape="pill" active={starredOnly} aria-pressed={starredOnly} onClick={() => props.onStarredOnly(!starredOnly)} />

      <span className="pp-lib-toolbar__sep" aria-hidden="true" />

      <Segmented
        label="列表视图"
        size="sm"
        options={[
          { value: 'compact', label: '简洁' },
          { value: 'detailed', label: '详细' },
        ]}
        value={prefs.mode}
        onChange={(mode) => props.onPrefs({ mode })}
      />
      <IconButton
        ref={columnsRef}
        icon="columns"
        label="显示的列"
        shape="pill"
        aria-haspopup="menu"
        aria-expanded={menu === 'columns'}
        tooltip={menu !== 'columns'}
        onClick={() => setMenu(menu === 'columns' ? null : 'columns')}
      />

      <span className="pp-lib-toolbar__sep" aria-hidden="true" />

      <Button
        ref={importRef}
        size="sm"
        shape="pill"
        variant="primary"
        icon="upload"
        aria-haspopup="menu"
        aria-expanded={menu === 'import'}
        onClick={() => setMenu(menu === 'import' ? null : 'import')}
      >
        导入
      </Button>
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

      {menu === 'scope' && (
        <Menu
          label="搜索范围"
          entries={scopeEntries}
          anchor={anchorOf(scopeRef, 'end')}
          align="end"
          triggerRef={scopeRef}
          onSelect={(id) => {
            const field = id as SearchField;
            props.onFields(fields.includes(field) ? fields.filter((f) => f !== field) : fieldOrder.filter((f) => f === field || fields.includes(f)));
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'columns' && (
        <Menu
          label="显示的列"
          entries={columnEntries}
          anchor={anchorOf(columnsRef, 'end')}
          align="end"
          triggerRef={columnsRef}
          onSelect={(id) => {
            if (id === 'reset') {
              props.onResetColumns();
              return;
            }
            const column = id as ColumnId;
            const visible = prefs.visibleColumns.includes(column)
              ? prefs.visibleColumns.filter((c) => c !== column)
              : [...prefs.visibleColumns, column];
            props.onPrefs({ visibleColumns: visible });
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'import' && (
        <Menu
          label="导入"
          entries={importEntries}
          anchor={anchorOf(importRef, 'end')}
          align="end"
          triggerRef={importRef}
          onSelect={(id) => {
            setImportKind(id as ImportKind);
            // Let the accept attribute update before opening the picker.
            window.setTimeout(() => fileRef.current?.click(), 0);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </GlassSurface>
  );
}

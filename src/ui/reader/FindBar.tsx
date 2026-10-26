import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GlassSurface, Icon, IconButton, Tooltip } from '@/ui/components';
import type { ReaderSearchState } from './types';

interface FindBarProps {
  search: ReaderSearchState;
  /** Text to start with when the bar opens (the current selection), instead of the last query. */
  initialQuery?: string;
  onSearch: (query: string, options: { matchCase: boolean; wholeWord: boolean }) => void;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
  style?: CSSProperties;
}

/**
 * Find in the paper: a small glass bar under the toolbar. Searches as you type;
 * Enter / Shift+Enter step through the matches, Esc closes.
 */
export function FindBar({ search, initialQuery, onSearch, onStep, onClose, style }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery ?? search.query);
  const [matchCase, setMatchCase] = useState(search.matchCase);
  const [wholeWord, setWholeWord] = useState(search.wholeWord);

  const run = (next: { query?: string; matchCase?: boolean; wholeWord?: boolean }) => {
    const options = { matchCase: next.matchCase ?? matchCase, wholeWord: next.wholeWord ?? wholeWord };
    onSearch(next.query ?? query, options);
  };

  // Opening: search again for what is in the box (marks were cleared on close) and select it for retyping.
  useEffect(() => {
    if (query) run({});
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []); // only on open

  const empty = query.trim() === '';
  const status = empty
    ? ''
    : search.status === 'searching' && search.total === 0
      ? '查找中…'
      : search.total === 0
        ? '无结果'
        : `${search.current} / ${search.total}`;
  const canStep = !empty && search.total > 0;

  return (
    <GlassSurface
      tone="float"
      radius="float"
      className="pp-findbar"
      role="search"
      aria-label="在论文中查找"
      style={style}
      data-empty={!empty && search.status === 'done' && search.total === 0 ? 'true' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <Icon name="search" size={15} className="pp-findbar__icon" />
      <input
        ref={inputRef}
        className="pp-findbar__input"
        aria-label="查找内容"
        placeholder="在论文中查找"
        value={query}
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          run({ query: event.target.value });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canStep) onStep(event.shiftKey ? -1 : 1);
          }
        }}
      />
      <span className="pp-findbar__status" aria-live="polite">
        {status}
      </span>

      <Tooltip label="区分大小写" labelsChild>
        <button
          type="button"
          className="pp-findbar__toggle"
          aria-label="区分大小写"
          aria-pressed={matchCase}
          onClick={() => {
            setMatchCase(!matchCase);
            run({ matchCase: !matchCase });
          }}
        >
          Aa
        </button>
      </Tooltip>
      <Tooltip label="全词匹配" labelsChild>
        <button
          type="button"
          className="pp-findbar__toggle pp-findbar__toggle--word"
          aria-label="全词匹配"
          aria-pressed={wholeWord}
          onClick={() => {
            setWholeWord(!wholeWord);
            run({ wholeWord: !wholeWord });
          }}
        >
          ab
        </button>
      </Tooltip>

      <span className="pp-findbar__sep" aria-hidden="true" />
      <IconButton icon="chevronUp" label="上一个" shortcut="⇧Enter" size="md" shape="pill" disabled={!canStep} onClick={() => onStep(-1)} />
      <IconButton icon="chevronDown" label="下一个" shortcut="Enter" size="md" shape="pill" disabled={!canStep} onClick={() => onStep(1)} />
      <IconButton icon="close" label="关闭查找" shortcut="Esc" size="md" shape="pill" onClick={onClose} />
    </GlassSurface>
  );
}

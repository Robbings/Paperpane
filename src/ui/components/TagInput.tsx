import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { layerFor, useAnchoredPosition } from './useAnchoredPosition';
import './TagInput.css';

export interface TagOption {
  id: string;
  label: string;
}

interface TagInputProps {
  label: string;
  selected: readonly TagOption[];
  /** Existing tags offered as suggestions (sorted by name). */
  options: readonly TagOption[];
  /** Adds an existing tag (by id) or creates one from text (id undefined). */
  onAdd: (tag: { id?: string; label: string }) => void;
  onRemove: (id: string) => void;
  placeholder?: string;
}

/** Chips plus a text box: Enter picks a suggestion or creates a new tag, Backspace removes the last. */
export function TagInput({ label, selected, options, onAdd, onRemove, placeholder = '添加标签' }: TagInputProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const query = text.trim().toLowerCase();
  const suggestions = useMemo(() => {
    const chosen = new Set(selected.map((tag) => tag.id));
    return options
      .filter((tag) => !chosen.has(tag.id) && tag.label.toLowerCase().includes(query))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
      .slice(0, 8);
  }, [options, selected, query]);
  const exact = options.some((tag) => tag.label.toLowerCase() === query);
  const canCreate = query.length > 0 && !exact;
  const entries = [...suggestions.map((tag) => ({ ...tag, create: false })), ...(canCreate ? [{ id: '', label: text.trim(), create: true }] : [])];

  const add = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    onAdd(entry.create ? { label: entry.label } : { id: entry.id, label: entry.label });
    setText('');
    setActive(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && entries.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % entries.length);
    } else if (event.key === 'ArrowUp' && entries.length) {
      event.preventDefault();
      setActive((i) => (i - 1 + entries.length) % entries.length);
    } else if (event.key === 'Enter' && (query || open)) {
      event.preventDefault();
      add(active);
    } else if (event.key === 'Backspace' && !text && selected.length) {
      onRemove(selected[selected.length - 1]!.id);
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  const showList = open && entries.length > 0;
  // The list floats in its own layer so scrolling containers do not clip it.
  const position = useAnchoredPosition(boxRef, listRef, showList, 'bottom-start', 6);

  return (
    <div ref={boxRef} className="pp-tags" onClick={() => inputRef.current?.focus()}>
      <ul className="pp-tags__chips" aria-label={`已选${label}`}>
        {selected.map((tag) => (
          <li key={tag.id} className="pp-tags__chip">
            <span>{tag.label}</span>
            <button
              type="button"
              aria-label={`移除标签 ${tag.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(tag.id);
              }}
            >
              <Icon name="close" size={10} strokeWidth={2.2} />
            </button>
          </li>
        ))}
        <li className="pp-tags__entry">
          <input
            ref={inputRef}
            role="combobox"
            aria-label={label}
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            value={text}
            placeholder={selected.length ? '' : placeholder}
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
        </li>
      </ul>
      {showList &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={`${label}建议`}
            className="pp-glass pp-tags__list"
            data-tone="float"
            data-pp-floating=""
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: boxRef.current?.offsetWidth,
              visibility: position ? undefined : 'hidden',
            }}
          >
            {entries.map((entry, index) => (
              <li
                key={entry.create ? 'create' : entry.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className="pp-tags__option"
                onPointerEnter={() => setActive(index)}
                // Keep focus in the input while picking.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => add(index)}
              >
                {entry.create ? (
                  <>
                    <Icon name="plus" size={13} strokeWidth={2} />
                    新建标签「{entry.label}」
                  </>
                ) : (
                  entry.label
                )}
              </li>
            ))}
          </ul>,
          layerFor(boxRef.current),
        )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { Menu, type MenuEntry } from './Menu';
import './Select.css';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Shorter text for the closed button, when the menu needs more to tell options apart. */
  shortLabel?: string;
  /** Options with different groups are separated by a line, in the order given. */
  group?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name. */
  label: string;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Stretch to the container's width. */
  block?: boolean;
  className?: string;
}

/** A button showing the current choice that opens a menu of the options. */
export function Select<T extends string>({ options, value, onChange, label, placeholder = '请选择', size = 'md', disabled, block, className }: SelectProps<T>) {
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const current = options.find((option) => option.value === value);

  const entries: MenuEntry[] = [];
  options.forEach((option, index) => {
    if (index > 0 && options[index - 1]!.group !== option.group) entries.push({ kind: 'separator', id: `sep-${option.value}` });
    entries.push({ id: option.value, label: option.label, checked: option.value === value, disabled: option.disabled });
  });

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={['pp-select', className].filter(Boolean).join(' ')}
        data-size={size}
        data-block={block ? 'true' : undefined}
        data-empty={current ? undefined : 'true'}
        aria-label={`${label}：${current?.label ?? placeholder}`}
        title={current && current.shortLabel ? current.label : undefined}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        disabled={disabled}
        onClick={() => {
          if (anchor) {
            setAnchor(null);
            return;
          }
          const box = ref.current?.getBoundingClientRect();
          if (box) setAnchor({ x: box.left, y: box.bottom + 4 });
        }}
      >
        <span className="pp-select__text">{current?.shortLabel ?? current?.label ?? placeholder}</span>
        <Icon name="chevronDown" size={11} strokeWidth={2.2} />
      </button>
      {anchor && (
        <Menu
          label={label}
          entries={entries}
          anchor={anchor}
          triggerRef={ref}
          onSelect={(id) => id !== value && onChange(id as T)}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

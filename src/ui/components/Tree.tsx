import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './Tree.css';

export interface TreeNode {
  id: string;
  parentId: string | null;
  label: string;
  icon?: IconName;
  /** Shown at the end of the row, e.g. the number of papers. */
  count?: number;
}

/** Drag type for moving tree nodes; other types go to onExternalDrop. */
export const TREE_DRAG_TYPE = 'application/x-paperpane-tree-node';

interface TreeProps {
  /** Accessible name, e.g. "文件夹". */
  label: string;
  nodes: readonly TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string, expanded: boolean) => void;
  /** The node being renamed inline (F2 or a menu action starts it). */
  renamingId?: string | null;
  onRenameStart?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onRenameCancel?: () => void;
  onContextMenu?: (id: string, point: { x: number; y: number }) => void;
  /** Moving a node under another (null = top level). Return false to refuse. */
  onMove?: (id: string, newParentId: string | null) => void;
  canMove?: (id: string, newParentId: string | null) => boolean;
  /** Drops of other kinds (e.g. papers dragged from a list). */
  acceptsExternal?: (types: readonly string[]) => boolean;
  onExternalDrop?: (targetId: string, data: DataTransfer) => void;
  /** Extra content after the label, e.g. a hover action. */
  renderTrailing?: (node: TreeNode) => ReactNode;
}

interface Row {
  node: TreeNode;
  level: number;
  hasChildren: boolean;
}

function visibleRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>): Row[] {
  const byParent = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  const rows: Row[] = [];
  const walk = (parentId: string | null, level: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      const hasChildren = (byParent.get(node.id)?.length ?? 0) > 0;
      rows.push({ node, level, hasChildren });
      if (hasChildren && expanded.has(node.id)) walk(node.id, level + 1);
    }
  };
  walk(null, 1);
  return rows;
}

/**
 * A keyboard-navigable tree (arrows, Enter, F2) with inline rename and
 * drag-to-move. Children are sorted by name.
 */
export function Tree({
  label,
  nodes,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
  renamingId,
  onRenameStart,
  onRename,
  onRenameCancel,
  onContextMenu,
  onMove,
  canMove,
  acceptsExternal,
  onExternalDrop,
  renderTrailing,
}: TreeProps) {
  const rows = visibleRows(nodes, expandedIds);
  const [focusId, setFocusId] = useState<string | null>(selectedId ?? rows[0]?.node.id ?? null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusTarget = rows.some((row) => row.node.id === focusId) ? focusId : (rows[0]?.node.id ?? null);

  const focusRow = (id: string) => {
    setFocusId(id);
    listRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, row: Row) => {
    if (renamingId === row.node.id) return;
    const index = rows.findIndex((r) => r.node.id === row.node.id);
    const expanded = expandedIds.has(row.node.id);
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case 'ArrowDown':
        handled();
        if (rows[index + 1]) focusRow(rows[index + 1]!.node.id);
        break;
      case 'ArrowUp':
        handled();
        if (rows[index - 1]) focusRow(rows[index - 1]!.node.id);
        break;
      case 'ArrowRight':
        handled();
        if (row.hasChildren && !expanded) onToggle(row.node.id, true);
        else if (row.hasChildren && rows[index + 1]) focusRow(rows[index + 1]!.node.id);
        break;
      case 'ArrowLeft':
        handled();
        if (row.hasChildren && expanded) onToggle(row.node.id, false);
        else if (row.node.parentId) focusRow(row.node.parentId);
        break;
      case 'Home':
        handled();
        if (rows[0]) focusRow(rows[0].node.id);
        break;
      case 'End':
        handled();
        if (rows.length) focusRow(rows[rows.length - 1]!.node.id);
        break;
      case 'Enter':
      case ' ':
        handled();
        onSelect(row.node.id);
        break;
      case 'F2':
        if (onRenameStart) {
          handled();
          onRenameStart(row.node.id);
        }
        break;
    }
  };

  const allowDrop = (event: DragEvent, targetId: string) => {
    const types = Array.from(event.dataTransfer.types);
    if (types.includes(TREE_DRAG_TYPE)) return Boolean(onMove);
    return Boolean(acceptsExternal?.(types) && targetId);
  };

  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    setDropTarget(null);
    const moving = event.dataTransfer.getData(TREE_DRAG_TYPE);
    if (moving) {
      if (moving !== targetId && (canMove?.(moving, targetId) ?? true)) onMove?.(moving, targetId);
      return;
    }
    // Handled here: an ancestor drop zone (e.g. the whole library) must not import it again.
    event.stopPropagation();
    onExternalDrop?.(targetId, event.dataTransfer);
  };

  return (
    <ul ref={listRef} role="tree" aria-label={label} className="pp-tree">
      {rows.map((row) => {
        const { node, level, hasChildren } = row;
        const expanded = expandedIds.has(node.id);
        const selected = node.id === selectedId;
        return (
          <li
            key={node.id}
            role="treeitem"
            aria-level={level}
            aria-selected={selected}
            aria-expanded={hasChildren ? expanded : undefined}
            tabIndex={node.id === focusTarget ? 0 : -1}
            data-node-id={node.id}
            data-drop={dropTarget === node.id ? 'true' : undefined}
            className="pp-tree__row"
            style={{ paddingLeft: 6 + (level - 1) * 14 }}
            draggable={Boolean(onMove) && renamingId !== node.id}
            onDragStart={(event) => {
              event.dataTransfer.setData(TREE_DRAG_TYPE, node.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              if (!allowDrop(event, node.id)) return;
              event.preventDefault();
              setDropTarget(node.id);
            }}
            onDragLeave={() => setDropTarget((current) => (current === node.id ? null : current))}
            onDrop={(event) => onDrop(event, node.id)}
            onFocus={() => setFocusId(node.id)}
            onKeyDown={(event) => onKeyDown(event, row)}
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => onRenameStart?.(node.id)}
            onContextMenu={(event: MouseEvent) => {
              if (!onContextMenu) return;
              event.preventDefault();
              onContextMenu(node.id, { x: event.clientX, y: event.clientY });
            }}
          >
            <span
              className="pp-tree__twisty"
              data-expanded={expanded ? 'true' : undefined}
              aria-hidden="true"
              onClick={(event) => {
                if (!hasChildren) return;
                event.stopPropagation();
                onToggle(node.id, !expanded);
              }}
            >
              {hasChildren && <Icon name="chevronRight" size={12} strokeWidth={2} />}
            </span>
            {node.icon && <Icon name={node.icon} size={16} className="pp-tree__icon" />}
            {renamingId === node.id ? (
              <RenameInput
                initial={node.label}
                onDone={(name) => onRename?.(node.id, name)}
                onCancel={() => {
                  onRenameCancel?.();
                  focusRow(node.id);
                }}
              />
            ) : (
              <span className="pp-tree__label">{node.label}</span>
            )}
            {renderTrailing?.(node)}
            {node.count !== undefined && <span className="pp-tree__count">{node.count}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function RenameInput({ initial, onDone, onCancel }: { initial: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    const name = value.trim();
    if (name && name !== initial) onDone(name);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      className="pp-tree__rename"
      aria-label="新名称"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') onCancel();
      }}
      onBlur={commit}
    />
  );
}

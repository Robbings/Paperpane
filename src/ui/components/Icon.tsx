// Paperpane line icons, drawn on a 24 × 24 grid with round caps and joins.
// An entry may add a soft fill under the strokes to show an "on" state
// without relying on colour.
type IconPath = string | { d: string; fill: string };

const paths = {
  sidebar: 'M4 5h16v14H4z M9.5 5v14',
  sidebarShown: { d: 'M4 5h16v14H4z M9.5 5v14', fill: 'M4 5h5.5v14H4z' },
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5 20 20',
  minus: 'M7 12h10',
  plus: 'M12 7v10 M7 12h10',
  rotate: 'M18.5 12a6.5 6.5 0 1 1-1.9-4.6 M18.5 4.5v3.6h-3.6',
  marker: 'M4.5 19.5h6 M14.5 4.5l5 5-8.5 8.5H6.5v-4.5z',
  region: 'M4.5 8.5v-4h4 M15.5 4.5h4v4 M19.5 15.5v4h-4 M8.5 19.5h-4v-4',
  settings: 'M4 7.5h9 M17 7.5h3 M4 16.5h3 M11 16.5h9 M15 5.5v4 M9 14.5v4',
  export: 'M12 4.5v10 M8 8l4-3.5L16 8 M5.5 13.5v6h13v-6',
  dockRight: 'M4 5h16v14H4z M14.5 5v14',
  dockBottom: 'M4 5h16v14H4z M4 14.5h16',
  moon: 'M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 3.5v1.8 M12 18.7v1.8 M3.5 12h1.8 M18.7 12h1.8 M6 6l1.3 1.3 M16.7 16.7 18 18 M6 18l1.3-1.3 M16.7 7.3 18 6',
  copy: 'M9 9h10v10H9z M5.5 15V5h10',
  overview: 'M5 5h14v14H5z M8.5 9h7 M8.5 12.5h7 M8.5 16h4',
  discuss: 'M5 6h14v9h-8l-4 3.5V15H5z',
  explain: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M9.7 9.7a2.3 2.3 0 1 1 3.2 2.1c-.6.3-.9.7-.9 1.3v.3 M12 16.2v.3',
  notes: 'M7 4h7l4 4v12H7z M14 4v4h4 M10 12.5h5 M10 16h5',
  cite: 'M6 10.5V7h4v3.5c0 2.6-1.3 4.6-3.6 5.5 M14 10.5V7h4v3.5c0 2.6-1.3 4.6-3.6 5.5',
  comment: 'M6 5h12v11h-5l-4 3v-3H6z M9 9.5h6 M9 12.5h4',
  translate: 'M4 6h9 M8.5 4v2 M6 6c.6 3 2.6 5.3 5 6.3 M11 6c-.6 3-2.6 5.3-5 6.3 M13 20l3.5-8 3.5 8 M14.2 17.3h4.6',
  ask: 'M5 6h14v9h-8l-4 3.5V15H5z M10.4 9.3a1.7 1.7 0 1 1 2.3 1.6c-.4.2-.7.5-.7 1 M12 13.6v.2',
  trash: 'M5 7h14 M9.5 7V5h5v2 M7 7l1 12.5h8L17 7 M10.5 10.5v6 M13.5 10.5v6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
  chevronDown: 'M7 10l5 5 5-5',
  chevronRight: 'M10 7l5 5-5 5',
  more: 'M6 12h.01 M12 12h.01 M18 12h.01',
} satisfies Record<string, IconPath>;

export type IconName = keyof typeof paths;

export const iconNames = Object.keys(paths) as IconName[];

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Give a title only when the icon carries meaning on its own. */
  title?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.6, className, title }: IconProps) {
  const path: IconPath = paths[name];
  const d = typeof path === 'string' ? path : path.d;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? strokeWidth * 1.6 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {typeof path !== 'string' && <path d={path.fill} fill="currentColor" stroke="none" opacity={0.28} />}
      <path d={d} />
    </svg>
  );
}

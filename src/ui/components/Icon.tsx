// Paperpane line icons, drawn on a 24 × 24 grid with round caps and joins.
// An entry may add a soft fill under the strokes to show an "on" state
// without relying on colour.
type IconPath = string | { d: string; fill: string };

const paths = {
  sidebar: 'M4 5h16v14H4z M9.5 5v14',
  sidebarShown: { d: 'M4 5h16v14H4z M9.5 5v14', fill: 'M4 5h5.5v14H4z' },
  paneRight: 'M4 5h16v14H4z M14.5 5v14',
  paneRightShown: { d: 'M4 5h16v14H4z M14.5 5v14', fill: 'M14.5 5H20v14h-5.5z' },
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
  exclaim: 'M12 6.5v7 M12 17.2v.3',
  alert: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 8v4.8 M12 15.8v.3',
  lock: 'M7 11h10v8H7z M9 11V8.5a3 3 0 0 1 6 0V11',
  file: 'M7 4h7l4 4v12H7z M14 4v4h4',
  upload: 'M12 15V5 M8 9l4-4 4 4 M5 15v4h14v-4',
  close: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
  chevronDown: 'M7 10l5 5 5-5',
  chevronUp: 'M7 14l5-5 5 5',
  link: 'M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1 M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1',
  float: 'M9 9h11v10H9z M15 5H4v10',
  sliders: 'M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4',
  sync: 'M19.5 9A8 8 0 0 0 5.2 7.8 M4.5 15a8 8 0 0 0 14.3 1.2 M19.5 4.5V9H15 M4.5 19.5V15H9',
  model: 'M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5z M4.5 7.75L12 12l7.5-4.25 M12 12v8.5',
  chevronRight: 'M10 7l5 5-5 5',
  chevronLeft: 'M14 7l-5 5 5 5',
  more: 'M6 12h.01 M12 12h.01 M18 12h.01',
  folder: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z',
  folderPlus: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z M12 10.5v5 M9.5 13h5',
  library: 'M5.5 4.5v15 M9.5 4.5v15 M13.5 5.5l4.5 13.5',
  clock: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 8v4.5l3 2',
  inbox: 'M4 13l2.5-7.5h11L20 13v6H4z M4 13h4.5l1 2h5l1-2H20',
  tag: 'M4.5 12.5V5h7.5l7.5 7.5-7.5 7.5z M8.5 8.5h.01',
  star: 'M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z',
  columns: 'M4 5h16v14H4z M10 5v14 M15 5v14',
  listCompact: 'M5 7h14 M5 12h14 M5 17h14',
  listDetailed: 'M5 6h14 M5 9.5h9 M5 14h14 M5 17.5h9',
  openExternal: 'M14 5h5v5 M19 5l-8 8 M17 13.5V19H5V7h5.5',
  bookmark: 'M7 4.5h10v15l-5-3.5-5 3.5z',
  bookmarkFilled: { d: 'M7 4.5h10v15l-5-3.5-5 3.5z', fill: 'M7 4.5h10v15l-5-3.5-5 3.5z' },
  quote: 'M5 7h14 M5 11h14 M5 15h9 M16 15v4l3-2z',
  send: 'M12 18.5V6 M7 11l5-5 5 5',
  stop: { d: 'M8 8h8v8H8z', fill: 'M8 8h8v8H8z' },
  edit: 'M5 19l1-4 9.5-9.5 3 3L9 18z M13.5 7.5l3 3',
  image: 'M4.5 5.5h15v13h-15z M4.5 15.5l4.5-4.5 4 4 2.5-2.5 4 4 M15 9.5h.01',
  grip: 'M9.5 7h.01 M14.5 7h.01 M9.5 12h.01 M14.5 12h.01 M9.5 17h.01 M14.5 17h.01',
  gauge: 'M4.5 16.5a7.5 7.5 0 1 1 15 0 M12 16.5l3.5-4.5 M12 16.5h.01',
  history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.5 5v3.5H8 M12 8.5V12l2.5 1.5',
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

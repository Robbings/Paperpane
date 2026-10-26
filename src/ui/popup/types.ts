import type { SettingsSection, StatusSummary } from '@/ui/settings/types';

// 扩展图标弹窗的视图模型。当前标签页的形状沿用设置接口草案 D 的 ActiveTabView，
// 加上界面需要的不可打开原因和是否已在文献库。

/** Why the current tab cannot be opened in the reader. */
export type TabBlock =
  /** An ordinary page, not a PDF. */
  | 'not-pdf'
  /** Browser pages, the web store and the like: extensions may not read them. */
  | 'restricted'
  /** A local PDF (file://) while "Allow access to file URLs" is off. */
  | 'file-access'
  /** Already open in the reader. */
  | 'in-reader';

export interface ActiveTabView {
  tabId: number;
  title: string;
  /** Host and path for display only, without query or hash (they may carry signatures). */
  displayUrl: string;
  /** "file" for local files, otherwise the site host; used for the per-site auto-open exception. */
  host: string | null;
  pdf: 'unknown' | 'checking' | 'available' | 'unavailable';
  canOpenInReader: boolean;
  block?: TabBlock;
  /** The same PDF is already in the library. */
  inLibrary?: boolean;
}

/** Opening PDFs in the reader automatically, with sites the reader turned it off for. */
export interface AutoOpenView {
  enabled: boolean;
  /** Whether the current tab's site is excluded; null when the tab has no site. */
  excludedHere: boolean | null;
}

export interface RecentPaperView {
  id: string;
  title: string;
  /** ISO 8601. */
  lastReadAt: string;
  /** 0–1, when known. */
  progress?: number;
}

export interface PopupViewProps {
  /** null while the current tab is being looked at. */
  activeTab: ActiveTabView | null;
  onOpenInReader: (tabId: number) => void;
  /** Opens the browser's page for this extension, where file URL access is switched on. */
  onAllowFileAccess: () => void;
  autoOpen: AutoOpenView;
  onAutoOpen: (enabled: boolean) => void;
  /** Turns auto-open off (true) or back on (false) for the current tab's site. */
  onExcludeHere: (excluded: boolean) => void;
  /** Up to three most recently read papers. */
  recent: readonly RecentPaperView[];
  onOpenRecent: (id: string) => void;
  onOpenLibrary: () => void;
  /** A local PDF: opens the reader with its file picker (a picker inside the popup would close it). */
  onOpenFile: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  status: StatusSummary;
}

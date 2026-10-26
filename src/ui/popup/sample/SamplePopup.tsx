import { useState } from 'react';
import { Toaster, toast } from '@/ui/components';
import { samplePapers } from '@/ui/library/sample/libraryData';
import { useSamplePreferences, useSampleSettings } from '@/ui/settings/sample/useSampleSettings';
import { PopupView } from '../PopupView';
import type { ActiveTabView, RecentPaperView } from '../types';

// 示例接线：用示例数据展示弹窗。?state= 切换当前标签页的几种情况，便于审阅：
// pdf（默认）、checking、not-pdf、restricted、file-access、in-reader、local。

const tabs: Record<string, ActiveTabView | null> = {
  pdf: {
    tabId: 1,
    title: 'Recovering Reading Order in Two-Column Scientific PDFs',
    displayUrl: 'arxiv.org/pdf/2510.01234',
    pdf: 'available',
    canOpenInReader: true,
    inLibrary: true,
  },
  local: {
    tabId: 2,
    title: 'layout-aware-segmentation.pdf',
    displayUrl: '~/Downloads/layout-aware-segmentation.pdf',
    pdf: 'available',
    canOpenInReader: true,
  },
  checking: null,
  'not-pdf': { tabId: 3, title: 'Example', displayUrl: 'example.com', pdf: 'unavailable', canOpenInReader: false, block: 'not-pdf' },
  restricted: { tabId: 4, title: '扩展程序', displayUrl: 'chrome://extensions', pdf: 'unavailable', canOpenInReader: false, block: 'restricted' },
  'file-access': { tabId: 5, title: 'paper.pdf', displayUrl: '~/Downloads/paper.pdf', pdf: 'unavailable', canOpenInReader: false, block: 'file-access' },
  'in-reader': { tabId: 6, title: '阅读器', displayUrl: '', pdf: 'available', canOpenInReader: false, block: 'in-reader' },
};

const state = new URLSearchParams(window.location.search).get('state') ?? 'pdf';

const recent: RecentPaperView[] = samplePapers
  .filter((paper) => paper.lastReadAt)
  .sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''))
  .slice(0, 3)
  .map((paper) => ({ id: paper.id, title: paper.title, lastReadAt: paper.lastReadAt!, progress: paper.progress }));

const open = (path: string) => window.open(path, '_blank', 'noopener');

export function SamplePopup() {
  useSamplePreferences();
  const { status } = useSampleSettings();
  const [autoOpen, setAutoOpen] = useState(true);
  const tab = state in tabs ? tabs[state]! : tabs.pdf!;

  return (
    <>
      <PopupView
        activeTab={tab}
        onOpenInReader={() => open('./reader.html')}
        onAllowFileAccess={() => toast.show({ message: '示例：会打开本扩展的详情页' })}
        autoOpenPdf={autoOpen}
        onAutoOpenPdf={setAutoOpen}
        recent={recent}
        onOpenRecent={() => open('./reader.html')}
        onOpenLibrary={() => open('./library.html')}
        onOpenFile={() => toast.show({ message: '示例：会打开阅读器并弹出选择文件' })}
        onOpenSettings={(section) => open(`./options.html${section ? `#${section}` : ''}`)}
        status={status}
      />
      <Toaster />
    </>
  );
}

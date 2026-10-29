import { lazy, Suspense } from 'react';
import { mountPage } from '@/runtime/mount-page';
import { ComponentGallery } from '@/ui/gallery/ComponentGallery';
import { SelectionBarDemo } from '@/ui/gallery/SelectionBarDemo';
import { applyTheme } from '@/ui/theme';

const params = new URLSearchParams(location.search);
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') applyTheme(theme);

if (params.get('view') === 'reader-archive') {
  // Preserve historical UI fixtures without making them a reader development path.
  const ArchivedReader = lazy(() => import('@/ui/reader/sample/ArchivedReaderPage').then(module => ({ default: module.ArchivedReaderPage })));
  document.title = '历史样例（仅存档）· Paperpane';
  mountPage(<Suspense fallback={null}><ArchivedReader /></Suspense>);
} else {
  mountPage(params.get('view') === 'selbar' ? <SelectionBarDemo /> : <ComponentGallery />);
}

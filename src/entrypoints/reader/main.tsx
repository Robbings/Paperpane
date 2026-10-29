import { mountPage } from '@/runtime/mount-page';
import { LiveReaderPage } from '@/runtime/reader-page';

const url = new URL(location.href);
const view = url.searchParams.get('view');
if (view === 'gallery' || view === 'selbar') {
  // Compatibility for old component-review bookmarks, never a product reader.
  url.pathname = url.pathname.replace(/reader\.html$/, 'component-gallery.html');
  location.replace(url.href);
} else {
  // Old ?view=sample links now open the real reader too. Preserve document IDs.
  if (view !== null) {
    url.searchParams.delete('view');
    history.replaceState(null, '', url);
  }
  mountPage(<LiveReaderPage />);
}

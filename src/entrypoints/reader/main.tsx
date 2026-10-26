import { mountPage } from '@/runtime/mount-page';
import { LiveReaderPage } from '@/runtime/reader-page';
import { ReaderPage } from '@/ui/pages/ReaderPage';
const view = new URLSearchParams(location.search).get('view');
mountPage(view === 'gallery' || view === 'selbar' || view === 'sample' ? <ReaderPage /> : <LiveReaderPage />);

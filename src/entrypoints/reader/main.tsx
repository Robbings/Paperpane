import { mountPage } from '@/runtime/mount-page';
import { ReaderProof } from '@/runtime/reader-proof';
import { ReaderPage } from '@/ui/pages/ReaderPage';

const item = new URLSearchParams(location.search).get('item');
mountPage(item ? <ReaderProof libraryItemId={item} /> : <ReaderPage />);

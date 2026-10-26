import { mountPage } from '@/runtime/mount-page';
import { ReaderProof } from '@/runtime/reader-proof';

mountPage(<ReaderProof libraryItemId={new URLSearchParams(location.search).get('item') ?? undefined} />);

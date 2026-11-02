import { mountPage } from '@/runtime/mount-page';
import { LibraryPage, createLibraryRuntime } from '@/runtime/library-page';

const owner = createLibraryRuntime();
window.addEventListener('pagehide', event => { if (!event.persisted) owner.dispose(); });
mountPage(<LibraryPage owner={owner} />, { welcome: true });

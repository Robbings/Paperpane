import { defineBackground } from 'wxt/utils/define-background';
import { installBrowserEntry } from '@/browser-entry/background';

import { installImportTranslation } from '@/translation/import-background';
import { installSync } from '@/sync/background';
import { installUpdateCheck } from '@/update/check';
export default defineBackground(()=>{installBrowserEntry();installSync();installImportTranslation();installUpdateCheck();});

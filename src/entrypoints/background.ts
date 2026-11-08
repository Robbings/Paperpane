import { defineBackground } from 'wxt/utils/define-background';
import { installBrowserEntry } from '@/browser-entry/background';

import { installImportTranslation } from '@/translation/import-background';
import { installSync } from '@/sync/background';
import { installTrashExpiry } from '@/domain/library/trash-expiry';
import { installUpdateCheck } from '@/update/check';
export default defineBackground(()=>{installBrowserEntry();installSync();installImportTranslation();installTrashExpiry();installUpdateCheck();});

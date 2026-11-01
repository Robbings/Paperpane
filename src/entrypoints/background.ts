import { defineBackground } from 'wxt/utils/define-background';
import { installBrowserEntry } from '@/browser-entry/background';

import { installSync } from '@/sync/background';
export default defineBackground(()=>{installBrowserEntry();installSync();});

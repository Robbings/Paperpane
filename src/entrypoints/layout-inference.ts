import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { installLayoutWorker } from '@/ai/layout/inference.worker';

// WXT emits this script into the extension for both development and production.
export default defineUnlistedScript(installLayoutWorker);

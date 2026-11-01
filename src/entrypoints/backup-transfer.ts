import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { installBackupWorker } from '@/transfer/backup.worker';

export default defineUnlistedScript(installBackupWorker);

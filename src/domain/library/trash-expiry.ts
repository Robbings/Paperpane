import { browser } from 'wxt/browser';
import { TRASH_DAYS, TransferStore } from '@/data/transfer-store';

/** Background: once a day, and when the browser starts, delete what has been in the trash for TRASH_DAYS. */
export function installTrashExpiry() {
  const alarm = 'paperpane-trash-expiry';
  const run = async () => {
    const store = new TransferStore();
    try {
      await store.purgeTrash(TRASH_DAYS);
    } catch {
      // Tried again at the next alarm.
    } finally {
      await store.close();
    }
  };
  // The worker restarts often; re-creating the alarm each time would keep pushing it back.
  void browser.alarms.get(alarm).then((existing) => {
    if (!existing) void browser.alarms.create(alarm, { delayInMinutes: 5, periodInMinutes: 24 * 60 });
  });
  browser.alarms.onAlarm.addListener((event) => {
    if (event.name === alarm) void run();
  });
  browser.runtime.onStartup.addListener(() => void run());
}

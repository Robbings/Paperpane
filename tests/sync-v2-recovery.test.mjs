import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDav, device } from './helpers/sync-v2.mjs';

// Devices have independent browser lock managers.
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
for (const noListing of [false, true]) {
  for (const failure of ['upload', 'restore']) {
    test(`first join recovers after ${failure}, empty listings: ${noListing}`, async () => {
      const server = memoryDav(undefined, noListing);
      const a = await device('A', server), b = await device('B', server);
      try {
        await a.folder('shared', { name: 'remote-new' }); await a.sync();
        await b.folder('shared', { name: 'local-old' });
        await b.folder('local-only', { name: 'keep-me' });
        const fetcher = server.fetcher, restore = b.store.restore.bind(b.store);
        if (failure === 'upload') {
          server.fetcher = async (url, options) => {
            if (options.method === 'PUT' && String(url).includes('/changes/')) throw new Error('interrupted');
            return fetcher(url, options);
          };
        } else b.store.restore = async () => { throw new Error('interrupted'); };
        await assert.rejects(b.sync(), /interrupted/);
        server.fetcher = fetcher; b.store.restore = restore;
        await b.sync(); await a.sync();
        assert.equal((await a.getFolder('shared')).name, 'remote-new');
        assert.equal((await b.getFolder('shared')).name, 'remote-new');
        assert.equal((await a.getFolder('local-only')).name, 'keep-me');
        assert((await b.versionValues()).includes('local-old'));
        await b.sync(); await a.sync();
        assert((await a.versionValues()).includes('local-old'));
      } finally {
        await a.store.close(); await a.conn.close(); await b.store.close(); await b.conn.close();
      }
    });
  }
}
test('an edit after an interrupted first join is still published', async () => {
  const server = memoryDav(), a = await device('A', server), b = await device('B', server);
  try {
    await a.folder('shared', { name: 'remote-new' }); await a.sync();
    await b.folder('shared', { name: 'local-old' });
    const restore = b.store.restore.bind(b.store);
    b.store.restore = async () => { throw new Error('interrupted'); };
    await assert.rejects(b.sync(), /interrupted/);
    b.store.restore = restore;
    await b.folder('shared', { name: 'edited-after-interruption' });
    await b.sync(); await a.sync();
    assert.equal((await a.getFolder('shared')).name, 'edited-after-interruption');
    assert((await b.versionValues()).includes('local-old'));
  } finally {
    await a.store.close(); await a.conn.close(); await b.store.close(); await b.conn.close();
  }
});

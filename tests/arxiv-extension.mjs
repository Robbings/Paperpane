// Run after pnpm build. Use a separate profile; never touches a personal browser.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PAPERPANE_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href : 'playwright');
const output = resolve('backups/arxiv-validation');
await mkdir(output, { recursive: true });
const pdf = await readFile(process.env.PAPERPANE_TEST_PDF ?? resolve(output, '1706.03762.pdf'));
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(resolve('browser-profiles/arxiv-validation-' + Date.now()), {
  executablePath: process.env.PAPERPANE_CHROMIUM,
  headless: true,
  viewport: { width: 1600, height: 1000 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
let requests = 0;
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const snapshot = page => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('paperpane'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  const read = name => new Promise((resolve, reject) => {
    const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  const docs = await read('documents'), items = await read('libraryItems'); db.close();
  return { docs, items };
});
async function rendered(page) {
  await page.waitForURL(url => url.searchParams.has('documentId'), { timeout: 60000 });
  await page.locator('.textLayer span').first().waitFor({ timeout: 60000 });
}
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const root = `chrome-extension://${new URL(worker.url()).host}`;
  const library = await context.newPage();
  await library.goto(`${root}/library.html`);
  await library.getByRole('button', { name: '导入', exact: true }).waitFor();
  await context.route('https://arxiv.org/abs/1706.03762', route => route.fulfill({
    contentType: 'text/html', body: '<html><body><h1>Attention Is All You Need</h1><div class="full-text"><ul><li><a href="/pdf/1706.03762">View PDF</a></li></ul></div></body></html>',
  }));
  await context.route('https://arxiv.org/pdf/1706.03762', route => {
    requests++;
    return route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  const arxiv = await context.newPage();
  await arxiv.goto('https://arxiv.org/abs/1706.03762');
  const button = arxiv.getByRole('button', { name: '在 Paperpane 中打开', exact: true });
  await button.waitFor();
  await arxiv.evaluate(() => document.body.append(document.createElement('div')));
  assert.equal(await arxiv.locator('#paperpane-open-arxiv').count(), 1);
  const created = context.waitForEvent('page');
  await button.click();
  const reader = await created;
  await rendered(reader);
  const first = await snapshot(reader);
  assert.equal(first.docs.length, 1);
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].inLibrary, true);
  assert.match(first.items[0].title, /Attention/i);
  assert.equal(await reader.evaluate(() => chrome.permissions.contains({ origins: ['https://arxiv.org/*'] })), true);
  const rejected = await reader.evaluate(() => chrome.runtime.sendMessage({ type: 'OPEN_ARXIV_PAPER', pdfUrl: 'https://evil.test/not-a-paper.pdf' }));
  assert.equal(rejected.ok, false);
  await library.getByText(first.items[0].title, { exact: true }).first().waitFor({ timeout: 15000 });
  assert.equal(new URL(reader.url()).searchParams.has('import'), false);
  const afterImport = requests;
  await reader.reload(); await rendered(reader);
  assert.equal(requests, afterImport, 'refresh must reopen the saved file, not download again');
  await reader.screenshot({ path: resolve(output, 'reader.png') });
  await library.screenshot({ path: resolve(output, 'library.png') });
  await library.getByText(first.items[0].title, { exact: true }).first().dblclick();
  await rendered(library);
  assert.equal(new URL(library.url()).searchParams.get('documentId'), first.docs[0].id);
  assert.equal(requests, afterImport, 'library must reopen the saved PDF without downloading');
  console.log('PASS: content button, background message, PDF import/render, live library update, refresh');

  // No PDF metadata on a repeated import: explicit import must still restore membership.
  await reader.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('paperpane'); r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction(['documents', 'libraryItems'], 'readwrite');
    const items = tx.objectStore('libraryItems'), docs = tx.objectStore('documents');
    const r = items.getAll(); r.onsuccess = () => { const item = r.result[0]; items.put({ ...item, title: 'My edited title', editedFields: ['title'], inLibrary: false, tagIds: ['preserved-tag'] }); };
    const d = docs.getAll(); d.onsuccess = () => { const doc = d.result[0]; docs.put({ ...doc, bibliography: undefined }); };
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); db.close();
  });
  let databaseChunk;
  for (const name of await readdir(resolve(extension, 'chunks'))) {
    if (name.endsWith('.js') && /async commitImport\(/.test(await readFile(resolve(extension, 'chunks', name), 'utf8'))) { databaseChunk = name; break; }
  }
  assert.ok(databaseChunk, 'production shared database module must be available');
  await reader.evaluate(async chunk => {
    const module = await import(chunk);
    const Database = Object.values(module).find(value => typeof value === 'function' && value.prototype?.commitImport);
    const db = new Database();
    const [doc] = await db.list();
    const blob = await db.readFile(doc);
    await db.commitImport({ blob, sha256: doc.file.sha256, filename: doc.originalFilename, pageCount: doc.pageCount, syncScope: 'record-and-file' });
    await db.close();
  }, `${root}/chunks/${databaseChunk}`);
  assert.equal((await snapshot(reader)).items[0].inLibrary, true, 'explicit import without bibliography restores membership');
  const secondCreated = context.waitForEvent('page');
  await arxiv.locator('#paperpane-open-arxiv').click();
  const secondReader = await secondCreated;
  await rendered(secondReader);
  const second = await snapshot(secondReader);
  assert.equal(second.docs.length, 1);
  assert.equal(second.docs[0].id, first.docs[0].id);
  assert.equal(second.items[0].inLibrary, true);
  assert.equal(second.items[0].title, 'My edited title');
  assert.deepEqual(second.items[0].tagIds, ['preserved-tag']);
  console.log('PASS: duplicate import restores library membership and preserves edited metadata');

  await context.route('https://arxiv.org/abs/2401.00002', route => route.fulfill({
    contentType: 'text/html', body: '<html><body><h1>Delayed page</h1></body></html>',
  }));
  const delayed = await context.newPage();
  await delayed.goto('https://arxiv.org/abs/2401.00002');
  await delayed.evaluate(() => { document.body.innerHTML += '<div class="full-text"><ul><li><a href="/pdf/2401.00002">PDF</a></li></ul></div>'; });
  await delayed.locator('#paperpane-open-arxiv').waitFor();
  assert.equal(await delayed.locator('#paperpane-open-arxiv').count(), 1);
  console.log('PASS: delayed DOM inserts the button once');

  // An unrelated previous paper must never appear when the requested PDF cannot download.
  await context.route('https://arxiv.org/pdf/2401.00001', route => route.fulfill({ status: 403, body: 'Forbidden' }));
  const failed = await context.newPage();
  await failed.goto(`${root}/reader.html?import=${encodeURIComponent('https://arxiv.org/pdf/2401.00001')}`);
  await failed.getByText('论文导入失败', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await failed.locator('.textLayer span').count(), 0);
  await context.route('https://arxiv.org/pdf/2401.00001', route => route.fulfill({ contentType: 'application/pdf', body: pdf }));
  await failed.getByRole('button', { name: '重试导入', exact: true }).click();
  await rendered(failed);
  assert.equal((await snapshot(failed)).docs.length, 1);
  console.log('PASS: download failure stays on target paper, retry succeeds');
  assert.deepEqual(errors, []);
  console.log('PASS: no uncaught page errors');
  if (process.env.PAPERPANE_LIVE_ARXIV === '1') {
    await context.unrouteAll({ behavior: 'wait' });
    const live = await context.newPage();
    await live.goto('https://arxiv.org/abs/1706.03762', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await live.getByRole('button', { name: '在 Paperpane 中打开', exact: true }).waitFor({ timeout: 15000 });
    await live.screenshot({ path: resolve(output, 'arxiv-live-button.png') });
    const opened = context.waitForEvent('page');
    await live.locator('#paperpane-open-arxiv').click();
    const liveReader = await opened;
    await rendered(liveReader);
    const state = await snapshot(liveReader);
    assert.equal(state.docs.length, 1);
    await liveReader.screenshot({ path: resolve(output, 'arxiv-live-reader.png') });
    console.log('PASS: live arxiv.org page → real network download → installed extension reader');
  }
} finally { await context.close(); }

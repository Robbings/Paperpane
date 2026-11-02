// Run after pnpm build. The PDF and authenticated publisher are local to this test.
import assert from 'node:assert/strict';
import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const { chromium } = await import(process.env.PAPERPANE_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href : 'playwright');
const document = await PDFDocument.create();
document.addPage().drawText('Paperpane session verification');
const pdf = Buffer.from(await document.save());
const requests = new Map();
let cachedPdfReferrer;
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/paper-link') {
    res.writeHead(302, { Location: '/challenge' }).end();
  } else if (pathname === '/challenge') {
    res.writeHead(403, { 'Content-Type': 'text/html' }).end('<form action="/verified"><button>Continue</button></form>');
  } else if (pathname === '/verified') {
    res.writeHead(302, { 'Set-Cookie': 'verified=yes; Path=/; SameSite=Lax', Location: '/session.pdf?sig=a%2Fb' }).end();
  } else if (pathname.endsWith('.pdf')) {
    const verified = req.headers.cookie?.includes('verified=yes') ?? false;
    if (pathname === '/cached.pdf') cachedPdfReferrer = req.headers.referer;
    const hits = requests.get(pathname) ?? [];
    hits.push(verified);
    requests.set(pathname, hits);
    if (pathname === '/session.pdf' && !verified) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length,
      'Cache-Control': pathname === '/session.pdf' ? 'no-store' : 'private, max-age=3600' }).end(pdf);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<a href="/cached.pdf">PDF</a>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const ext = resolve(process.env.PAPERPANE_EXTENSION ?? '.output/chrome-mv3');
let context;
try {
  context = await chromium.launchPersistentContext('', {
    executablePath: process.env.PAPERPANE_CHROMIUM, headless: true,
    ignoreDefaultArgs: ['--disable-extensions'], args: [`--load-extension=${ext}`, `--disable-extensions-except=${ext}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const readerUrl = new URL('reader.html', worker.url()).href;
  const readers = () => context.pages().filter(page => page.url().startsWith(readerUrl));
  async function rendered(opened, expected) {
    const reader = await opened;
    await reader.waitForURL(url => url.href.startsWith(readerUrl) && url.searchParams.has('documentId'));
    await reader.locator('.textLayer span:visible').first().waitFor();
    assert.equal(new URL(reader.url()).searchParams.get('originalPdf'), expected);
    return reader;
  }

  const page = await context.newPage();
  await page.goto(base);
  const windowOf = url => worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url)?.windowId, url);
  const opened = context.waitForEvent('page', candidate => candidate.url().startsWith(readerUrl));
  await page.locator('[data-paperpane-button]').click();
  const reader = await rendered(opened, base + '/cached.pdf');
  assert.equal(page.url(), base + '/');
  const destinationWindow = await windowOf(base + '/cached.pdf');
  assert.ok(Number.isInteger(destinationWindow));
  assert.notEqual(destinationWindow, await windowOf(page.url()));
  assert.equal(await windowOf(reader.url()), destinationWindow);
  assert.equal(requests.get('/cached.pdf').length, 1);
  assert.equal(cachedPdfReferrer, base + '/');
  console.log('PASS webpage button → browser PDF → reader, one PDF request with caching');

  const scholar = await context.newPage();
  const results = 'https://scholar.google.com/scholar?q=test';
  await scholar.route(results, route => route.fulfill({ contentType: 'text/html', body:
    '<div class="gs_r gs_scl" id="one"><div class="gs_ggs"><a href="' + base + '/other.pdf">[PDF] One</a></div></div>' +
    '<div class="gs_r gs_scl" id="two"><div class="gs_ggs"><a href="' + base + '/paper-link">[PDF] Two</a></div></div>' }));
  await scholar.goto(results);
  const scroll = await scholar.evaluate(() => {
    document.body.style.padding = '800px 0';
    window.scrollTo(0, 720);
    return window.scrollY;
  });
  assert.ok(scroll > 0);
  async function openSelected() {
    const opened = context.waitForEvent('page');
    await scholar.locator('#two [data-paperpane-button]').click();
    const challenge = await opened;
    await challenge.getByRole('button', { name: 'Continue' }).waitFor();
    assert.equal(challenge.url(), base + '/challenge');
    assert.equal(scholar.url(), results);
    assert.equal(await scholar.evaluate(() => window.scrollY), scroll);
    assert.notEqual(await windowOf(challenge.url()), await windowOf(results));
    return challenge;
  }
  // Abandon only the destination. Another click on the same result starts afresh.
  const abandoned = await openSelected();
  await abandoned.goto(base + '/unrelated.pdf');
  await abandoned.locator('#paperpane-completed-pdf-link').waitFor();
  assert.equal(readers().length, 1);
  const challenge = await openSelected();
  const challengeWindow = await windowOf(challenge.url());
  assert.equal(readers().length, 1);
  assert.equal(requests.has('/other.pdf'), false);

  // A manual PDF in a second tab must not consume Scholar's pending click.
  const manual = await context.newPage();
  await manual.goto(base + '/manual.pdf');
  const floating = manual.locator('#paperpane-completed-pdf-link');
  await floating.waitFor();
  assert.equal(readers().length, 1);
  // Chrome's native PDF viewer takes focus as its embedded renderer initializes.
  await manual.waitForTimeout(3000);
  const manualReader = context.waitForEvent('page');
  await floating.click();
  await rendered(manualReader, base + '/manual.pdf');
  assert.equal(requests.get('/manual.pdf').length, 1);

  const verified = context.waitForEvent('page');
  await challenge.getByRole('button', { name: 'Continue' }).click();
  const verifiedReader = await rendered(verified, base + '/session.pdf?sig=a%2Fb');
  assert.equal(await windowOf(verifiedReader.url()), challengeWindow);
  const activeTab = await worker.evaluate(async windowId => (await chrome.tabs.query({ active: true, windowId }))[0]?.url, challengeWindow);
  assert.equal(activeTab, verifiedReader.url());
  assert.equal(scholar.url(), results);
  assert.deepEqual(requests.get('/session.pdf'), [true, true]);
  await challenge.reload();
  await challenge.locator('#paperpane-completed-pdf-link').waitFor();
  assert.equal(readers().length, 3);
  const popup = await context.newPage();
  await popup.goto(new URL('popup.html', worker.url()).href);
  const popupReader = context.waitForEvent('page');
  const result = await popup.evaluate(async source => {
    const [tab] = await chrome.tabs.query({ url: source });
    // A PDF open before installation has no recorded network observation.
    await chrome.storage.session.remove('pdfTab:' + tab.id);
    return chrome.runtime.sendMessage({ type: 'OPEN_TAB_PDF', tabId: tab.id });
  }, base + '/manual.pdf');
  assert.equal(result.ok, true);
  await rendered(popupReader, base + '/manual.pdf');
  assert.equal(requests.get('/manual.pdf').length, 1);
  console.log('PASS PDF popup command reuses the original tab and cache');
  console.log('PASS selected Scholar result → 403 challenge → site session → reader, no anonymous fetch; independent manual PDF and single-use handoff');
} catch (error) {
  console.error('Open test pages:', context?.pages().map(page => page.url()), 'PDF requests:', [...requests]);
  throw error;
} finally {
  await context?.close();
  server.close();
}

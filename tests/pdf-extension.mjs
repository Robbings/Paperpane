import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PAPERPANE_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href : 'playwright');
const output = resolve('backups/pdf-validation');
await mkdir(output, { recursive: true });
const pdf = await readFile(process.env.PAPERPANE_TEST_PDF ?? resolve('backups/arxiv-validation/1706.03762.pdf'));
let pdfRequests = 0;
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (['/download', '/paper.pdf', '/attachment'].includes(path)) {
    pdfRequests++;
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, ...(path === '/attachment' ? { 'Content-Disposition': 'attachment; filename="paper.pdf"' } : {}) });
    res.end(pdf);
  } else if (path === '/redirect') { res.writeHead(302, { Location: '/download' }); res.end(); }
  else if (path === '/redirect-chain') { res.writeHead(302, { Location: '/redirect' }); res.end(); }
  else if (path === '/embed') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body><h1>Embedded paper</h1><embed src="/download" type="application/pdf" width="800" height="600"></body></html>'); }
  else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><head><title>PDF test page</title></head><body><h1>Paper downloads</h1><p><a href="/paper.pdf?token=a%2Fb">Paper PDF</a></p><p><a href="/download" type="application/pdf">Download</a></p><p><a href="/about">About</a></p></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(resolve('browser-profiles/pdf-validation-' + Date.now()), {
  executablePath: process.env.PAPERPANE_CHROMIUM, headless: true, viewport:{width:1600,height:1000},
  ignoreDefaultArgs:['--disable-extensions'], args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
});
const errors = [];
context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
async function rendered(page) { await page.waitForURL(url => url.protocol === 'chrome-extension:' && url.searchParams.has('documentId'), {timeout:30000}); await page.locator('.textLayer span').first().waitFor({timeout:30000}); }
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const root = `chrome-extension://${new URL(worker.url()).host}`;
  const settings = await context.newPage(); await settings.goto(root+'/options.html');
  const show = settings.getByRole('switch',{name:'显示网页打开按钮',exact:true});
  const auto = settings.getByRole('switch',{name:'自动用纸窗打开 PDF',exact:true});
  await show.waitFor(); assert.equal(await show.isChecked(),true); assert.equal(await auto.isChecked(),false);
  await show.scrollIntoViewIfNeeded(); await settings.screenshot({path:resolve(output,'settings.png')});
  const links = await context.newPage(); await links.goto(base+'/links');
  await links.locator('[data-paperpane-button]').first().waitFor();
  assert.equal(await links.locator('[data-paperpane-button]').count(),2);
  assert.notEqual(await links.locator('[data-paperpane-button]').first().evaluate(el => getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await links.screenshot({path:resolve(output,'web-buttons.png')});
  await show.click(); await links.locator('[data-paperpane-button]').first().waitFor({state:'detached'});
  await settings.reload(); await show.waitFor(); assert.equal(await show.isChecked(),false);
  await show.click(); await links.locator('[data-paperpane-button]').first().waitFor();
  console.log('PASS: real settings, button appearance, global hide/show live update and persistence');
  const newReader = context.waitForEvent('page'); await links.locator('[data-paperpane-button]').first().click();
  const manual = await newReader; await rendered(manual);
  assert.equal(new URL(manual.url()).searchParams.has('import'),false);
  console.log('PASS: generic web link → imported PDF reader');
  await links.locator('a').first().evaluate(el=>el.href='/paper.pdf?changed=1');
  await links.waitForTimeout(250);
  const changedReader = context.waitForEvent('page'); await links.locator('[data-paperpane-button]').first().click();
  const changed = await changedReader; await rendered(changed);
  assert.equal(new URL(changed.url()).searchParams.get('originalPdf'),base+'/paper.pdf?changed=1','reused link must open the updated PDF');
  await links.locator('a').evaluateAll(elements=>elements.forEach(el=>el.remove()));
  await links.locator('[data-paperpane-button]').first().waitFor({state:'detached'});
  const linkTabs = await settings.evaluate(()=>chrome.tabs.query({}));
  const linkTab = linkTabs.find(tab=>tab.url===base+'/links');
  await settings.waitForFunction(async tabId=>!(await chrome.runtime.sendMessage({type:'GET_PDF_STATE',tabId})).value.pdfUrl,linkTab.id);
  console.log('PASS: reused DOM links update destinations; removing links clears detected PDF');

  const embedded = await context.newPage(); await embedded.goto(base+'/embed');
  await embedded.locator('[data-paperpane-floating] button').waitFor();
  assert.equal(new URL(embedded.url()).pathname,'/embed');
  console.log('PASS: embedded PDF shows floating button without auto-opening parent page');

  const fallback = await context.newPage(); await fallback.goto(root+'/reader.html?import='+encodeURIComponent(base+'/missing.pdf'));
  await fallback.getByText('论文导入失败',{exact:true}).waitFor();
  await fallback.locator('input[type="file"]').setInputFiles({name:'local-fallback.pdf',mimeType:'application/pdf',buffer:Buffer.concat([pdf,Buffer.from('\n% local fallback')])});
  await rendered(fallback);
  assert.equal(new URL(fallback.url()).searchParams.has('originalPdf'),false,'unrelated local fallback must not inherit failed remote URL');
  assert.equal(await fallback.getByRole('button',{name:'返回原 PDF',exact:true}).count(),0);
  console.log('PASS: local fallback does not inherit an unrelated failed source');

  await auto.click();
  await settings.waitForFunction(async()=> (await chrome.storage.local.get('browserEntry')).browserEntry?.autoOpenPdf===true);
  const direct = await context.newPage();
  await direct.goto(base+'/download').catch(e=>{ if(!String(e).includes('ERR_ABORTED'))throw e; });
  await rendered(direct);
  await direct.screenshot({path:resolve(output,'auto-reader.png')});
  console.log('PASS: application/pdf response with no filename suffix auto-opens in same tab');

  const redirectReturn = await context.newPage();
  await redirectReturn.goto(root+'/reader.html?import='+encodeURIComponent(base+'/redirect-chain'));
  await rendered(redirectReturn);
  assert.equal(new URL(redirectReturn.url()).searchParams.get('originalPdf'),base+'/redirect-chain');
  await redirectReturn.getByRole('button',{name:'更多工具',exact:true}).click();
  await redirectReturn.getByRole('menuitem',{name:'返回原 PDF',exact:true}).click();
  await redirectReturn.waitForURL(base+'/download',{timeout:10000});
  await redirectReturn.reload().catch(e=>{if(!String(e).includes('ERR_ABORTED'))throw e;});
  assert.equal(redirectReturn.url(),base+'/download');
  console.log('PASS: returning to a manually imported redirect URL stays in native PDF viewer');

  // Trigger source return through the reader's actual UI.
  await direct.getByRole('button',{name:'更多工具',exact:true}).click();
  await direct.getByRole('menuitem',{name:'返回原 PDF',exact:true}).click();
  await direct.waitForURL(base+'/download',{timeout:15000});
  await direct.waitForLoadState('load');
  await direct.reload().catch(e=>{if(!String(e).includes('ERR_ABORTED'))throw e;});
  assert.equal(direct.url(),base+'/download');
  const tabs = await settings.evaluate(()=>chrome.tabs.query({}));
  const returnedTab = tabs.find(tab=>tab.url?.endsWith('/download'));
  assert.ok(returnedTab);
  const known = await settings.evaluate(tabId=>chrome.runtime.sendMessage({type:'GET_PDF_STATE',tabId}),returnedTab.id);
  assert.equal(known.value.pdfUrl,base+'/download');
  await direct.screenshot({path:resolve(output,'original-pdf.png')});
  await direct.locator('[data-paperpane-floating] button').waitFor();
  await show.click(); await direct.locator('[data-paperpane-floating] button').waitFor({state:'detached'});
  await show.click(); await direct.locator('[data-paperpane-floating] button').waitFor();
  console.log('PASS: return to original PDF survives refresh and remains recognized');

  const before = pdfRequests;
  await direct.goto(base+'/not-pdf.pdf');
  await direct.locator('h1').waitFor();
  assert.equal(new URL(direct.url()).pathname,'/not-pdf.pdf');
  assert.equal(pdfRequests,before);
  console.log('PASS: HTML response with .pdf suffix does not auto-open');
  await direct.goto(base+'/redirect').catch(e=>{if(!String(e).includes('ERR_ABORTED'))throw e;});
  await rendered(direct);
  console.log('PASS: navigating away clears bypass; redirected PDF auto-opens');
  const attachment = await context.newPage();
  const download = attachment.waitForEvent('download');
  await attachment.goto(base+'/attachment').catch(e=>{if(!/ERR_ABORTED|Download is starting/.test(String(e)))throw e;});
  await download;
  assert.equal(attachment.url().startsWith(root),false);
  console.log('PASS: attachment download remains a browser download');
  const popup = await context.newPage(); await popup.goto(root+'/popup.html');
  await popup.getByRole('switch',{name:'显示网页打开按钮',exact:true}).waitFor();
  assert.equal(await popup.getByRole('switch',{name:'自动打开 PDF',exact:true}).isChecked(),true);
  await popup.locator('.pp-popup').screenshot({path:resolve(output,'popup.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS: live popup switches and no unhandled page errors');
} finally { await context.close(); await new Promise(resolve=>server.close(resolve)); }

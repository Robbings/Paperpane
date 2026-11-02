import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PAPERPANE_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href : 'playwright');
import assert from 'node:assert/strict';import http from 'node:http';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
const pdf=await readFile('backups/arxiv-validation/1706.03762.pdf');let requests=0;let anonymous=0;
const server=http.createServer((q,r)=>{if(q.url.startsWith('/paper')){requests++;if(!q.headers.cookie?.includes('pdf_session=verified')){anonymous++;r.writeHead(403);r.end('Session required');return;}r.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length,...(process.env.PAPERPANE_TEST_NO_CACHE ? {'Cache-Control':'no-store'} : {'Cache-Control':'public, max-age=3600'})});r.end(pdf)}else{r.writeHead(q.url==='/verify'?429:200,{'Content-Type':'text/html','Set-Cookie':'pdf_session=verified; Path=/; SameSite=Lax'});r.end('<html><body>Verify you are human <a href="/paper.pdf">PDF</a></body></html>')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let c;try{
const ext=resolve('.output/chrome-mv3');c=await chromium.launchPersistentContext(resolve('browser-profiles/pdf-link-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,viewport:{width:1440,height:1000},ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${ext}`,`--disable-extensions-except=${ext}`]});const w=c.serviceWorkers()[0]??await c.waitForEvent('serviceworker');
const base=`http://127.0.0.1:${server.address().port}`;
const p=await c.newPage();await p.goto(base+'/links');assert.equal(await p.locator('#paperpane-completed-pdf-link').count(),0);
await p.goto(base+'/verify');assert.equal(await p.locator('#paperpane-completed-pdf-link').count(),0);
await p.goto(base+'/paper.pdf');const link=p.locator('#paperpane-completed-pdf-link');await link.waitFor({timeout:15000});assert.equal(p.url(),base+'/paper.pdf');
await p.waitForTimeout(3000);
await p.screenshot({path:'backups/pdf-page-link.png'});
const opened=c.waitForEvent('page');await link.click();const reader=await opened;await reader.waitForURL(u=>u.protocol==='chrome-extension:'&&u.searchParams.has('documentId'),{timeout:30000});await reader.locator('.textLayer span:visible').first().waitFor({timeout:30000});
await reader.screenshot({path:'backups/pdf-page-link-reader.png'});assert.equal(await reader.locator('.textLayer span:visible').count()>0,true);assert.equal(requests,process.env.PAPERPANE_TEST_NO_CACHE?2:1,'cached imports must avoid network, uncached imports must use the original session');assert.equal(anonymous,0,'import must preserve the website session instead of anonymous extension download');console.log('PASS native PDF left-bottom entry -> imported reader; HTML and 429 have no entry; requests='+requests);
}finally{await c?.close();server.close();}

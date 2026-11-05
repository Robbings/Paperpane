import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const {chromium}=await import(pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href);
const out=resolve('backups/viewer-pdf-validation');await mkdir(out,{recursive:true});
const pdf=await PDFDocument.create();pdf.setTitle('Attention Is All You Need');const font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=1;i<=8;i++){const p=pdf.addPage([400,500]);p.drawText(`Viewer PDF page ${i}`,{x:30,y:400,size:16,font});}
const bytes=Buffer.from(await pdf.save());await writeFile(out+'/fixture.pdf',bytes);
const requested=[];
const server=createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/doi/pdfdirect/')){
  if(u.searchParams.get('token')!=='signed%value'){res.writeHead(403);res.end();return;}
  const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range??'');
  if(!range){res.writeHead(200,{'Content-Type':'text/html'});res.end('A viewer needs a range request');return;}
  const start=Number(range[1]),end=Math.min(Number(range[2]),start+511,bytes.length-1);requested.push([start,end]);
  res.writeHead(206,{'Content-Type':'application/pdf','Content-Range':`bytes ${start}-${end}/${bytes.length}`,'ETag':'"v1"','Cache-Control':'no-store','Content-Length':end-start+1});res.end(bytes.subarray(start,end+1));return;
 }
 res.writeHead(200,{'Content-Type':'text/html'});
 if(u.pathname==='/challenge'){res.end('<title>Just a moment...</title><form id="challenge-form"></form><a href="/paper.pdf">PDF</a>');return;}
 const target='/doi/pdfdirect/10.1234/example?token=signed%25value';
 res.end(`<title>Embedded PDF reader</title><h1>Embedded paper</h1><canvas></canvas><a href="${target}">Download PDF</a><script>fetch(${JSON.stringify(target)},{headers:{Range:'bytes=0-511'}}).then(r=>r.arrayBuffer());</script>`);
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
const extension=resolve('.output/chrome-mv3');const context=await chromium.launchPersistentContext(resolve('browser-profiles/viewer-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const root=`chrome-extension://${new URL(worker.url()).host}`;await worker.evaluate(()=>chrome.storage.local.set({onboarding:{welcomed:true,guided:true}}));
 const page=await context.newPage();await page.goto(base+'/doi/epdf/10.1234/example');
 const button=page.locator('[data-paperpane-button]').first();await button.waitFor();
 const created=context.waitForEvent('page',p=>p.url().startsWith(root+'/reader.html'));
 await button.click();const reader=await created;await reader.waitForURL(u=>u.searchParams.has('documentId'),{timeout:30000});await reader.locator('.textLayer span').first().waitFor();
 assert.equal(new URL(reader.url()).searchParams.get('originalPdf'),base+'/doi/pdfdirect/10.1234/example?token=signed%25value');
 const count=await reader.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('paperpane');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=db.transaction('documents').objectStore('documents').getAll();q.onsuccess=()=>r(q.result[0].pageCount)})});assert.equal(count,8);
 assert(requested.some(([start])=>start>0));assert.equal(page.isClosed(),false);await reader.reload();await reader.locator('.textLayer span').first().waitFor();
 console.log('PASS signed viewer PDF: all ranges, eight pages, retained source, refresh');
 const verify=await context.newPage();await verify.goto(base+'/challenge');await verify.waitForTimeout(500);assert.equal(await verify.locator('[data-paperpane-button]').count(),0);
 await verify.evaluate(()=>{document.title='Article';document.querySelector('form').remove()});await verify.locator('[data-paperpane-button]').waitFor();
 console.log('PASS challenge suppression and detection resuming after verification');
 await reader.screenshot({path:out+'/reader.png'});
}catch(error){for(const p of context.pages())console.log('PAGE',p.url(),(await p.locator('body').innerText().catch(()=>'' )).slice(0,1600));console.log('RANGES',requested);throw error;}finally{await context.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));}

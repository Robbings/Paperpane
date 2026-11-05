import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const {chromium}=await import(pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href);
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);const sheet=pdf.addPage([400,500]);sheet.drawText('Paperpane PDF handoff regression fixture',{x:20,y:400,size:15,font});const bytes=Buffer.from(await pdf.save());
const out=resolve('backups/pdf-handoff-regressions');await mkdir(out,{recursive:true});await writeFile(out+'/fixture.pdf',bytes);
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':bytes.length});res.end(bytes);});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const localPdf=`http://127.0.0.1:${server.address().port}/paper.pdf`;
const paths=[resolve('.output/chrome-mv3'),...(process.env.PAPERPANE_SCHOLAR_EXTENSION?[process.env.PAPERPANE_SCHOLAR_EXTENSION]:[])].join(',');
const context=await chromium.launchPersistentContext(resolve('browser-profiles/handoff-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${paths}`,`--load-extension=${paths}`],viewport:{width:1500,height:1000}});
context.setDefaultTimeout(20000);
try{
 const worker=context.serviceWorkers().find(w=>w.url().endsWith('/background.js'))??await context.waitForEvent('serviceworker',w=>w.url().endsWith('/background.js'));
 const root=`chrome-extension://${new URL(worker.url()).host}`;await worker.evaluate(()=>chrome.storage.local.set({onboarding:{welcomed:true,guided:true}}));
 const pdfUrl='https://www.science.org/doi/pdf/10.1126/science.aao0185?referrer=fixture';
 await context.route('https://www.science.org/**',route=>route.fulfill(route.request().url().includes('/doi/pdf/')?{status:302,headers:{location:localPdf}}:{contentType:'text/html',body:'<!doctype html><title>Science ePDF</title><h1>Science article</h1>'}));
 const source=await context.newPage();await source.goto('https://www.science.org/doi/epdf/10.1126/science.aao0185?referrer=fixture');
 const button=source.locator('[data-paperpane-button]').first();await button.waitFor();
 const readerPromise=context.waitForEvent('page',p=>p.url().startsWith(root+'/reader.html'));
 await button.click();const reader=await readerPromise;await reader.waitForURL(u=>u.searchParams.has('documentId'),{timeout:45000});
 await reader.locator('.textLayer span').first().waitFor();assert.equal(new URL(reader.url()).searchParams.get('originalPdf'),localPdf);
 console.log('PASS Science ePDF handoff reads corresponding PDF with Scholar Reader installed:',!!process.env.PAPERPANE_SCHOLAR_EXTENSION);
 await reader.screenshot({path:out+'/science-reader.png'});
 // Existing PDF documents that Scholar has already replaced remain importable.
 const direct=await context.newPage();await direct.goto(localPdf);await direct.waitForLoadState('load');
 if(process.env.PAPERPANE_SCHOLAR_EXTENSION)await direct.locator('iframe[src^="chrome-extension:"]').first().waitFor();
 const control=await context.newPage();await control.goto(root+'/options.html');
 const tabs=await control.evaluate(()=>chrome.tabs.query({}));const tab=tabs.find(t=>t.url?.split('#')[0]===localPdf);assert(tab);
 const state=await control.evaluate(id=>chrome.runtime.sendMessage({type:'GET_PDF_STATE',tabId:id}),tab.id);assert.equal(state.value.pdfUrl,localPdf);
 const nextPromise=context.waitForEvent('page',p=>p.url().startsWith(root+'/reader.html'));
 const opened=await control.evaluate(id=>chrome.runtime.sendMessage({type:'OPEN_TAB_PDF',tabId:id}),tab.id);assert(opened.ok);const next=await nextPromise;await next.waitForURL(u=>u.searchParams.has('documentId'),{timeout:45000});
 console.log('PASS importing an already captured Scholar PDF via Paperpane');
}catch(error){
 for(const p of context.pages())console.log('PAGE',p.url(),(await p.locator('body').innerText().catch(()=>'' )).slice(0,800));
 const worker=context.serviceWorkers().find(w=>w.url().endsWith('/background.js'));if(worker)console.log('SESSION',await worker.evaluate(()=>chrome.storage.session.get(null)));
 throw error;
}finally{await context.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));}

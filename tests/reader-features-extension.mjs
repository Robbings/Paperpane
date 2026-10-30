import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PDFDocument,StandardFonts,PDFName,PDFArray,PDFHexString} from 'pdf-lib';
const {chromium}=await import(pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href);
const out=resolve('backups/reader-features');await mkdir(out,{recursive:true});
const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=0;i<3;i++){const page=pdf.addPage([400,500]);page.drawText(i===0?'1 Introduction':i===1?'1.1 Background':'2 Conclusion',{x:30,y:420,size:18,font});for(let j=0;j<14;j++)page.drawText('This is the ordinary body text for a research paper.',{x:30,y:380-j*18,size:10,font});}
const start=pdf.context.register(pdf.context.obj({Title:PDFHexString.fromText('Start'),Dest:[pdf.getPage(0).ref,'XYZ',0,420,null]}));
const outline=pdf.context.register(pdf.context.obj({Type:'Outlines',First:start,Last:start,Count:1}));pdf.context.lookup(start).set(PDFName.of('Parent'),outline);pdf.catalog.set(PDFName.of('Outlines'),outline);
const native=await pdf.save();pdf.catalog.delete(PDFName.of('Outlines'));const generated=await pdf.save();
const context=await chromium.launchPersistentContext(resolve('browser-profiles/reader-features-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,viewport:{width:1700,height:1000},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${resolve('.output/chrome-mv3')}`,`--load-extension=${resolve('.output/chrome-mv3')}`]});
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const root=`chrome-extension://${new URL(worker.url()).host}`;
 await context.route('https://papers.test/native.pdf',r=>r.fulfill({contentType:'application/pdf',body:Buffer.from(native)}));
 await context.route('https://papers.test/generated.pdf',r=>r.fulfill({contentType:'application/pdf',body:Buffer.from(generated)}));
 const page=await context.newPage();await page.goto(`${root}/reader.html?import=${encodeURIComponent('https://papers.test/native.pdf')}`);
 await page.locator('.textLayer span').first().waitFor();await page.getByRole('navigation',{name:'目录',exact:true}).getByRole('button').first().waitFor();
 console.log('Native outline connected');
 await page.getByRole('button',{name:'缩略图',exact:true}).click();await page.locator('.pp-thumb img').first().waitFor();assert.ok(await page.locator('.pp-thumb img').first().evaluate(e=>e.naturalWidth>=224&&e.naturalWidth<=225));
 await page.getByRole('button',{name:'第 3 页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pp-thumb[aria-current="page"]')?.textContent.includes('3'));
 await page.screenshot({path:resolve(out,'thumbnails.png')});
 await page.evaluate(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('paperpane');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});const docs=await new Promise(res=>{const r=db.transaction('documents').objectStore('documents').getAll();r.onsuccess=()=>res(r.result);});const d=docs[0];const tx=db.transaction('annotations','readwrite');tx.objectStore('annotations').put({id:'export-test',revision:'r1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),documentKey:[d.id,d.fileVersion],anchor:{documentId:d.id,fileVersion:d.fileVersion,pages:[{pageIndex:0,rects:[{x:30,y:418,width:110,height:18}]},{pageIndex:2,rects:[{x:30,y:418,width:110,height:18}]}]},kind:'highlight',color:'yellow',quote:'跨页原文',comment:'中文评论, "引号"\n第二行',source:{kind:'user'},save:{local:'saved',sync:'unconfigured'}});await new Promise(res=>tx.oncomplete=res);db.close();});
 await page.reload();await page.locator('.textLayer span').first().waitFor();
 async function menu(){await page.getByRole('button',{name:'更多工具',exact:true}).click();await page.getByRole('menuitem',{name:'导出',exact:true}).click();}
 for(const [label,ext] of [['导出高亮和评论 · Markdown','md'],['导出高亮和评论 · CSV','csv'],['下载带标注的 PDF','pdf']]){
  await menu();const downloaded=page.waitForEvent('download');await page.getByRole('menuitem',{name:label,exact:true}).click();const d=await downloaded;const file=resolve(out,'annotations.'+ext);await d.saveAs(file);
  if(ext==='pdf'){const parsed=await PDFDocument.load(await readFile(file));assert.equal(parsed.getPageCount(),3);for(const i of [0,2])assert.ok(parsed.getPage(i).node.lookup(PDFName.of('Annots'),PDFArray).size()>0);}
  else assert.match(await readFile(file,'utf8'),/中文评论/);
 }
 await menu();const created=context.waitForEvent('page');await page.getByRole('menuitem',{name:'打印带标注的 PDF',exact:true}).click();const print=await created;await print.getByRole('button',{name:'打印 / 另存为 PDF'}).waitFor({timeout:30000});assert.equal(await print.locator('.sheet img').count(),3);await print.getByText('中文评论, "引号"\n第二行',{exact:true}).waitFor();await print.screenshot({path:resolve(out,'print.png')});const printed=await print.pdf({path:resolve(out,'printed.pdf'),preferCSSPageSize:true,printBackground:true});assert.equal((await PDFDocument.load(printed)).getPageCount(),4,'3 paper pages plus a comment list, without blank pages');await print.close();
 const generatedPage=await context.newPage();await generatedPage.goto(`${root}/reader.html?import=${encodeURIComponent('https://papers.test/generated.pdf')}`);await generatedPage.getByText('按版面自动生成，可能存在识别偏差',{exact:true}).waitFor({timeout:30000});const nav=generatedPage.getByRole('navigation',{name:'目录',exact:true});await nav.getByRole('button',{name:/Background/}).click();await generatedPage.screenshot({path:resolve(out,'generated-outline.png')});
 assert.deepEqual(errors,[]);console.log('PASS native/generated navigation, actual thumbnails, cross-page annotated PDF, Markdown/CSV, complete print with Chinese comments');
}finally{await context.close();}

import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const out=resolve('backups/tests/viewer-pdf.mjs');await build({entryPoints:['src/browser-entry/viewer-pdf.ts'],outfile:out,bundle:true,platform:'node',format:'esm'});
const {isVerificationPage,pdfResourceHint,samePdfArticle,observeViewerPdfs}=await import(pathToFileURL(out));
test('explicit challenge pages are excluded without matching article text',()=>{
 for(const title of ['Just a moment...','Security check','Access denied'])assert(isVerificationPage({title,querySelector:()=>null}));
 for(const title of ['Verification of quantum algorithms','arXiv.org','Google Scholar'])assert(!isVerificationPage({title,querySelector:()=>null}));
 assert(isVerificationPage({title:'Science',querySelector:()=>({})}));
});
test('viewer matching preserves signed addresses and isolates papers',()=>{
 const page='https://www.science.org/doi/epdf/10.1126/science.aao0185';
 assert(pdfResourceHint('https://www.science.org/doi/pdfdirect/10.1126/science.aao0185?hmac=signature'));
 assert(samePdfArticle(page,'https://www.science.org/doi/pdfdirect/10.1126/science.aao0185?hmac=signature'));
 assert(!samePdfArticle(page,'https://www.science.org/doi/pdfdirect/10.1126/other'));
 assert(!pdfResourceHint('https://www.science.org/doi/epdf/10.1126/science.aao0185'));
});
test('already loaded resources and new signed URLs are discovered; navigation invalidates them',()=>{
 const originalPerformance=globalThis.performance;const old=globalThis.PerformanceObserver;globalThis.PerformanceObserver=class{observe(){}disconnect(){}};
 const page='https://www.science.org/doi/epdf/10.1126/science.aao0185';const cached='https://www.science.org/doi/pdfdirect/10.1126/science.aao0185?hmac=cached';globalThis.performance={getEntriesByType:()=>[{name:cached,initiatorType:'fetch'}]};const doc={title:'Science',location:{href:page},querySelector:()=>null};
 try{
  const resources=observeViewerPdfs(doc,()=>{});assert.equal(resources.resolve(page),cached);const signed='https://www.science.org/doi/pdfdirect/10.1126/science.aao0185?hmac=one';
  resources.add(signed);assert.equal(resources.resolve(page),signed);
  resources.add(signed.replace('one','two'));assert.equal(resources.resolve(page),signed.replace('one','two'));
  doc.title='Just a moment...';assert.deepEqual(resources.list(),[]);
  doc.title='Science';doc.location.href='https://www.science.org/other';assert.deepEqual(resources.list(),[]);resources.dispose();
 }finally{globalThis.PerformanceObserver=old;globalThis.performance=originalPerformance;}
});
test('query-based download endpoints do not conflate different documents',()=>{
 assert(!samePdfArticle('https://site.test/download?id=one','https://site.test/download?id=two'));
 assert(samePdfArticle('https://site.test/a.pdf','https://site.test/a.pdf?token=signed'));
});

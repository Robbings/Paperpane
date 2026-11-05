import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const output=resolve('backups/tests/browser-pdf.mjs');
const api={};globalThis.__browserPdfTest=api;
await build({entryPoints:['src/document/browser-pdf.ts'],outfile:output,bundle:true,platform:'node',format:'esm',plugins:[{name:'browser',setup(b){b.onResolve({filter:/^wxt\/browser$/},()=>({path:'browser',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const browser=globalThis.__browserPdfTest'}));}}]});
const {readBrowserPdf,closeImportedPdf}=await import(pathToFileURL(output));
const url='https://publisher.test/p.pdf';
test('byte transfer is chunked, document-bound and cleaned without extension fetch',async()=>{
 const input=new Uint8Array(150000).map((_,i)=>i%256),calls=[],progress=[];api.runtime={sendMessage:async()=>({ok:true,value:{pdfUrl:url}})};
 api.scripting={executeScript:async options=>{const [,token,op,offset]=options.args;calls.push({op,target:options.target,token});return [{documentId:'pdf-document',result:op==='start'?{size:input.length}:op==='read'?{size:input.length,chunk:Array.from(input.subarray(offset,offset+65536))}:{size:0}}]}};
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('must not fetch in extension')};
 try{const result=await readBrowserPdf(8,url,new AbortController().signal,p=>progress.push(p));assert.deepEqual(result.bytes,input);assert.equal(result.sourceUrl,url);assert.equal(calls.filter(c=>c.op==='read').length,3);assert.deepEqual(calls[1].target,{tabId:8,documentIds:['pdf-document']});assert.equal(calls.at(-1).op,'drop');assert.equal(progress.at(-1).completed,input.length);}finally{globalThis.fetch=original;}
});
test('changed original tab refuses transfer',async()=>{
 api.runtime={sendMessage:async()=>({ok:true,value:{pdfUrl:'https://publisher.test/other.pdf'}})};api.scripting={executeScript:()=>{throw Error('must not inject')}};
 await assert.rejects(readBrowserPdf(8,url,new AbortController().signal,()=>{}),e=>e.detail.code==='NETWORK');
});
test('cancelling a chunk transfer releases original-tab bytes',async()=>{
 const c=new AbortController(),calls=[];api.runtime={sendMessage:async()=>({ok:true,value:{pdfUrl:url}})};
 api.scripting={executeScript:async options=>{const op=options.args[2];calls.push(op);if(op==='start')return[{documentId:'pdf-document',result:{size:100}}];if(op==='read'){c.abort();return[{result:{size:100,chunk:Array(100).fill(0)}}]};return[{result:{size:0}}]}};
 await assert.rejects(readBrowserPdf(8,url,c.signal,()=>{}),e=>e.name==='AbortError');assert.equal(calls.includes('drop'),true);
});

test('finishing an import cannot close a reused or navigating PDF tab', async () => {
  const source = { tabId: 8, documentId: 'original-document', url };
  let openerTabId = 8, currentDocument = false, pendingUrl;
  const removed = [];
  api.tabs = {
    getCurrent: async () => ({ openerTabId }),
    get: async () => ({ url, pendingUrl }),
    remove: async id => removed.push(id),
  };
  api.scripting.executeScript = async ({ target }) => {
    assert.deepEqual(target, { tabId: 8, documentIds: ['original-document'] });
    return [{ result: currentDocument }];
  };
  await closeImportedPdf(source);
  currentDocument = true;
  pendingUrl = 'https://papers.test/new.pdf';
  await closeImportedPdf(source);
  pendingUrl = undefined;
  openerTabId = 9;
  await closeImportedPdf(source);
  assert.deepEqual(removed, []);
  openerTabId = 8;
  await closeImportedPdf(source);
  assert.deepEqual(removed, [8]);
});

test('HTML reader transfer assembles all ranges, rejects gaps, HTML and changing files', async () => {
 const pageUrl='https://publisher.test/doi/epdf/10.1234/paper';
 const resource='https://publisher.test/doi/pdfdirect/10.1234/paper?hmac=signed';
 const data=new Uint8Array(1500000).fill(65);data.set(new TextEncoder().encode('%PDF-1.7\n'));
 const original={fetch:globalThis.fetch,document:globalThis.document,location:globalThis.location};
 let fault='',calls=[];
 globalThis.document={contentType:'text/html'};globalThis.location={href:pageUrl};
 api.runtime={sendMessage:async()=>({ok:true,value:{pdfUrl:resource,sourcePageUrl:pageUrl}})};
 api.scripting={executeScript:async o=>[{documentId:'viewer-document',result:await o.func(...o.args)}]};
 globalThis.fetch=async (url,options)=>{
  assert.equal(url,resource);assert.equal(options.credentials,'include');
  const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);const start=Number(a),end=Math.min(Number(b),data.length-1);calls.push([start,end]);
  if(fault==='html')return new Response('<html>verify</html>',{headers:{'content-type':'text/html'}});
  return new Response(data.slice(start,end+1),{status:206,headers:{'content-type':'application/pdf','content-range':`bytes ${start+(fault==='gap'?1:0)}-${end}/${data.length}`,etag:fault==='change'&&start?'v2':'v1'}});
 };
 try{
  const result=await readBrowserPdf(8,resource,new AbortController().signal,()=>{});
  assert.deepEqual(result.bytes,data);assert.deepEqual(calls,[[0,1048575],[1048576,1499999]]);
  for(fault of ['gap','html','change'])await assert.rejects(readBrowserPdf(8,resource,new AbortController().signal,()=>{}),e=>e.detail.code==='NETWORK');
  fault='';globalThis.location.href='https://publisher.test/other';
  await assert.rejects(readBrowserPdf(8,resource,new AbortController().signal,()=>{}),e=>e.detail.code==='NETWORK');
 }finally{Object.assign(globalThis,original);}
});

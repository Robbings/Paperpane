import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const output = resolve('backups/tests/download-queue.mjs');
await build({entryPoints:['src/document/download.ts'],outfile:output,bundle:true,platform:'node',format:'esm'});
const { downloadPdf } = await import(pathToFileURL(output));
const progress = () => {};
async function clock(t, fn) {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.UTC(2026,10,2)});
  const old = globalThis.fetch;
  try { await fn(async ms => { t.mock.timers.tick(ms); for(let i=0;i<30;i++) await Promise.resolve(); }); }
  finally { globalThis.fetch=old; t.mock.timers.reset(); }
}
test('429 pauses then automatically resumes without early retry',async t=>clock(t,async tick=>{
 let calls=0; globalThis.fetch=async()=>++calls===1?new Response('',{status:429,headers:{'Retry-After':'2'}}):new Response('%PDF-1.7');
 const result=downloadPdf(new URL('https://queue-recover.test/p.pdf'),new AbortController().signal,progress);
 await tick(0); assert.equal(calls,1); await tick(1999); assert.equal(calls,1); await tick(1); await result; assert.equal(calls,2);
}));
test('503 Retry-After longer than wait budget stops after one request',async()=>{
 let calls=0; const old=globalThis.fetch; globalThis.fetch=async()=>{calls++;return new Response('',{status:503,headers:{'Retry-After':'3601'}})};
 try {await assert.rejects(downloadPdf(new URL('https://queue-budget.test/p.pdf'),new AbortController().signal,progress));assert.equal(calls,1);}finally{globalThis.fetch=old;}
});
test('cancelling rate-limit wait prevents retry',async t=>clock(t,async tick=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429})};const c=new AbortController();
 const result=downloadPdf(new URL('https://queue-abort.test/p.pdf'),c.signal,progress);const rejected=assert.rejects(result,e=>e.name==='AbortError');await tick(0);c.abort();await rejected;await tick(30000);assert.equal(calls,1);
}));
test('same host is serialized while another host remains independent',async()=>{
 const old=globalThis.fetch;let release;const started=[];
 globalThis.fetch=async input=>{started.push(new URL(input).pathname);if(new URL(input).pathname==='/first.pdf')await new Promise(r=>{release=r});return new Response('%PDF-1.7')};
 try {
 const a=downloadPdf(new URL('https://serial.test/first.pdf'),new AbortController().signal,progress);
 const b=downloadPdf(new URL('https://serial.test/second.pdf'),new AbortController().signal,progress);
 await downloadPdf(new URL('https://independent.test/other.pdf'),new AbortController().signal,progress);
 assert.deepEqual(started,['/first.pdf','/other.pdf']);release();await Promise.all([a,b]);assert.equal(started.at(-1),'/second.pdf');
 }finally{globalThis.fetch=old;}
});
test('repeated throttling stops after three requests',async t=>clock(t,async tick=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'1'}})};
 const result=assert.rejects(downloadPdf(new URL('https://bounded.test/p.pdf'),new AbortController().signal,progress),e=>e.detail.code==='RATE_LIMITED');
 await tick(0);await tick(1000);await tick(1000);await result;assert.equal(calls,3);
}));
test('HTML response is rejected without retrying or returning PDF bytes',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('<html>Login</html>',{headers:{'content-type':'text/html'}})};
 try{await assert.rejects(downloadPdf(new URL('https://html.test/p.pdf'),new AbortController().signal,progress),e=>e.detail.code==='UNSUPPORTED_FILE');assert.equal(calls,1);}finally{globalThis.fetch=old;}
});

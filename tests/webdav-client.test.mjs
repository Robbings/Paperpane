import test from 'node:test';import assert from 'node:assert/strict';
import {WebDavClient} from '../src/sync/webdav-client.ts';
test('WebDAV 请求限定路径和重定向，不向跳转主机泄露凭据',async()=>{let request;const client=new WebDavClient({url:'https://dav.test/root/',username:'用户',password:'密钥'},async(url,options)=>{request={url:String(url),options};return new Response('hello',{headers:{ETag:'"v1"'}})});const result=await client.get('paperpane/manifest.json');assert.equal(result.etag,'"v1"');assert.equal(request.options.redirect,'follow');assert.match(request.options.headers.get('Authorization'),/^Basic /);await assert.rejects(()=>client.get('../zotero/file'));});
test('WebDAV 条件写入显式报告版本冲突',async()=>{const client=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},async()=>new Response('',{status:412}));await assert.rejects(()=>client.put('paperpane/manifest.json','{}','"old"'),e=>e.status===412);});
test('不允许凭据写在地址中或非本机明文 HTTP',()=>{assert.throws(()=>new WebDavClient({url:'https://u:p@dav.test/',username:'',password:''}));assert.throws(()=>new WebDavClient({url:'http://dav.test/',username:'',password:''}));});

const prop = etag => new Response(`<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:getetag>${etag.replaceAll('"','&quot;')}</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,{status:207});
const redirected = () => {const r=new Response('manifest',{headers:{ETag:'"onedrive"'}});Object.defineProperty(r,'redirected',{value:true});return r;};
test('redirected downloads use origin PROPFIND validators and never redirect writes',async()=>{
 const calls=[];const client=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},async(url,o)=>{
  calls.push(o);if(o.method==='GET')return redirected();if(o.method==='PROPFIND')return prop('"openlist"');return new Response('');
 });
 const result=await client.get('paperpane/manifest.json');assert.equal(result.etag,'"openlist"');assert.equal(await result.response.text(),'manifest');
 await client.put('paperpane/manifest.json','{}',result.etag);assert.equal(calls.at(-1).headers.get('If-Match'),'"openlist"');
 assert.equal(calls.filter(x=>x.method==='PROPFIND').length,2);
 for(const call of calls)assert.equal(call.redirect,call.method==='GET'?'follow':'error');
});
test('a concurrent origin update cannot pair stale content with a newer ETag',async()=>{
 let props=0,gets=0;const client=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},async(url,o)=>o.method==='PROPFIND'?prop(++props===1?'"old"':'"new"'):(gets++,redirected()));
 const result=await client.get('paperpane/manifest.json');assert.equal(result.etag,'"new"');assert.equal(gets,3);
});
test('unsupported ETag discovery still permits backup reads without a false validator',async()=>{
 const client=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},async(url,o)=>o.method==='PROPFIND'?new Response('',{status:405}):redirected());
 const result=await client.get('paperpane/backup.zip');assert.equal(result.etag,null);assert.equal(await result.response.text(),'manifest');
});
test('probe verifies stale If-Match, existing If-None-Match and matching writes',async()=>{
 for(const mode of ['supported','ignored','reject-matching','no-create-check']){
  const client=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},async(url,o)=>{
   if(o.method==='GET')return new Response('paperpane-connection-test',{headers:{ETag:'"dav"'}});
   const match=o.headers.get('If-Match');const existing=String(o.body)==='conditional-create-test';
   if(mode!=='ignored'&&match==='"paperpane-never-matches"'||existing&&mode!=='no-create-check')return new Response('',{status:412});
   if(mode==='reject-matching'&&match==='"dav"')return new Response('',{status:412});
   return new Response('');
  });assert.equal((await client.probe()).conditional,mode==='supported',mode);
 }
});
test('real cross-origin fetch removes authorization before following a download redirect',async()=>{
 const {createServer}=await import('node:http');let leaked;
 const storage=createServer((req,res)=>{leaked=req.headers.authorization;res.end('signed bytes');});
 await new Promise(ok=>storage.listen(0,'127.0.0.1',ok));
 const dav=createServer((req,res)=>{if(req.method==='PROPFIND'){res.writeHead(207,{'Content-Type':'application/xml'});res.end('<d:propstat xmlns:d="DAV:"><d:prop><d:getetag>&quot;origin&quot;</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>');}else{assert.match(req.headers.authorization,/^Basic /);res.writeHead(302,{Location:`http://127.0.0.1:${storage.address().port}/signed`});res.end();}});
 await new Promise(ok=>dav.listen(0,'127.0.0.1',ok));
 try{const client=new WebDavClient({url:`http://127.0.0.1:${dav.address().port}/`,username:'test',password:'fixture'});const result=await client.get('paperpane/manifest.json');assert.equal(result.etag,'"origin"');assert.equal(await result.response.text(),'signed bytes');assert.equal(leaked,undefined);}
 finally{dav.closeAllConnections();storage.closeAllConnections();await Promise.all([new Promise(ok=>dav.close(ok)),new Promise(ok=>storage.close(ok))]);}
});
test('OpenList file PROPFIND failure does not break readable backups or enable unsafe sync',async()=>{
 const calls=[];const client=new WebDavClient({url:'https://dav.test/root/',username:'u',password:'p'},async(url,o)=>{
  calls.push([String(url),o.method,o.headers.get('Depth')]);
  if(o.method==='GET'){const r=new Response('paperpane-connection-test');Object.defineProperty(r,'redirected',{value:true});return r;}
  if(o.method==='PROPFIND'&&o.headers.get('Depth')==='0')return new Response('Children cannot be listed from an item that is not a folder',{status:500});
  if(o.method==='PROPFIND')return new Response('<d:multistatus xmlns:d="DAV:"/>',{status:207});
  return new Response('');
 });
 assert.deepEqual(await client.probe(),{readable:true,writable:true,conditional:false});assert(calls.some(x=>x[1]==='PROPFIND'&&x[2]==='1'));assert.equal(calls.at(-1)[1],'DELETE');
});
test('parent ETag fallback selects only the requested file, preserving escaped validators',async()=>{
 const client=new WebDavClient({url:'https://dav.test/root/',username:'u',password:'p'},async(url,o)=>{
  if(o.method==='GET')return redirected();
  if(o.headers.get('Depth')==='0')return new Response('',{status:500});
  return new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/root/paperpane/other.json</d:href><d:propstat><d:prop><d:getetag>&quot;wrong&quot;</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:response><d:href>/root/paperpane/manifest.json</d:href><d:propstat><d:prop><d:getetag>&quot;right&quot;</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});
 });assert.equal((await client.get('paperpane/manifest.json')).etag,'"right"');
});

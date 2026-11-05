import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import 'fake-indexeddb/auto';
import { cleanOverviewTags, overviewMetadata } from '../src/ai/overview-metadata.ts';
import { paperpaneNavigationUrl } from '../src/browser-entry/publisher-pdf.ts';

test('overview/library share plain, unique bounded tags and a citation-free abstract',()=>{
 const tags=cleanOverviewTags(['代码审查[^s98]','规则分派[s124]','**代码审查**','1. LLM agents','LLM AGENTS','解释：这不是术语','', 'a very long explanatory sentence']);
 assert.deepEqual(tags,['代码审查','规则分派','LLM agents']);
 assert.deepEqual(overviewMetadata({results:{gist:{state:'completed',content:{output:'markdown',markdown:'简短摘要。[^s1]'}},keywords:{state:'completed',content:{output:'list',items:tags.map(text=>({text}))}}}}),{abstract:'简短摘要。',tags});
 assert.deepEqual(overviewMetadata({results:{gist:{state:'failed',content:{output:'markdown',markdown:'incomplete'}}}}),{abstract:undefined,tags:undefined});
});
test('Paperpane navigations opt out of Scholar takeover and preserve page selection',()=>{
 assert.equal(paperpaneNavigationUrl('https://papers.test/a.pdf#page=3'),'https://papers.test/a.pdf#page=3&gsr=0');
 assert.equal(paperpaneNavigationUrl('https://www.science.org/doi/epdf/10.1126/test'),'https://www.science.org/doi/epdf/10.1126/test#gsr=0');
});
test('shared metadata persists atomically, updates only generated tags, preserves edits and rejects stale PDF versions',async()=>{
 const {outputFiles}=await build({entryPoints:['src/data/library-database.ts'],alias:{'@':resolve('src')},bundle:true,platform:'node',format:'esm',write:false});
 const {LibraryDatabase}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].contents).toString('base64'));
 const library=new LibraryDatabase('overview-metadata-test');
 const ref={documentId:'doc',fileVersion:'v1'};
 try{
  const db=await library.open();const tx=db.transaction(['libraryItems','documents','libraryTags'],'readwrite');
  tx.objectStore('documents').put({id:'doc',fileVersion:'v1',file:{availability:'local'}});
  tx.objectStore('libraryItems').put({id:'paper',documentId:'doc',document:ref,inLibrary:true,title:'Paper',authors:[],tagIds:['manual'],revision:'r0'});
  tx.objectStore('libraryTags').put({id:'manual',label:'我的标签',normalized:'我的标签'});
  await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});
  await library.saveOverviewMetadata(ref,{abstract:'简短摘要',tags:['学习','我的标签']});
  const first=await library.getItem('paper');assert.equal(first.abstract,'简短摘要');assert.equal(first.tagIds.length,2);
  await library.saveOverviewMetadata(ref,{abstract:'简短摘要',tags:['学习','我的标签']});assert.equal((await library.getItem('paper')).revision,first.revision);
  await library.update(first.id,first.revision,{abstract:'用户修改'});
  await library.saveOverviewMetadata(ref,{abstract:'新摘要',tags:['推理']});const changed=await library.getItem('paper');assert.equal(changed.abstract,'用户修改');assert(changed.tagIds.includes('manual'));assert.equal(changed.tagIds.length,2);assert(!changed.tagIds.includes(first.tagIds.find(id=>id!=='manual')));
  await library.saveOverviewMetadata({...ref,fileVersion:'old'},{abstract:'不该覆盖',tags:['旧版']});assert.equal((await library.getItem('paper')).revision,changed.revision);
 }finally{await library.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import 'fake-indexeddb/auto';

const { outputFiles } = await build({
  stdin: { contents: `export {TranslationSession} from './src/translation/session'; export {TranslationStore} from './src/data/translation-store'; export {selectionCacheKey} from './src/translation/selection-cache';`, resolveDir: process.cwd() },
  alias: { '@': resolve('src') }, bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'model-boundary', setup(b) {
    b.onLoad({ filter: /\/model-settings\.ts$/ }, () => ({ contents: `export class ModelSettingsStore { async close(){} async resolveTranslationEngine(){globalThis.resolutions++;if(globalThis.offline)throw Error('offline');return {key:'llm:test'};} }` }));
    b.onLoad({ filter: /\/consent\.ts$/ }, () => ({ contents: 'export async function allowTranslation(){return true;}' }));
    b.onLoad({ filter: /\/task-engine\.ts$/ }, () => ({ contents: `
      export function carryOutputs(run){return structuredClone(run.outputs);}
      export function packBatches(sentences){return sentences.map(s=>[s]);}
      export function prepareTranslation(_,language,sourceLanguage){return {profile:{language,sourceLanguage,promptVersion:'test',engine:{key:'llm:test'}},concurrency:1,rpm:600000,engine:{id:'test',async translate(input,output){globalThis.requests++;await output({raw:'translated',sentences:input.sentences.map(s=>({id:s.id,text:'译文:'+s.source,complete:true}))});}}};}
    ` }));
  } }],
});
const { TranslationSession, TranslationStore, selectionCacheKey } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: { request: async (_name, _options, callback) => callback({}), query: async () => ({held:[]}) } });
const ref = { documentId: 'cache-document', fileVersion: 'hash-v1' };
const anchor = page => ({...ref,pages:[{pageIndex:page,rects:[{x:10,y:20,width:200,height:12}]}]});
const paper = { ...ref, version:'layout-sentences-2', pageCount:2, warnings:[], sentences:[0,1].map(page=>({id:'s'+page,paragraphId:'p'+page,source:'Page '+page,kind:'text',anchor:anchor(page)})) };
const store = new TranslationStore();
const native = await store.open();
const tx = native.transaction('documents','readwrite');
tx.objectStore('documents').put({id:ref.documentId,fileVersion:ref.fileVersion,syncScope:'record-and-file'});
await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});
globalThis.requests=0;globalThis.resolutions=0;globalThis.offline=false;
let extractions=0;
const session = (selection, source=paper) => new TranslationSession(ref,async()=>{extractions++;return source;},()=>{},selection);
test('page translation survives closing/reopening; whole-paper translation requests only missing pages', async () => {
  let s=session();await s.load();await s.start('zh-CN',0);assert.equal(s.output('s0').state,'done');assert.equal(requests,1);await s.dispose();
  s=session();await s.load();assert.equal(s.output('s0').text,'译文:Page 0');assert.equal(extractions,1,'source extraction is also durable');
  await s.start('zh-CN');assert.equal(requests,2);assert.equal(s.output('s1').state,'done');await s.dispose();
  globalThis.offline=true;const before=resolutions;
  s=session();await s.load();await s.start('zh-CN');await s.start('zh-CN',1);await s.startAutomatic('zh-CN');
  assert.equal(requests,2);assert.equal(resolutions,before,'completed cache needs no provider configuration');assert.equal(s.error,undefined);await s.dispose();globalThis.offline=false;
});
test('explicit retranslation still requests the provider', async () => {
  const s=session();await s.load();const before=requests;await s.start('zh-CN',0,false,undefined,true);assert.equal(requests,before+1);await s.dispose();
});
test('switching target languages reuses the corresponding saved history', async () => {
  const s=session();await s.load();await s.start('en');const before=requests;
  globalThis.offline=true;await s.start('zh-CN');assert.equal(requests,before);assert.equal(s.run.profile.language,'zh-CN');assert.equal(s.error,undefined);await s.dispose();globalThis.offline=false;
});
test('selection key ignores rectangle jitter; legacy stored selections remain reusable', async () => {
  const selection={key:'old-geometry-hash',text:'A selected paragraph',anchor:anchor(0),sourceLanguage:'auto'};
  const moved=structuredClone(selection);moved.anchor.pages[0].rects[0].x+=0.4;
  assert.equal(await selectionCacheKey(selection),await selectionCacheKey(moved));
  const different=structuredClone(selection);different.anchor.pages[0].pageIndex=1;
  assert.notEqual(await selectionCacheKey(selection),await selectionCacheKey(different));
  const oldPaper={...paper,version:'selection-v1:old-geometry-hash',sentences:[{...paper.sentences[0],id:'selection-text',source:selection.text}]};
  let s=session(selection,oldPaper);await s.load();await s.start('zh-CN');await s.dispose();
  moved.key=await selectionCacheKey(moved);const before=requests;globalThis.offline=true;
  s=session(moved,{...oldPaper,version:'selection-v1:'+moved.key});await s.load();assert.equal(s.output('selection-text').state,'done');await s.resume('zh-CN');assert.equal(requests,before);assert.equal(s.error,undefined);await s.dispose();globalThis.offline=false;
  assert.notEqual((await store.latest(ref)).scope.kind,'selection','selection never replaces the paper translation');
});
test.after(async()=>{await store.close();});

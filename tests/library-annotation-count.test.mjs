import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import 'fake-indexeddb/auto';

test('library counts existing, active annotations for the current file only', async () => {
  const { outputFiles } = await build({
    entryPoints: ['src/data/library-database.ts'], alias: { '@': resolve('src') },
    bundle: true, platform: 'node', format: 'esm', write: false,
  });
  const { LibraryDatabase } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
  const library = new LibraryDatabase('library-count-test');
  try {
    const native = await library.open();
    const tx = native.transaction(['libraryItems', 'documents', 'annotations'], 'readwrite');
    const item = { inLibrary: true, addedAt: '2026-11-02', tagIds: [], authors: [] };
    const ref = { documentId: 'doc', fileVersion: 'v1' };
    tx.objectStore('libraryItems').put({ ...item, id: 'paper', title: 'Paper', documentId: 'doc', document: ref });
    tx.objectStore('libraryItems').put({ ...item, id: 'bib', title: 'Bibliography' });
    tx.objectStore('documents').put({ id: 'doc', fileVersion: 'v2', file: { availability: 'local' } });
    const put = (id, documentKey, deletedAt) => tx.objectStore('annotations').put({ id, documentKey, deletedAt });
    put('highlight', ['doc', 'v2']);
    put('comment', ['doc', 'v2']);
    put('trash', ['doc', 'v2'], '2026-11-02');
    put('previous', ['doc', 'v1']);
    put('unrelated', ['other', 'v2']);
    await new Promise((ok, no) => { tx.oncomplete = ok; tx.onabort = () => no(tx.error); });
    const result = await library.query({ collection: { kind: 'all' }, text: '', fields: ['title'], tagIds: [], sort: { column: 'title', direction: 'asc' } }, 60);
    assert.deepEqual(result.items.map(item => [item.id, item.annotationCount]), [['bib', 0], ['paper', 2]]);
  } finally {
    await library.close();
  }
});

test('saving a reader short note persists it and preserves concurrent library edits', async () => {
  const { outputFiles } = await build({entryPoints:['src/data/library-database.ts'],alias:{'@':resolve('src')},bundle:true,platform:'node',format:'esm',write:false});
  const { LibraryDatabase } = await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].contents).toString('base64'));
  const db=new LibraryDatabase('reader-short-note');
  try {
    const native=await db.open(),tx=native.transaction(['documents','libraryItems'],'readwrite');
    const ref={documentId:'doc',fileVersion:'v1'};
    tx.objectStore('documents').put({id:'doc',fileVersion:'v1',syncScope:'record-and-file',file:{availability:'local'}});
    tx.objectStore('libraryItems').put({id:'paper',documentId:'doc',title:'Paper',authors:[],tagIds:[],folderId:null,inLibrary:false});
    await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});
    const baseline={title:'Paper',authors:[],folderId:null,tags:[]};
    const saved=await db.saveDocumentEntry(ref,{...baseline,shortNote:'Read the proof'},baseline);
    assert.equal((await db.getItemForDocument('doc')).shortNote,'Read the proof');
    await db.saveDocumentEntry(ref,{...baseline,title:'Renamed'},baseline);
    assert.equal((await db.getItemForDocument('doc')).shortNote,'Read the proof','an untouched note is not overwritten');
    await assert.rejects(db.saveDocumentEntry(ref,{...baseline,shortNote:'Conflicting note'},baseline),/别处改过/);
    assert(saved.item.editedFields.includes('shortNote'));
  } finally {await db.close();}
});

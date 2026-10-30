import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, inspectBackup } from '../src/transfer/backup.ts';
const fixture=()=>({format:'paperpane-backup',version:1,id:'snapshot-test',createdAt:'2026-10-30T00:00:00Z',complete:true,databases:[{name:'paperpane',version:3,stores:{documents:[{id:'doc',fileVersion:'v1',file:{assetId:'asset',sha256:'hash'}}],libraryItems:[]}}],assets:[],preferences:{}});
test('备份包往返保留中文和嵌套记录，并校验 PDF 内容',async()=>{
 const data=fixture();data.databases[0].stores.libraryItems=[{id:'paper',title:'中文标题',document:{documentId:'doc',fileVersion:'v1'}}];
 const bytes=new TextEncoder().encode('%PDF-1.7 test');const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 data.databases[0].stores.documents[0].file.sha256=hash;data.assets=[{database:'paperpane',id:'asset',sha256:hash,createdAt:data.createdAt,blob:new Blob([bytes],{type:'application/pdf'})}];
 const blob=await createBackup(data);const result=await inspectBackup(blob);assert.equal(result.databases[0].stores.libraryItems[0].title,'中文标题');assert.equal(result.assets[0].sha256,hash);assert.equal(await result.assets[0].blob.text(),'%PDF-1.7 test');
});
test('完整备份缺少 PDF 时拒绝生成，数据备份明确标记不完整',async()=>{
 await assert.rejects(()=>createBackup(fixture()),/PDF|文件/);
 const data=fixture();data.complete=false;const read=await inspectBackup(await createBackup(data));assert.equal(read.complete,false);
});
test('损坏备份不会进入恢复阶段',async()=>{await assert.rejects(()=>inspectBackup(new Blob(['not a zip'])));});

import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFArray, degrees } from 'pdf-lib';
import { nativeOutline, generatedOutline } from '../src/document/reader/navigation.ts';
import { annotatedPdf } from '../src/document/reader/export-pdf.ts';
test('原生目录解析命名和显式目标，保留层级并排除外部链接',async()=>{
 const pdf={numPages:3,getOutline:async()=>[{title:'开始',dest:'start',items:[{title:'子节',dest:[{num:2,gen:0},{name:'XYZ'},0,200,null],items:[]}]},{title:'外链',url:'https://example.com',items:[]}],getDestination:async()=>[0,{name:'Fit'}],getPageIndex:async()=>2};
 const rows=await nativeOutline(pdf);assert.equal(rows.length,2);assert.equal(rows[1].depth,1);assert.equal(rows[1].pageIndex,2);
});
test('自动目录取版面标题、层级编号，排除长正文',()=>{
 const rows=generatedOutline([{kind:'heading',source:'1 Introduction',anchor:{pages:[{pageIndex:0,rects:[{x:10,y:100,width:60,height:12}]}]}},{kind:'heading',source:'1.1 Background',anchor:{pages:[{pageIndex:1,rects:[{x:20,y:200,width:60,height:12}]}]}},{kind:'text',source:'正文'}]);
 assert.equal(rows.length,2);assert.equal(rows[1].depth,1);assert.equal(rows[1].top,212);
});
test('PDF 导出保留页数旋转和原批注，写入跨页高亮、中文评论并忽略已删除标注',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage([300,400]).setCropBox(20,30,260,350);pdf.addPage([400,300]).setRotation(degrees(90));
 pdf.getPage(0).node.set(PDFName.of('Annots'),pdf.context.obj([pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Text',Rect:[0,0,10,10]}))]));
 const row={id:'a',color:'yellow',kind:'highlight',quote:'原文',comment:'中文评论\n第二行',anchor:{pages:[{pageIndex:0,rects:[{x:10,y:20,width:50,height:10}]},{pageIndex:1,rects:[{x:30,y:40,width:60,height:10}]}]}};
 const bytes=await annotatedPdf(await pdf.save(),[row,{...row,id:'deleted',deletedAt:'now'}]);const read=await PDFDocument.load(bytes);
 assert.equal(read.getPageCount(),2);assert.equal(read.getPage(1).getRotation().angle,90);
 for(const [i,page] of read.getPages().entries()){const a=page.node.lookup(PDFName.of('Annots'),PDFArray);assert.equal(a.size(),i===0?2:1);const dict=read.context.lookup(a.get(a.size()-1));assert.equal(dict.get(PDFName.of('Contents')).decodeText(),'中文评论\n第二行');assert.ok(dict.get(PDFName.of('AP')));}
 const a=read.context.lookup(read.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray).get(1));assert.deepEqual(a.lookup(PDFName.of('Rect'),PDFArray).asArray().map(n=>n.asNumber()),[30,50,80,60]);
});

test('导出坐标使用 CropBox 与 MediaBox 交集',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage([300,400]).setCropBox(-20,-30,300,400);
 const row={id:'crop',color:'green',kind:'highlight',quote:'',comment:'',anchor:{pages:[{pageIndex:0,rects:[{x:10,y:20,width:50,height:10}]}]}};
 const read=await PDFDocument.load(await annotatedPdf(await pdf.save(),[row]));
 const a=read.context.lookup(read.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray).get(0));
 assert.deepEqual(a.lookup(PDFName.of('Rect'),PDFArray).asArray().map(n=>n.asNumber()),[10,20,60,30]);
});

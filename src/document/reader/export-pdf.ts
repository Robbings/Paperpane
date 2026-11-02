import { PDFDocument, PDFName, PDFHexString, PDFArray } from 'pdf-lib';
import type { Annotation } from '@/contracts/annotations';
const colors = {yellow:[1,1,.596],green:[.325,1,.737],blue:[.502,.922,1],pink:[1,.796,.902],purple:[.863,.796,1]} as const;
/** Export from durable PDF coordinates, including pages never mounted in the viewer. */
export async function annotatedPdf(bytes: Uint8Array, rows: readonly Annotation[]): Promise<Uint8Array> {
  const pdf=await PDFDocument.load(bytes).catch((error:unknown)=>{
    if(error instanceof Error&&error.message.includes('encrypted'))throw new Error('这份 PDF 已加密，暂不能导出带标注版本；请先使用解密后的副本。');
    throw error;
  });
  for(const row of rows) {
    if(row.deletedAt)continue;
    for(const part of row.anchor.pages) {
      const page=pdf.getPage(part.pageIndex),crop=page.getCropBox(),media=page.getMediaBox();
      const x=Math.max(crop.x,media.x),y=Math.max(crop.y,media.y);
      const intersects=Math.min(crop.x+crop.width,media.x+media.width)>x&&Math.min(crop.y+crop.height,media.y+media.height)>y;
      const origin=intersects?{x,y}:media;
      const rects=part.rects.filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0).map(r=>({...r,x:r.x+origin.x,y:r.y+origin.y}));
      if(!rects.length)throw new Error('批注位置无效，无法导出。');
      const [r,g,b]=colors[row.color];
      const left=Math.min(...rects.map(r=>r.x)),bottom=Math.min(...rects.map(r=>r.y));
      const right=Math.max(...rects.map(r=>r.x+r.width)),top=Math.max(...rects.map(r=>r.y+r.height));
      const highlight=row.kind==='highlight';
      const rect=highlight?[left,bottom,right,top]:[left,bottom,left+16,bottom+16];
      const note=pdf.context.obj({Type:'Annot',Subtype:highlight?'Highlight':'Text',Rect:rect,Contents:PDFHexString.fromText(row.comment || row.quote),T:PDFHexString.fromText('纸窗 Paperpane'),NM:PDFHexString.fromText(`paperpane:${row.id}:${part.pageIndex}`),C:[r,g,b],F:4,Name:'Comment'});
      if(highlight)note.set(PDFName.of('QuadPoints'),pdf.context.obj(rects.flatMap(q=>[q.x,q.y+q.height,q.x+q.width,q.y+q.height,q.x,q.y,q.x+q.width,q.y])));
      const paint=highlight?rects.map(q=>`${q.x-left} ${q.y-bottom} ${q.width} ${q.height} re f`).join('\n'):'0 0 16 16 re f';
      const appearance=pdf.context.flateStream(`q /GS gs ${r} ${g} ${b} rg\n${paint}\nQ`,{Type:'XObject',Subtype:'Form',BBox:[0,0,rect[2]!-rect[0]!,rect[3]!-rect[1]!],Resources:{ExtGState:{GS:{Type:'ExtGState',ca:.42,CA:.42,BM:'Multiply'}}}});
      note.set(PDFName.of('AP'),pdf.context.obj({N:pdf.context.register(appearance)}));
      let annots=page.node.lookupMaybe(PDFName.of('Annots'),PDFArray);
      if(!annots){annots=pdf.context.obj([]);page.node.set(PDFName.of('Annots'),annots);}
      annots.push(pdf.context.register(note));
    }
  }
  return pdf.save();
}

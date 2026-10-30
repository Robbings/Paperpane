import { getDocument } from 'pdfjs-dist';
import type { Annotation } from '@/contracts/annotations';
/** Called with a window opened synchronously by the original user gesture. */
export async function printAnnotatedPdf(win:Window,bytes:Uint8Array,rows:readonly Annotation[],title:string) {
  const doc=win.document;doc.title=`${title} · 带标注打印`;
  const style=doc.createElement('style');
  style.textContent='body{margin:0;font:14px sans-serif;color:#111;background:white} .sheet{break-after:page} .sheet img{display:block;width:100%;height:100%;object-fit:contain} .comments{padding:24px;white-space:pre-wrap;overflow-wrap:anywhere} article{break-inside:avoid;margin-bottom:24px} @media print{.controls{display:none}}';
  doc.head.append(style);
  const controls=doc.createElement('div');controls.className='controls';controls.textContent='正在准备全部页面，可关闭此窗口取消。';doc.body.replaceChildren(controls);
  const task=getDocument({data:bytes,enableXfa:false});
  try {
    const pdf=await task.promise;
    for(let i=1;i<=pdf.numPages;i++) {
      if(win.closed)throw new Error('打印已取消');
      const page=await pdf.getPage(i),base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(2,2000/Math.max(base.width,base.height))});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      try {
        await page.render({canvas,viewport,intent:'print'}).promise;
        if(win.closed)throw new Error('打印已取消');
        const section=doc.createElement('section');section.className='sheet';section.style.page=`pdfpage${i}`;section.style.width=`${base.width}pt`;section.style.height=`${base.height}pt`;section.style.overflow='hidden';
        style.textContent+=`@page pdfpage${i}{size:${base.width}pt ${base.height}pt;margin:0}`;
        const image=doc.createElement('img');image.alt=`第 ${i} 页`;image.src=canvas.toDataURL('image/jpeg',.95);await image.decode();section.append(image);doc.body.append(section);
      } finally {canvas.width=canvas.height=0;}
      controls.textContent=`正在准备第 ${i} / ${pdf.numPages} 页…`;
    }
    const comments=rows.filter(r=>!r.deletedAt&&r.comment.trim());
    if(comments.length){
      const section=doc.createElement('section');section.className='comments';const heading=doc.createElement('h1');heading.textContent='评论清单';section.append(heading);
      for(const row of comments){const article=doc.createElement('article');const h=doc.createElement('h2');h.textContent=`第 ${row.anchor.pages.map(p=>p.pageIndex+1).join('、')} 页`;const quote=doc.createElement('blockquote');quote.textContent=row.quote;const note=doc.createElement('p');note.textContent=row.comment;article.append(h,quote,note);section.append(article);}doc.body.append(section);
    }
    controls.textContent='全部页面已就绪。';const button=doc.createElement('button');button.textContent='打印 / 另存为 PDF';button.onclick=()=>win.print();controls.append(button);
    win.focus();win.print();
  } finally {await task.destroy();}
}

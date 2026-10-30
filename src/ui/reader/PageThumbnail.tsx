import { useEffect, useRef, useState } from 'react';
export type ThumbnailRenderer = (pageIndex:number,signal:AbortSignal)=>Promise<string>;
export function PageThumbnail({index,render}:{index:number;render:ThumbnailRenderer}) {
  const ref=useRef<HTMLSpanElement>(null);
  const [image,setImage]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const node=ref.current;if(!node)return;
    const abort=new AbortController();setImage('');setFailed(false);
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(e=>e.isIntersecting))return;
      observer.disconnect();
      void render(index,abort.signal).then(url=>{if(!abort.signal.aborted)setImage(url);}).catch(()=>{if(!abort.signal.aborted)setFailed(true);});
    },{root:node.closest('.pp-sidebar__scroll'),rootMargin:'160px'});
    observer.observe(node);return()=>{observer.disconnect();abort.abort();};
  },[index,render]);
  return <span ref={ref} className="pp-thumb__page pp-thumb__page--live">{image?<img src={image} alt=""/>:<span className="pp-thumb__status">{failed?'加载失败':'加载中…'}</span>}</span>;
}

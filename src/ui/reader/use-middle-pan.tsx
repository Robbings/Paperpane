import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Middle-drag pans directly; a click arms pointer-distance autoscroll. */
export function useMiddlePan(container: HTMLDivElement | null) {
  const [origin, setOrigin] = useState<{x:number;y:number}|null>(null);
  useEffect(()=>{
    if(!container)return;
    let gesture: {x:number;y:number;left:number;top:number;id:number;moved:boolean;started:number}|null=null;
    let auto: {x:number;y:number}|null=null;
    let pointer={x:0,y:0}, frame=0, previous=0;
    let suppressClick=false;
    const stop=()=>{
      const id=gesture?.id;gesture=null;auto=null;cancelAnimationFrame(frame);previous=0;
      if(id!==undefined&&container.hasPointerCapture(id))container.releasePointerCapture(id);
      container.removeAttribute('data-middle-pan');setOrigin(null);
    };
    const speed=(d:number)=>Math.sign(d)*Math.min(900,Math.pow(Math.max(0,Math.abs(d)-14),1.35)*1.7);
    const tick=(time:number)=>{
      if(!auto)return;
      const dt=Math.min(32,previous?time-previous:16)/1000;previous=time;
      container.scrollLeft+=speed(pointer.x-auto.x)*dt;container.scrollTop+=speed(pointer.y-auto.y)*dt;
      frame=requestAnimationFrame(tick);
    };
    const down=(event:PointerEvent)=>{
      suppressClick=false;
      if(auto){suppressClick=event.button===0;event.preventDefault();event.stopImmediatePropagation();stop();return;}
      if(event.button!==1||!container.contains(event.target as Node)||(event.target as Element).closest('button,a,input,textarea,select,[contenteditable="true"],[data-pp-overlay]'))return;
      event.preventDefault();event.stopPropagation();
      gesture={x:event.clientX,y:event.clientY,left:container.scrollLeft,top:container.scrollTop,id:event.pointerId,moved:false,started:performance.now()};
      pointer={x:event.clientX,y:event.clientY};container.setPointerCapture(event.pointerId);container.dataset.middlePan='drag';
    };
    const move=(event:PointerEvent)=>{
      pointer={x:event.clientX,y:event.clientY};
      if(!gesture||gesture.id!==event.pointerId)return;
      if(!(event.buttons&4)){stop();return;}
      const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
      if(Math.hypot(dx,dy)>4)gesture.moved=true;
      if(gesture.moved){event.preventDefault();container.scrollLeft=gesture.left-dx;container.scrollTop=gesture.top-dy;}
    };
    const up=(event:PointerEvent)=>{
      if(!gesture||gesture.id!==event.pointerId)return;
      event.preventDefault();event.stopPropagation();const g=gesture;stop();
      if(!g.moved&&performance.now()-g.started<450){auto={x:g.x,y:g.y};setOrigin(auto);container.dataset.middlePan='auto';frame=requestAnimationFrame(tick);}
    };
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&(auto||gesture)){event.preventDefault();event.stopPropagation();stop();}};
    const click=(event:MouseEvent)=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}};
    const aux=(event:MouseEvent)=>{if(event.button===1&&container.contains(event.target as Node)&&!(event.target as Element).closest('a,[data-pp-overlay]'))event.preventDefault();};
    const hidden=()=>{if(document.hidden)stop();};
    window.addEventListener('click',click,true);window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);
    window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);window.addEventListener('keydown',key,true);
    container.addEventListener('auxclick',aux);container.addEventListener('wheel',stop,{passive:true});document.addEventListener('visibilitychange',hidden);
    return()=>{stop();window.removeEventListener('click',click,true);window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);window.removeEventListener('keydown',key,true);container.removeEventListener('auxclick',aux);container.removeEventListener('wheel',stop);document.removeEventListener('visibilitychange',hidden);};
  },[container]);
  return origin?createPortal(<span className="pp-pan-origin pp-glass" data-tone="float" style={{left:origin.x,top:origin.y}} aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span>,document.body):null;
}

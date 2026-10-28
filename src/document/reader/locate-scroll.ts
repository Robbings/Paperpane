interface Rect { left:number; top:number; width:number; height:number }
interface Viewport extends Rect { scrollLeft:number; scrollTop:number; scrollWidth:number; scrollHeight:number }
const clamp=(value:number,max:number)=>Math.max(0,Math.min(value,Math.max(0,max)));

/** Shared passage/search positioning. Coordinates are viewport CSS pixels, after PDF rotation. */
export function passageScroll(target:Rect,view:Viewport,preferredLeft=view.scrollLeft){
  const margin=Math.min(24,view.width*.05),headroom=Math.min(80,view.height/4);
  const x=target.left-view.left+view.scrollLeft,y=target.top-view.top+view.scrollTop;
  const fitsX=x>=preferredLeft+margin&&x+target.width<=preferredLeft+view.width-margin;
  const fitsY=y>=view.scrollTop+headroom&&y+target.height<=view.scrollTop+view.height-24;
  return {
    left:clamp(fitsX?preferredLeft:x+target.width/2-view.width/2,view.scrollWidth-view.width),
    top:clamp(fitsX&&fitsY?view.scrollTop:y-view.height/3,view.scrollHeight-view.height),
  };
}

import type { RefObject } from 'react';
import { Button, IconButton, Popover, Segmented } from '@/ui/components';
import type { ReaderSettingsProps } from './QuickSettings';
import type { Rotation } from './types';

export function ReadingOptions({ anchorRef, open, onClose, settings, rotation, onRotate, onFitWidth }: {
  anchorRef: RefObject<HTMLButtonElement | null>; open: boolean; onClose: () => void;
  settings?: ReaderSettingsProps; rotation: Rotation; onRotate: (angle: Rotation) => void; onFitWidth: () => void;
}) {
  const p = settings?.preferences;
  return <Popover anchorRef={anchorRef} open={open} onClose={onClose} label="页面显示" width={288} className="pp-page-options">
    {p && <>
      <div className="pp-page-options__row"><span>滚动</span><Segmented label="滚动方式" size="sm" value={p.pdfScroll} options={[{value:'vertical',label:'纵向'},{value:'horizontal',label:'横向'},{value:'page',label:'逐页'}]} onChange={v=>settings.onPreference('pdfScroll',v)}/></div>
      <div className="pp-page-options__row"><span>分页</span><Segmented label="分页方式" size="sm" value={p.pdfSpread} options={[{value:'none',label:'单页'},{value:'odd',label:'双页'},{value:'even',label:'封面'}]} onChange={v=>settings.onPreference('pdfSpread',v)}/></div>
    </>}
    <div className="pp-page-options__row"><span>缩放</span><Button size="sm" onClick={onFitWidth}>适合宽度</Button></div>
    <div className="pp-page-options__row"><span>旋转</span><div className="pp-page-options__rotation">
      <IconButton icon="rotate" className="pp-page-options__counterclockwise" label="逆时针旋转" size="md" shape="pill" onClick={()=>onRotate(((rotation+270)%360) as Rotation)}/>
      <button className="pp-page-options__angle" onClick={()=>onRotate(0)} title="恢复页面方向">{rotation}°</button>
      <IconButton icon="rotate" label="顺时针旋转" size="md" shape="pill" onClick={()=>onRotate(((rotation+90)%360) as Rotation)}/>
    </div></div>
    {p && <div className="pp-page-options__themes" role="group" aria-label="论文主题">
      {([{value:'auto',label:'跟随',bg:'var(--pp-surface)',fg:'var(--pp-text)'},{value:'original',label:'原色',bg:'#fff',fg:'#252529'},{value:'dark',label:'深色',bg:'#2f3440',fg:'#d9dce3'},{value:'black',label:'纯黑',bg:'#101114',fg:'#e1e1e5'},{value:'sepia',label:'纸色',bg:'#f4ecd8',fg:'#4d4233'}] as const).map(t=><button key={t.value} aria-pressed={p.pdfTheme===t.value} style={{background:t.bg,color:t.fg}} onClick={()=>settings.onPreference('pdfTheme',t.value)}>{t.label}</button>)}
    </div>}
  </Popover>;
}

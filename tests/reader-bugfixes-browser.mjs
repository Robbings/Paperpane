import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve, extname } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href);
const directory=resolve('backups/tests/reader-bugfixes-browser');await mkdir(directory,{recursive:true});
await build({stdin:{contents:`
import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {PassageWindow} from './src/ui/reader/windows/PassageWindow';
import {SaveToLibraryPopover} from './src/ui/reader/library/SaveToLibraryPopover';
import {OverflowLabel} from './src/ui/library/OverflowLabel';
import {ResearchMarkdown} from './src/ai/markdown';
import {ChatAnswer} from './src/ui/reader/chat/ChatMessage';
import {cleanCopyHandlers} from './src/ui/components/cleanCopy';
import {LibraryDatabase} from './src/data/library-database';
import './src/ui/library/library.css';import './src/ui/reader/chat/chat.css';
window.db=new LibraryDatabase('reader-bugfixes-ui');
function App(){
 const button=useRef(null),[open,setOpen]=useState(false);
 const container=document.querySelector('#paper'),page=document.querySelector('.page');
 const subscribe=React.useCallback(fn=>{container.addEventListener('scroll',fn);return()=>container.removeEventListener('scroll',fn);},[]);
 const [scale,setScale]=useState(100),[second,setSecond]=useState(true),[layout,setLayout]=useState({dx:-280,dy:0,width:300,height:180,zoom:100});
 const point=()=>({x:page.getBoundingClientRect().left+200,y:page.getBoundingClientRect().top+120});
 return <><button ref={button} onClick={()=>setOpen(true)}>收藏测试</button><button onClick={()=>setScale(s=>s===100?125:100)}>缩放测试</button>
 <SaveToLibraryPopover open={open} onClose={()=>setOpen(false)} anchorRef={button} initial={{title:'Paper',authors:[],folderId:null,tags:[]}} saved={false} folders={[]} tags={[]} onSave={draft=>window.saved=draft} onRemove={()=>{}}/>
 <div id="metadata" style={{width:120}}><OverflowLabel>Author One, Author Two, Author Three, Author Four</OverflowLabel></div>
 <div id="answer" data-math-delimiter="brackets" {...cleanCopyHandlers}><ResearchMarkdown text={'A formula $x_1^2$ and $$E=mc^2$$.'} marker={()=>null}/></div>
 <div id="answer-button"><ChatAnswer mathDelimiter="dollars" message={{markdown:'Answer '+String.raw\`\\[x^2\\]\`,attachments:[],citations:[]}} latest busy={false} onRegenerate={()=>{}} onVersion={()=>{}} onLocate={()=>{}} onRecover={()=>{}}/></div>
 <PassageWindow label="译文测试" icon={null} collapsedTitle="译文" container={container} layout={layout} onLayoutChange={setLayout} zoomPercent={scale} anchorPoint={point} sourceRects={()=>[]} subscribeGeometry={subscribe} onClose={()=>{}} onLocate={()=>{}}>Saved translation</PassageWindow>
 {second&&<PassageWindow label="解释测试" icon={null} collapsedTitle="解释" container={container} initialOffset={{x:300,y:230}} anchorPoint={point} sourceRects={()=>[]} subscribeGeometry={subscribe} onClose={()=>setSecond(false)} onLocate={()=>{}}>Explanation</PassageWindow>}
 </>;
}
createRoot(document.querySelector('#app')).render(<App/>);
`,resolveDir:process.cwd(),loader:'tsx'},alias:{'@':resolve('src')},bundle:true,jsx:'automatic',platform:'browser',format:'esm',outfile:directory+'/fixture.js',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},plugins:[{name:'assets',setup(b){b.onResolve({filter:/\?url$/},()=>({path:'unused-worker',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default "";'}));}}]});
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="stylesheet" href="/fixture.css"><style>:root{font-size:16px;--pp-text:#222;--pp-fill:#eee;--pp-z-float:100;--pp-radius-float:12px;--pp-dur-med:0s}body{font-family:sans-serif}.pp-dialog{background:white}.pp-popover{background:white}#paper{position:absolute;left:40px;top:260px;width:800px;height:550px;overflow:auto;padding:16px;box-sizing:border-box;background:#ddd}.pdfViewer{position:relative}.page{width:768px;height:1100px;background:white;position:relative}.pp-note{background:white}</style></head><body><div id="app"></div><div id="paper"><div class="pdfViewer"><div class="page"></div></div></div><script type="module" src="/fixture.js"></script></body></html>');return;}const file=resolve(directory,'.'+req.url);if(!file.startsWith(directory+'/')){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({executablePath:process.env.PAPERPANE_CHROMIUM,headless:true});
const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'收藏测试'}).waitFor();
 await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.copied=text;};});
 await page.getByRole('button',{name:'复制回答'}).click();assert.equal(await page.evaluate(()=>window.copied),'Answer $$\nx^2\n$$');
 for(const delimiter of ['brackets','dollars','none']){
 const copied=await page.evaluate(delimiter=>{const root=document.querySelector('#answer');root.dataset.mathDelimiter=delimiter;const range=document.createRange();range.selectNodeContents(root);getSelection().removeAllRanges();getSelection().addRange(range);const data=new DataTransfer();root.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));getSelection().removeAllRanges();return data.getData('text/plain');},delimiter);
 assert.equal((copied.match(/x_1\^2/g)??[]).length,1,copied);assert(copied.includes(delimiter==='brackets'?'\\(x_1^2\\)':delimiter==='dollars'?'$x_1^2$':'x_1^2'));assert(!copied.includes('x12'));
 }
 console.log('PASS rendered formula selection and whole-answer copy follow all delimiter preferences');
 await page.getByRole('button',{name:'收藏测试'}).click();await page.getByRole('button',{name:'未分类',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'选择文件夹',exact:true});await picker.waitFor();
 await picker.getByRole('button',{name:'新建文件夹',exact:true}).click();await picker.getByRole('textbox',{name:'新名称'}).fill('Parent');await picker.getByRole('textbox',{name:'新名称'}).press('Enter');await picker.getByText('Parent',{exact:true}).waitFor();
 assert(await page.getByRole('dialog',{name:'收藏到文献库',exact:true}).isVisible());
 await picker.getByRole('button',{name:'新建子文件夹',exact:true}).click();await picker.getByRole('textbox',{name:'新名称'}).fill('Child');await picker.getByRole('textbox',{name:'新名称'}).press('Enter');await picker.getByText('Child',{exact:true}).waitFor();
 await picker.getByText('Child',{exact:true}).dblclick();await picker.getByRole('textbox',{name:'新名称'}).fill('Discarded');await picker.getByRole('textbox',{name:'新名称'}).press('Escape');await picker.getByText('Child',{exact:true}).waitFor();assert(await picker.isVisible());
 await picker.getByRole('button',{name:'选择',exact:true}).click();await page.getByRole('button',{name:'Parent / Child',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await page.getByRole('textbox',{name:'短注释',exact:true}).fill('Read the proof');await page.getByRole('button',{name:'收藏',exact:true}).click();assert.equal((await page.evaluate(()=>window.saved)).shortNote,'Read the proof');
 console.log('PASS nested folder creation, Enter keeps dialogs open, destination and short note are retained');
 const label=page.locator('#metadata .pp-overflow-label'),inner=label.locator('span');await label.hover();await page.waitForTimeout(500);assert.equal(await inner.evaluate(e=>getComputedStyle(e).transform),'none');await page.waitForTimeout(1300);assert.notEqual(await inner.evaluate(e=>getComputedStyle(e).transform),'none');await page.mouse.move(1100,850);assert.equal(await inner.evaluate(e=>getComputedStyle(e).transform),'none');
 console.log('PASS overflowing metadata waits before scrolling and resets on pointer exit');
 const card=page.getByRole('region',{name:'译文测试'});await card.waitFor();
 // Drag from a partly clipped card with the left gutter exhausted. Controlled layout
 // uses a fixture callback below so the actual PassageWindow owns the update.
 await page.evaluate(()=>document.querySelector('#paper').scrollLeft=0);
 const box=await card.boundingBox();const header=card.locator('header');const hb=await header.boundingBox();
 await page.mouse.move(Math.max(80,hb.x+60),hb.y+18);await page.mouse.down();await page.mouse.move(Math.max(80,hb.x+60)+12,hb.y+18,{steps:6});await page.waitForTimeout(150);const moved=await card.boundingBox();await page.mouse.up();const released=await card.boundingBox();
 assert(Math.abs(released.x-moved.x)<2,'release must not snap');assert(Math.abs(moved.x-box.x-12)<2,'movement must follow the pointer: '+(moved.x-box.x));
 await page.getByRole('button',{name:'缩放测试'}).click();await page.getByRole('button',{name:'最小化译文测试'}).click();await page.getByRole('button',{name:'展开译文测试'}).click();await page.getByRole('button',{name:'关闭解释测试'}).click();assert.equal(errors.length,0,errors.join('\n'));
 await page.screenshot({path:directory+'/verified.png'});console.log('PASS passage drag, release, scaling, collapse/expand and multiple windows; no browser errors');
}finally{await browser.close();await new Promise(ok=>server.close(ok));}

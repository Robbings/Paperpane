import DOMPurify from 'dompurify';
export function cleanZoteroNote(html:string){return DOMPurify.sanitize(html,{USE_PROFILES:{html:true},FORBID_TAGS:['img','iframe','object','embed','form','style'],FORBID_ATTR:['style']});}
export function noteText(html:string){const template=document.createElement('template');template.innerHTML=cleanZoteroNote(html).replace(/<\/(?:p|div|li|h[1-6])>/gi,'$&\n');return template.content.textContent?.trim()??'';}
export function plainNote(text:string){return '<div>'+text.split('\n').map(line=>'<p>'+line.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')+'</p>').join('')+'</div>';}

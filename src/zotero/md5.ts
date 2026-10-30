/** MD5 is required by Zotero's attachment protocol; file identity still uses SHA-256. */
export function md5(input:Uint8Array):string{
  const length=Math.ceil((input.length+9)/64)*64,bytes=new Uint8Array(length);bytes.set(input);bytes[input.length]=128;
  const view=new DataView(bytes.buffer);view.setUint32(length-8,(input.length*8)>>>0,true);view.setUint32(length-4,Math.floor(input.length/0x20000000),true);
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  const shifts=[[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]];
  for(let offset=0;offset<length;offset+=64){let a=a0,b=b0,c=c0,d=d0;
    for(let i=0;i<64;i++){
      const round=i>>4;let f:number,g:number;
      if(round===0){f=(b&c)|(~b&d);g=i;}else if(round===1){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(round===2){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}
      const value=(a+f+Math.floor(Math.abs(Math.sin(i+1))*0x100000000)+view.getUint32(offset+4*g,true))|0,s=shifts[round]![i%4]!;
      a=d;d=c;c=b;b=(b+((value<<s)|(value>>>(32-s))))|0;
    }
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  return [a0,b0,c0,d0].flatMap(n=>[0,8,16,24].map(shift=>((n>>>shift)&255).toString(16).padStart(2,'0'))).join('');
}

export const PHOTO_SOURCE_MAX=5*1024*1024;
export function photoSourceInfo(bytes){
  const fail=()=>{throw Error('Choose a PNG, JPEG or WebP image up to 5 MB and 16 megapixels.');};
  if(!(bytes instanceof Uint8Array)||bytes.length<24||bytes.length>PHOTO_SOURCE_MAX)fail();
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));let width,height,type;
  if(bytes[0]===137&&text(1,4)==='PNG'&&v.getUint32(4)===0x0d0a1a0a){
    type='image/png';width=v.getUint32(16);height=v.getUint32(20);
    for(let at=8;at+12<=bytes.length;){const n=v.getUint32(at);if(at+12+n>bytes.length)fail();if(text(at+4,at+8)==='acTL')fail();at+=n+12;}
  }else if(bytes[0]===255&&bytes[1]===216){
    type='image/jpeg';let at=2;
    while(at+4<bytes.length){if(bytes[at++]!==255)fail();while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xda||marker===0xd9)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
      const n=v.getUint16(at);if(n<2||at+n>bytes.length)fail();
      if([0xc0,0xc1,0xc2].includes(marker)){if(n<8)fail();height=v.getUint16(at+3);width=v.getUint16(at+5);break;}at+=n;
    }
  }else if(text(0,4)==='RIFF'&&text(8,12)==='WEBP'){
    type='image/webp';const kind=text(12,16);
    if(kind==='VP8X'&&bytes.length>=30){if(bytes[20]&2)fail();width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
    else if(kind==='VP8L'&&bytes.length>=25&&bytes[20]===47){const bits=v.getUint32(21,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
    else if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff;}
  }
  if(!width||!height||width>8192||height>8192||width*height>16000000)fail();
  return {width,height,type};
}

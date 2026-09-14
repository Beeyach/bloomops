import { crc32 } from '../zip.mjs';

export const PHOTO_SIZE = 256;
export const PHOTO_MAX_BYTES = 300 * 1024;
const signature = Uint8Array.of(137,80,78,71,13,10,26,10);
const invalid = () => { throw new Error('Choose a valid cropped PNG photo.'); };
const join = chunks => { const bytes=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return bytes; };
function chunk(type, data) {
  const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);
  view.setUint32(0,data.length);bytes.set(new TextEncoder().encode(type),4);bytes.set(data,8);
  view.setUint32(data.length+8,crc32(bytes.subarray(4,data.length+8)));return bytes;
}
async function transform(bytes, stream, max) {
  const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader(),chunks=[];let size=0;
  try { for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max)invalid();chunks.push(value);} }
  catch(error){try{await reader.cancel();}catch{}throw error;}
  finally { reader.releaseLock(); }
  return join(chunks);
}

// This is deliberately a validator/repacker for a browser-produced thumbnail,
// not an original-image decoder. Fixed dimensions bound decompression and
// memory; only scanline pixels survive. Ancillary chunks are never inflated.
export async function normalizeProfilePng(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length>PHOTO_MAX_BYTES||bytes.length<57||signature.some((b,i)=>bytes[i]!==b))invalid();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[];let header=null,ended=false,dataEnded=false,at=8;
  while(at<bytes.length){
    if(at+12>bytes.length)invalid();
    const length=view.getUint32(at),end=at+12+length;if(end>bytes.length)invalid();
    const type=String.fromCharCode(...bytes.subarray(at+4,at+8)),data=bytes.subarray(at+8,end-4);
    if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(at+4,end-4))!==view.getUint32(end-4))invalid();
    if(!header&&type!=='IHDR')invalid();
    if(type==='IHDR'){
      if(header||length!==13||view.getUint32(at+8)!==PHOTO_SIZE||view.getUint32(at+12)!==PHOTO_SIZE||data[8]!==8||![2,6].includes(data[9])||data[10]||data[11]||data[12])invalid();
      header=data;
    }else if(type==='IDAT'){
      if(dataEnded)invalid();parts.push(data);
    }else if(type==='IEND'){
      if(length||!parts.length||end!==bytes.length)invalid();ended=true;
    }else{
      if(parts.length)dataEnded=true;
      // No animation, transparency overrides, palettes or unknown critical chunks.
      if(['acTL','fcTL','fdAT','tRNS'].includes(type)||type[0]===type[0].toUpperCase())invalid();
    }
    at=end;
  }
  if(!ended)invalid();
  const stride=1+PHOTO_SIZE*(header[9]===6?4:3),expected=stride*PHOTO_SIZE;
  const scanlines=await transform(join(parts),new DecompressionStream('deflate'),expected);
  if(scanlines.length!==expected)invalid();
  for(let row=0;row<PHOTO_SIZE;row++)if(scanlines[row*stride]>4)invalid();
  const compressed=await transform(scanlines,new CompressionStream('deflate'),PHOTO_MAX_BYTES-57);
  return join([signature,chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
}

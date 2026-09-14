'use client';
import { useEffect, useRef, useState } from 'react';
import Garden,{palettes,variantFor} from './Garden';

export default function UserAvatar({seed,src=null,size=32}) {
  const [version,setVersion]=useState(0),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);
  const image=useRef(null);
  // Server-rendered comment images can finish before React attaches onLoad.
  useEffect(()=>{setFailed(false);setLoaded(Boolean(image.current?.complete&&image.current.naturalWidth));},[src,version]);
  useEffect(()=>{
    const refresh=()=>{setLoaded(false);setFailed(false);setVersion(v=>v+1);};
    window.addEventListener('focus',refresh);window.addEventListener('bloomsi-photo-changed',refresh);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('bloomsi-photo-changed',refresh);};
  },[]);
  const variant=variantFor(seed);
  return <span className="bo-user-avatar" style={{width:size,height:size,background:palettes[variant][0]}} aria-hidden="true">
    <Garden variant={variant}/>
    {src&&!failed&&<img ref={image} key={`${src}:${version}`} src={`${src}${src.includes('?')?'&':'?'}v=${version}`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)} onLoad={()=>setLoaded(true)} style={{opacity:loaded?1:0}}/>}
  </span>;
}

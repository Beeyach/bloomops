'use client';
import {useEffect,useRef,useState} from 'react';
import {faviconHost} from '@/lib/favicon.mjs';
import {safeProspectUrl} from '@/lib/bloomops/prospect-values.mjs';

import Garden,{palettes,variantFor} from './Garden';
function Favicon({url}){
 const ref=useRef(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{if(ref.current?.complete&&ref.current.naturalWidth>0)setLoaded(true);},[]);
 // Ordinary browser image only. No server fetch/proxy, credential copy,
 // third-party lookup provider, or referrer containing the profile URL.
 return failed?null:<img ref={ref} src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`bo-prospect-favicon${loaded?' is-loaded':''}`} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>;
}
export default function ProspectAvatar({id,website,size='profile'}){
 const safe=safeProspectUrl(website),url=safe&&faviconHost(safe)?new URL('/favicon.ico',safe).href:null,variant=variantFor(id);
 return <span className={`bo-prospect-avatar bo-prospect-avatar-${size}`} style={{background:palettes[variant][0]}} aria-hidden="true">
  <Garden variant={variant}/>{url&&<Favicon key={url} url={url}/>}
 </span>;
}

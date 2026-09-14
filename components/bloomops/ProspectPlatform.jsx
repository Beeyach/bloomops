'use client';
import {useState} from 'react';
import {Icon} from './Icons';

const platforms=[
 {name:'Kajabi',mark:'kajabi.png',aliases:['kajabi']},
 {name:'GoHighLevel',mark:'highlevel.png',aliases:['gohighlevel','highlevel','ghl','go high level']},
 {name:'WordPress',mark:'wordpress.png',aliases:['wordpress','wordpress.org','wordpress.com']},
 {name:'Webflow',mark:'webflow.png',aliases:['webflow']},
 {name:'Squarespace',mark:'squarespace.png',aliases:['squarespace']},
 {name:'Shopify',mark:'shopify.png',aliases:['shopify']},
 {name:'Wix',mark:'wix.ico',aliases:['wix']},
];
const knownPlatform=value=>platforms.find(p=>p.aliases.includes(String(value||'').trim().toLowerCase()));

export function PlatformIcon({value}){
 const platform=knownPlatform(value);
 return platform?<img className="bo-platform-logo" src={'/brand/platforms/'+platform.mark} width="18" height="18" alt="" decoding="async"/>:<Icon name="systems" className="bo-platform-fallback"/>;
}

export function PlatformOptions({value,emptyLabel='Unknown'}){
 const exact=platforms.some(p=>p.name===value);
 const customValue=value==='__bloomsi_custom_platform__'?'__bloomsi_custom_platform_2__':'__bloomsi_custom_platform__';
 return <><option value="">{emptyLabel}</option>
  {!!value&&!exact&&<option value={value}>{value}</option>}
  {platforms.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}
  <option value={customValue} data-custom="true">Custom platform…</option>
 </>;
}

// Suggestions only: historical/custom values remain valid and unchanged until
// the user chooses a replacement. The parent retains its existing save path.
export default function ProspectPlatform({value,onChange,label,id,autoFocus=false,emptyLabel='Unknown',className='bo-control',initialCustom=false}){
 const [custom,setCustom]=useState(initialCustom);
 return <div className="bo-platform-picker">
  {custom?<><input id={id} className={className} aria-label={label} autoFocus value={value} maxLength={120} onChange={e=>onChange(e.target.value)}/><button type="button" className="bo-platform-options" aria-label="Choose a listed platform" onClick={()=>setCustom(false)}><Icon name="chevron-down"/></button></>:<><PlatformIcon value={value}/><select id={id} className={className} aria-label={label} autoFocus={autoFocus} value={value} onChange={e=>{if(e.target.selectedOptions[0].dataset.custom)setCustom(true);else onChange(e.target.value);}}>
   <PlatformOptions value={value} emptyLabel={emptyLabel}/>
  </select></>}
 </div>;
}

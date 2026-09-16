'use client';
import {useState} from 'react';
import {Field} from './Primitives';
import {Icon} from './Icons';
export default function ContentPlatformFilter({id,value='',choices=[],more=false}){
 const rows=[...new Map(choices.map(row=>[row.key,row])).values()];
 if(value&&!rows.some(row=>row.key===value))rows.push({key:value,label:value});
 const [selected,setSelected]=useState(value),[custom,setCustom]=useState(''),[customMode,setCustomMode]=useState(false);
 return <Field id={id} label="Platform" hint={more?'Recent choices are bounded. Choose another platform to enter any stored label.':null}>
  <select id={id} className="bo-control"  value={customMode?'custom':'platform:'+selected} onChange={e=>{setCustomMode(e.target.value==='custom');if(e.target.value!=='custom')setSelected(e.target.value.slice(9));}}><option value="platform:">All</option>{rows.map(row=><option key={row.key} value={'platform:'+row.key}>{row.label}</option>)}<option value="custom">Another platform…</option></select>
  {!customMode&&<input type="hidden" name="platform" value={selected}/>}
  {!customMode&&selected==='instagram'&&<span className="bo-hint"><Icon name="instagram" size={16}/> Instagram</span>}
  {customMode&&<div className="bo-platform-custom"><label htmlFor={id+'-custom'}>Platform label</label><input id={id+'-custom'} name="platform" className="bo-control" value={custom} maxLength={120} onChange={e=>setCustom(e.target.value)} placeholder="Enter the saved channel label"/></div>}
 </Field>;
}

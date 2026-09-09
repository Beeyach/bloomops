'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button,Field,Notice,Section } from './Primitives';
export const platformLines=text=>text.split('\n').filter(line=>line.trim());
export function PlatformInput({value,onChange,disabled=false,error='',id='content-platforms'}) {
  return <Field id={id} label="Platforms" error={error} hint="Optional. One channel label per line, up to 12 labels of 60 characters. These labels do not connect or publish to an account.">
    <textarea id={id} aria-invalid={error?true:undefined} aria-describedby={`${id}-hint${error?` ${id}-error`:""}`} className="bo-control" rows={3} maxLength={900} value={value} onChange={onChange} disabled={disabled} />
  </Field>;
}
export default function ContentPlatforms({item}) {
  const router=useRouter(),pending=useRef(false),[text,setText]=useState((item.platforms||[]).map(p=>p.label).join('\n')),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>setReady(true),[]);
  useEffect(()=>setText((item.platforms||[]).map(p=>p.label).join('\n')),[item.revision]);
  async function save(e){
    e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');setMessage('');
    try{const r=await fetch(`/api/bloomops/content/${item.id}/platforms`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:item.revision,platforms:platformLines(text)})}),data=await r.json();
      if(!r.ok){setError(data.errors?.platforms||data.errors?.form||data.error||'Unable to save platforms.');return;}
      setMessage('Platforms saved.');router.refresh();
    }catch{setError('The result could not be confirmed. Retry the same labels or reload to check.');}finally{pending.current=false;setBusy(false);}
  }
  return <Section id="content-platform-associations" title="Platforms"><form className="bo-form" onSubmit={save} aria-busy={busy}>
    {item.approvalRequested&&<Notice>Platforms are frozen while Client approval is requested.</Notice>}
    <PlatformInput value={text} onChange={e=>setText(e.target.value)} disabled={!ready||busy||item.approvalRequested} />
    {error&&<Notice tone="error">{error} <a href={`/social/${item.id}`}>Reload Content</a></Notice>}{message&&<Notice tone="success">{message}</Notice>}
    <div className="bo-form-actions"><Button type="submit" disabled={!ready||busy||item.approvalRequested} loading={busy}>Save platforms</Button></div>
  </form></Section>;
}

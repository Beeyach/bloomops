'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
import UserAvatar from './UserAvatar';
import {photoSourceInfo,PHOTO_SOURCE_MAX} from '@/lib/bloomops/photo-source.mjs';

const api='/api/bloomops/profile/photo';
export default function ProfilePhotoEditor({name,email}){
  const [current,setCurrent]=useState(null),[source,setSource]=useState(null),[zoom,setZoom]=useState(1),[x,setX]=useState(50),[y,setY]=useState(50),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const canvas=useRef(null),file=useRef(null),request=useRef(null),live=useRef(true),locked=useRef(false);
  async function load(){setLoading(true);try{const res=await fetch(api+'?info=1',{cache:'no-store'});if(!res.ok)throw Error('Your profile could not load. Check your connection and sign-in.');const data=await res.json();if(live.current){setCurrent(data);setError('');}}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setLoading(false);}}
  useEffect(()=>{live.current=true;load();return()=>{live.current=false;};},[]);
  useEffect(()=>()=>{source?.close();},[source]);
  useEffect(()=>{
    if(!source||!canvas.current)return;
    const node=canvas.current,ctx=node.getContext('2d'),side=Math.min(source.width,source.height)/zoom;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);ctx.drawImage(source,(source.width-side)*x/100,(source.height-side)*y/100,side,side,0,0,256,256);
    request.current=null;
  },[source,zoom,x,y]);
  function cancel(){setSource(null);setNotice('');setError('');request.current=null;if(file.current)file.current.value='';}
  async function select(event){
    const selected=event.target.files?.[0];if(!selected||locked.current)return;
    locked.current=true;setBusy(true);setError('');setNotice('');
    try{
      if(selected.size>PHOTO_SOURCE_MAX)throw Error('Choose an image up to 5 MB.');
      const bytes=new Uint8Array(await selected.arrayBuffer()),info=photoSourceInfo(bytes);
      const bitmap=await createImageBitmap(new Blob([bytes],{type:info.type}));
      if(bitmap.width>8192||bitmap.height>8192||bitmap.width*bitmap.height>16000000){bitmap.close();throw Error('Choose an image up to 16 megapixels.');}
      if(!live.current){bitmap.close();return;}setSource(bitmap);setZoom(1);setX(50);setY(50);request.current=null;
    }catch(e){if(live.current)setError(e.message||'This photo could not open. Choose another image.');}
    finally{locked.current=false;if(live.current)setBusy(false);if(file.current)file.current.value='';}
  }
  async function save(remove=false){
    if(locked.current||!current||!remove&&!source)return;locked.current=true;setBusy(true);setError('');setNotice('');
    try{
      if(!request.current||request.current.remove!==remove){
        const blob=remove?null:await new Promise(resolve=>canvas.current.toBlob(resolve,'image/png'));
        if(!remove&&!blob)throw Error('The crop could not be prepared. Please retry.');
        request.current={remove,blob,requestId:crypto.randomUUID(),expectedVersion:current.version};
      }
      const pending=request.current;
      const response=await fetch(api,{method:remove?'DELETE':'PUT',headers:remove?{'content-type':'application/json'}:{'content-type':'image/png','x-request-id':pending.requestId,'if-match':pending.expectedVersion},body:remove?JSON.stringify({requestId:pending.requestId,expectedVersion:pending.expectedVersion}):pending.blob});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Photo was not saved. Your crop is still here; please retry.');
      if(live.current){setCurrent(result);setSource(null);request.current=null;setNotice(remove?'Photo removed.':'Photo saved.');window.dispatchEvent(new Event('bloomsi-photo-changed'));}
    }catch(e){if(live.current)setError(e.message);}
    finally{locked.current=false;if(live.current)setBusy(false);}
  }
  return <section className="bo-profile-photo-editor" aria-labelledby="photo-heading">
    <div className="bo-profile-identity"><UserAvatar seed={name||email} src={api} size={72}/><div><h2>{name||email}</h2><p>{email}</p></div></div>
    <h2 id="photo-heading">Profile photo</h2><p className="bo-hint">One photo across your Bloomsi workspaces. A garden icon appears when no photo is available.</p>
    {loading&&<p role="status">Loading your photo…</p>}
    {error&&<div className="bo-photo-error"><p role="alert">{error}</p><Button variant="ghost" disabled={busy||loading} onClick={()=>{request.current=null;load();}}>Reload current photo</Button></div>}
    <input ref={file} id="profile-photo-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={select} disabled={busy||loading||!current} className="bo-photo-file"/>
    <div className="bo-photo-actions"><Button icon="upload" disabled={busy||loading||!current} onClick={()=>file.current?.click()}>{source?'Choose another photo':current?.hasPhoto?'Replace photo':'Upload photo'}</Button>{current?.hasPhoto&&!source&&<Button variant="ghost" disabled={busy||loading} onClick={()=>save(true)}>Remove photo</Button>}</div>
    <p className="bo-hint">PNG, JPEG or WebP. Up to 5 MB.</p>
    {source&&<div className="bo-photo-crop"><div><canvas ref={canvas} width={256} height={256} role="img" aria-label="Profile photo crop preview"/><p className="bo-hint">Adjust the crop before saving.</p></div><div className="bo-photo-adjustments">
      <label>Zoom<input type="range" min="1" max="4" step="0.05" value={zoom} disabled={busy} onChange={e=>setZoom(Number(e.target.value))}/></label>
      <label>Horizontal position<input type="range" min="0" max="100" value={x} disabled={busy} onChange={e=>setX(Number(e.target.value))}/></label>
      <label>Vertical position<input type="range" min="0" max="100" value={y} disabled={busy} onChange={e=>setY(Number(e.target.value))}/></label>
      <div className="bo-photo-actions"><Button variant="primary" icon="check" disabled={busy||loading} onClick={()=>save(false)}>{busy?'Saving…':'Save photo'}</Button><Button variant="ghost" disabled={busy} onClick={cancel}>Cancel</Button></div>
    </div></div>}
    {busy&&!source&&<p role="status">Updating photo…</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}

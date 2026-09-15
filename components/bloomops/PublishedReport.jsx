'use client';
import {useEffect,useState,useRef} from 'react';
import PublishedReportContent from './PublishedReportContent';
import {Button} from './Primitives';
export default function PublishedReport({initial,scope,api}){
 const [data,setData]=useState(initial),[error,setError]=useState('');
 const [downloading,setDownloading]=useState(false),active=useRef(true),downloadGeneration=useRef(0);
 useEffect(()=>{active.current=true;return()=>{active.current=false;downloadGeneration.current++;};},[]);
 async function download(){if(downloading)return;setDownloading(true);setError('');const g=++downloadGeneration.current;try{const r=await fetch(api+'/pdf',{cache:'no-store'});if(!r.ok){const b=await r.json();throw Error(b.error||'PDF is no longer available.');}const blob=await r.blob();if(!active.current||g!==downloadGeneration.current)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`client-report-v${data.version}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(active.current&&g===downloadGeneration.current)setError(e.message);}finally{if(active.current&&g===downloadGeneration.current)setDownloading(false);}}
 useEffect(()=>{let live=true,generation=0;async function refresh(){const g=++generation;try{const r=await fetch(api,{cache:'no-store'}),b=await r.json();if(!live||g!==generation)return;if(!r.ok||b.scope?.userId!==scope.userId||b.scope?.workspaceId!==scope.workspaceId){downloadGeneration.current++;setDownloading(false);setData(null);setError('This published report is no longer available.');}else setData(b.report);}catch{if(live&&g===generation){downloadGeneration.current++;setDownloading(false);setData(null);setError('Could not verify access. Reload to retry.');}}}window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);return()=>{live=false;generation++;window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);};},[api,scope.userId,scope.workspaceId]);
 return data?<><Button disabled={downloading} onClick={download}>{downloading?'Preparing PDF…':'Download this published PDF'}</Button>{error&&<p role="alert">{error}</p>}<PublishedReportContent snapshot={data.snapshot} version={data.version} publishedAt={data.publishedAt}/></>:<p role="alert">{error}</p>;
}

'use client';
import {useState} from 'react';
import {Button} from './Primitives';
export default function OpenSharedPage({workspaceId,workspaceName,destination}){const [busy,setBusy]=useState(false),[error,setError]=useState('');async function open(){setBusy(true);setError('');try{const response=await fetch('/api/bloomops/workspaces/select',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId})});if(!response.ok)throw Error();location.assign(destination);}catch{setError('This workspace could not open. Check your access and try again.');setBusy(false);}}return <><p>Switch to {workspaceName} to open this shared page.</p><Button variant="primary" onClick={open} disabled={busy}>Open shared page</Button>{error&&<p role="alert">{error}</p>}</>;}

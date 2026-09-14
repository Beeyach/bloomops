'use client';
import {useState} from 'react';
import ProspectSenderForm from './ProspectSenderForm';
import ProspectGoogleConnection from './ProspectGoogleConnection';
export default function ProspectSenderSetup({initial,connection,outcome}){
 const [current,setCurrent]=useState(connection),[dirty,setDirty]=useState(false);
 async function saved(){const response=await fetch('/api/bloomops/prospecting/google/status',{cache:'no-store'});if(!response.ok)throw new Error('Connection status could not refresh. Reload this page.');const result=await response.json();setCurrent(result);return result;}
 return <><ProspectSenderForm initial={initial} onSaved={saved} onDirty={setDirty}/><ProspectGoogleConnection data={current} outcome={outcome} dirty={dirty} onChecked={saved}/></>;
}

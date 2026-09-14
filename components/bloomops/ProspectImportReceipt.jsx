import {Button,Status} from './Primitives';
import {IMPORT_REASONS} from '@/lib/bloomops/prospect-import-values.mjs';
export function ImportCounts({receipt}){return <dl className="bo-source-counts" aria-label="Import receipt counts">{[['selectedCount','Selected'],['importedCount','Imported'],['duplicateCount','Duplicates'],['rejectedCount','Rejected']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{receipt[key]}</dd></div>)}</dl>;}
export default function ProspectImportReceipt({receipt}){
 return <><ImportCounts receipt={receipt}/><p>Completed <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleString('en-US',{timeZone:'UTC'})} UTC</time>. Existing profiles and source history were preserved.</p>
 <ul className="bo-source-rows" aria-label="Import outcomes">{receipt.rows.map(row=><li key={row.index}><div className="bo-source-row-head"><h2>{row.businessName||`Record ${row.index}`}</h2><Status label={row.status==='imported'?'Imported':row.status==='duplicate'?'Duplicate':'Rejected'} tone={row.status==='imported'?'success':row.status==='duplicate'?'warning':'error'}/></div>
 {row.prospectId&&<Button href={'/prospecting/'+row.prospectId} variant="ghost" icon="prospecting">Open prospect</Button>}
 {row.reasons.length>0&&<ul className="bo-source-reasons">{[...new Set(row.reasons.map(reason=>IMPORT_REASONS[reason]||reason))].map(reason=><li key={reason}>{reason}</li>)}</ul>}
 <details className="bo-prospect-evidence"><summary>Import provenance</summary><dl className="bo-prospect-facts"><div><dt>File record</dt><dd>{row.index}</dd></div><div><dt>Source workspace</dt><dd>{receipt.sourceWorkspaceId}</dd></div><div><dt>Source record</dt><dd>{row.sourceRecordId??'Not available'}</dd></div><div><dt>Source label</dt><dd>{row.sourceLabel||'Not recorded'}</dd></div></dl></details></li>)}</ul></>;
}

'use client';
import {useEffect,useState} from 'react';
import ReportComparison from './ReportComparison';
import {PageHeader,Button} from './Primitives';
import {reportTemplate} from '@/lib/bloomops/client-report-values.mjs';
export default function ClientReportPreview({initial,scope}){
 const [report,setReport]=useState(initial),[error,setError]=useState('');
 useEffect(()=>{let generation=0,active=true;async function refresh(){const g=++generation;try{const res=await fetch(`/api/bloomops/clients/${initial.clientId}/reports/${initial.id}`,{cache:'no-store'});const data=await res.json();if(!active||g!==generation)return;
 if(!res.ok||data.scope?.userId!==scope.userId||data.scope?.workspaceId!==scope.workspaceId){setReport(null);setError('This private preview is no longer available.');return;}setReport(data.report);setError('');}catch{if(active&&g===generation){setReport(null);setError('The preview could not be refreshed. Reload to check access again.');}}}
 window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);return()=>{active=false;generation++;window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);};},[initial.id,initial.clientId,scope.userId,scope.workspaceId]);
 if(!report)return <p role="alert">{error}</p>;
 const template=reportTemplate(report.templateId,report.templateVersion);
 return <article className="bo-report bo-report-preview"><p className="bo-report-private">Private preview. Internal access only. Draft changes do not update published versions.</p>
 <PageHeader title={report.title}/><dl className="bo-report-context"><div><dt>Client</dt><dd>{report.clientName}</dd></div><div><dt>Service</dt><dd>{report.serviceName}{report.packageName&&` (${report.packageName})`}</dd></div><div><dt>Period</dt><dd>{report.periodStart} to {report.periodEnd}</dd></div><div><dt>Timezone</dt><dd>{report.timezone}</dd></div><div><dt>Account / channel</dt><dd>{report.accountLabel||'Account not supplied'} / {report.channel}</dd></div><div><dt>Campaign / content scope</dt><dd>{report.scopeLabel||'Scope not supplied'}</dd></div></dl>
 <p>{template.label}, template version {template.version}. Saved draft revision {report.revision}.</p>
 <h2>Report commentary</h2><p className="bo-report-prose">{report.commentary||'No commentary supplied.'}</p>
 <h2>Manual observations</h2><p>Entered and reviewed CSV values remain unverified. Source notes provide context, not automatic verification.</p>
 <dl className="bo-report-observations">{template.metrics.map(m=>{const v=report.metrics[m.key];return <div key={m.key}><dt>{m.label}</dt><dd><strong>{v.state==='value'?v.value.toLocaleString('en-US'):{missing:'Not supplied',unavailable:'Unavailable',not_tracked:'Not tracked'}[v.state]}</strong><p>{m.definition}</p><p>{v.sourceKind==='csv'?'Reviewed CSV (unverified)':v.importId?'Manual correction of a CSV observation (unverified)':'Manually entered (unverified)'}</p><p className="bo-report-prose">Source: {v.sourceNote||'Not supplied (unverified)'}</p><p>Collected: {v.collectedAt||'Not supplied'}</p></dd></div>;})}</dl>
 <h2>Calculated values</h2><p>Calculated from unverified manual inputs.</p><dl>{report.calculations.map(c=><div key={c.key}><dt>{c.label}</dt><dd><strong>{c.display}</strong><p>{c.definition}</p></dd></div>)}</dl>
 {report.comparison&&<ReportComparison comparison={report.comparison}/>}
 {report.comparisonUnavailable&&<p role="alert">The saved comparison is unavailable. Choose another prior publication or remove it before publishing.</p>}
 <Button variant="ghost" href={`/clients/${report.clientId}/reports/${report.id}`}>Back to saved draft</Button></article>;
}

// The same explicit snapshot presentation is used in publication review and
// authenticated client output. No draft or private provenance enters this tree.
export default function PublishedReportContent({snapshot:s,version=null,publishedAt=null}){
 return <article className="bo-report bo-report-preview"><h1>{s.title}</h1>
 <dl className="bo-report-context">{[['Client',s.clientName],['Service',[s.serviceName,s.packageName].filter(Boolean).join(' — ')],['Reporting period',`${s.periodStart} to ${s.periodEnd}`],['Timezone',s.timezone],['Account',s.accountLabel],['Channel',s.channel],['Scope',s.scopeLabel]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not supplied'}</dd></div>)}</dl>
 <p>{s.templateLabel}. Template version {s.templateVersion}.{version!==null&&` Published version ${version}.`}{publishedAt&&` Published ${publishedAt}.`}</p>
 {[[s.clientSummary,'Summary'],[s.workCompleted,'Work completed'],[s.limitations,'Limits and context'],[s.nextActions,'Next actions']].map(([text,title])=><section key={title}><h2>{title}</h2><p className="bo-report-prose">{text||'Not supplied.'}</p></section>)}
 <h2>Observations</h2><p>{s.verification}</p><dl className="bo-report-observations">{s.metrics.map(m=><div key={m.key}><dt>{m.label}</dt><dd><strong>{m.state==='value'?m.value.toLocaleString('en-US'):{missing:'Not supplied',unavailable:'Unavailable',not_tracked:'Not tracked'}[m.state]}</strong><p>{m.unit==='count'?'Count':m.unit}. {m.definition}</p><p>{m.origin}</p></dd></div>)}</dl>
 <h2>Calculated values</h2><dl>{s.calculations.map(c=><div key={c.key}><dt>{c.label}</dt><dd><strong>{c.display}</strong><p>{c.definition}</p></dd></div>)}</dl>
 </article>;
}

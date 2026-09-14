import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listProspectSources,previewProspectSource,sourcePreviewInput} from '@/lib/bloomops/prospect-source-preview.mjs';
import {ELIGIBILITY} from '@/lib/bloomops/prospect-eligibility.mjs';
import {PageHeader,Button,Field,EmptyState} from '@/components/bloomops/Primitives';
import ProspectSourceSelection from '@/components/bloomops/ProspectSourceSelection';
export const dynamic='force-dynamic';
export const metadata={title:'Review source prospects'};
export default async function SourcePreviewPage({searchParams}){
 const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting')notFound();
 const sources=await listProspectSources(access.db,actor);if(!sources)notFound();
 const params=await searchParams,filters=sourcePreviewInput(params);
 const result=filters?await previewProspectSource(access.db,actor,filters):{invalid:true};
 if(result===null)notFound();
 const next=after=>'/prospecting/import?'+new URLSearchParams({source:filters.source,after:String(after)});
 return <div className="bo-prospect-page bo-source-preview">
  <Button href="/prospecting" variant="ghost" icon="chevron-left">Back to prospects</Button>
  <PageHeader actions={<Button href="/prospecting/import/review" icon="upload">Preview import</Button>} title="Review source prospects" subtitle="Choose eligible raw prospects to download for a later import."/>
  <p className="bo-prospect-notice">Downloads leave source records unchanged. Nothing is imported or sent.</p>
  {sources.rows.length?<form method="get" className="bo-source-picker"><Field id="source-workspace" label="Source workspace"><select id="source-workspace" name="source" className="bo-control" required defaultValue={filters?.source||''}><option value="" disabled>Choose a workspace</option>{sources.rows.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></Field><Button type="submit" icon="eye">Review source</Button></form>:<EmptyState title="No available source workspaces">A source requires your active Owner or Admin membership in an operational workspace in this database.</EmptyState>}
  {sources.more&&<p className="bo-hint">The first 100 available workspaces are shown.</p>}
  {result.invalid?<p className="bo-prospect-notice" role="alert">These preview options are unavailable. <a href="/prospecting/import">Reset options</a></p>:result.unavailable?<p className="bo-prospect-notice" role="alert">Source history could not be checked. Reload to try again. No records have been marked as untouched.</p>:result.rows&&<>
   <div className="bo-source-summary"><h2>{result.source.name}</h2><p>Checked <time dateTime={result.asOf}>{new Date(result.asOf).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC</time></p></div>
   <p className="bo-source-explanation">“No recorded work” means no work was found in the available records. It is not confirmation that a person has never been contacted.</p>
   <dl className="bo-source-counts" aria-label="Counts on this page">{Object.entries(ELIGIBILITY).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{result.counts[key]}</dd></div>)}</dl>
   <p className="bo-hint">Counts cover these {result.rows.length} records. Reloading checks current activity again.</p>
   {result.rows.length?<ProspectSourceSelection key={result.source.id+':'+result.after+':'+result.asOf} source={result.source.id} rows={result.rows}/>:<EmptyState title="No source prospects on this page">No records were found in this workspace at this cursor. Nothing was imported.</EmptyState>}
   <nav className="bo-prospect-pagination" aria-label="Source preview pages">{result.after>0&&<Button href={next(0)}>First page</Button>}{result.more&&<Button href={next(result.nextAfter)}>Next page</Button>}</nav>
  </>}
 </div>;
}

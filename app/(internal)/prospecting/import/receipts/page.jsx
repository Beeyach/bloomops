import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listProspectImports} from '@/lib/bloomops/prospect-imports.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import {ImportCounts} from '@/components/bloomops/ProspectImportReceipt';
export const dynamic='force-dynamic';
export const metadata={title:'Import history'};
export default async function ImportHistory({searchParams}){
 const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting')notFound();
 const page=Number((await searchParams)?.page||1),result=await listProspectImports(access.db,actor,page);if(!result)notFound();
 return <div className="bo-prospect-page"><Button href="/prospecting/import/review" variant="ghost" icon="chevron-left">Back to import</Button><PageHeader title="Import history" subtitle="Completed imports and their original outcomes."/>
 {result.rows.length?<ul className="bo-source-rows">{result.rows.map(r=><li key={r.id}><Button href={'/prospecting/import/receipts/'+r.id} variant="ghost" icon="history">Import from {new Date(r.createdAt).toLocaleString('en-US',{timeZone:'UTC'})} UTC</Button><ImportCounts receipt={r}/></li>)}</ul>:<p>No completed imports yet.</p>}
 <nav className="bo-prospect-pagination" aria-label="Import history pages">{page>1&&<Button href={'?page='+(page-1)}>Newer imports</Button>}{result.more&&<Button href={'?page='+(page+1)}>Older imports</Button>}</nav></div>;
}

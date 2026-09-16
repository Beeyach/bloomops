import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listRecordPages} from '@/lib/bloomops/page-record-context.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export const metadata={title:'Linked Pages'};
export default async function RecordPages({params,searchParams}){
 const {kind,id}=await params,q=await searchParams,{access,actor}=await requireShell('internal');
 const result=await listRecordPages(access.db,actor,{kind,recordId:id,page:q?.page?Number(q.page):1});if(!result)notFound();
 const here=`/pages/records/${kind}/${encodeURIComponent(id)}`;
 return <section><Button href={kind==='client'?`/clients/${id}`:`/work/projects/${id}`} variant="ghost">Back to {kind==='client'?'Client':'Project'}</Button><PageHeader title="Linked Pages" subtitle={result.record.name}/>
  {result.items.length?<ul className="bo-record-pages">{result.items.map(p=><li key={p.id}><a href={`/pages/${p.id}`}>{p.title}</a></li>)}</ul>:<p className="bo-hint">No linked Pages are available to you. A Page administrator can add record context from the Page.</p>}
  <nav className="bo-form-actions" aria-label="Linked Pages pagination">{result.page>1&&<Button href={`${here}?page=${result.page-1}`}>Previous</Button>}{result.more&&<Button href={`${here}?page=${result.page+1}`}>Next</Button>}</nav>
 </section>;
}

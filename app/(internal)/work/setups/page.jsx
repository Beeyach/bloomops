import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listWorkSetups} from '@/lib/bloomops/work-setups.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export default async function Page({searchParams}){const {access,actor}=await requireShell('internal'),query=await searchParams,archived=query?.archived==='true',result=await listWorkSetups(access.db,actor,{page:query?.page?Number(query.page):1,archived});if(!result.ok)notFound();const link=page=>`/work/setups?page=${page}&archived=${archived}`;
 return <><Button href="/work?tab=projects" variant="ghost">Back to Work</Button><PageHeader title="Reusable Work setups" subtitle="Save the structure of a job, then start fresh for each event." actions={result.canEdit&&<Button href="/work/setups/new" variant="primary">New setup</Button>}/><Button href={`/work/setups?archived=${!archived}`} variant="ghost">{archived?'Show active setups':'Show retired setups'}</Button>
 {!result.items.length?<p>{archived?'No retired setups.':'No saved setups yet. A template author can create the first one.'}</p>:<ul className="bo-preview-list">{result.items.map(item=><li key={item.id}><div><h2><a href={`/work/setups/${item.id}`}>{item.name}</a></h2><p>{item.description}</p><p>Saved version {item.version}{!item.active?' (retired)':''}</p></div></li>)}</ul>}
 <nav aria-label="Setup pages" className="bo-form-actions">{result.page>1&&<Button href={link(result.page-1)}>Previous setups</Button>}{result.more&&<Button href={link(result.page+1)}>More setups</Button>}</nav></>;
}

import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listPageTemplates} from '@/lib/bloomops/page-templates.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export default async function Page({searchParams}){const {access,actor}=await requireShell('internal'),q=await searchParams,retired=q?.retired==='true',result=await listPageTemplates(access.db,actor,{page:q?.page?Number(q.page):1,retired});if(!result.ok)notFound();const link=page=>`/pages/templates?page=${page}&retired=${retired}`;
 return <><Button href="/pages" variant="ghost">Back to Pages</Button><PageHeader title="Reusable Page templates" subtitle="Saved writing for new private Pages. Later edits never change existing documents."/><p>Edit and save a Page, then use its Reusable template controls to capture a version.</p><Button href={`/pages/templates?retired=${!retired}`} variant="ghost">{retired?'Show active templates':'Show retired templates'}</Button>
 {result.items.length?<ul className="bo-preview-list">{result.items.map(t=><li key={t.pageId}><div><h2><a href={`/pages/templates/${t.versionId}`}>{t.title}</a></h2><p>Version {t.version}{!t.active?' (retired)':''}</p></div></li>)}</ul>:<p>{retired?'No retired Page templates.':'No saved Page templates yet.'}</p>}
 <nav aria-label="Page template catalogue pages" className="bo-form-actions">{result.page>1&&<Button href={link(result.page-1)}>Previous templates</Button>}{result.more&&<Button href={link(result.page+1)}>More templates</Button>}</nav></>;
}

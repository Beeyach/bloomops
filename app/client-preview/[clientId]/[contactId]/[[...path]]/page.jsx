import RecordDiscussion from '@/components/bloomops/RecordDiscussion';
import {getRecordDiscussions} from '@/lib/bloomops/record-discussions.mjs';
import UserAvatar from '@/components/bloomops/UserAvatar';
import { notFound } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { createClientPreview } from '@/lib/bloomops/client-preview.mjs';
import { previewLiveCondition } from '@/lib/bloomops/preview-policy.mjs';
import { previewBase, previewApiBase, previewDocument } from '@/lib/bloomops/preview-links.mjs';
import { portalOnboarding } from '@/lib/bloomops/onboarding-views.mjs';
import { portalProjects } from '@/lib/bloomops/projects.mjs';
import { portalMilestoneSummaries } from '@/lib/bloomops/milestones.mjs';
import { portalDeliverables } from '@/lib/bloomops/deliverables.mjs';
import { listFiles } from '@/lib/bloomops/files.mjs';
import { approvalRequests, getPortalApproval } from '@/lib/bloomops/content-approvals.mjs';
import { portalContent, getPortalContent, hasPortalContent } from '@/lib/bloomops/portal-content.mjs';
import { getWorkspacePage } from '@/lib/bloomops/pages.mjs';
import { getWorkspacePageTree } from '@/lib/bloomops/page-hierarchy.mjs';
import { getPageComments } from '@/lib/bloomops/page-comments.mjs';
import ClientPreviewShell from '@/components/bloomops/ClientPreviewShell';
import { PortalHome } from '@/components/bloomops/PortalHome';
import { PortalContentList, PortalContentDetail } from '@/components/bloomops/PortalContent';
import ContentReviewSnapshot from '@/components/bloomops/ContentReviewSnapshot';
import { Button, PageHeader, Notice, EmptyState } from '@/components/bloomops/Primitives';
import PageGlyph from '@/components/bloomops/PageGlyph';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client preview' };
export default async function ClientPreviewPage({ params, searchParams }) {
  const { access, actor: viewer } = await requireShell('internal');
  const { clientId, contactId, path = [] } = await params, query = await searchParams || {};
  if (path[0]==='discussions' ? path.length!==3 : path.length>2 || path.length&&!['content','approvals','pages'].includes(path[0])) notFound();
  const selection = await createClientPreview(access.db, viewer, clientId, contactId);
  if (!selection) notFound();
  const { actor, contact } = selection, db = access.db;
  const base = previewBase(clientId, contactId), apiBase = previewApiBase(clientId, contactId), preview = { base, apiBase };
  const [clients, hasContent, tree] = await Promise.all([portalOnboarding(db,actor),hasPortalContent(db,actor),getWorkspacePageTree(db,actor)]);
  const client = clients.find(row=>row.id===clientId);
  if (!client) notFound();
  let body;
  if (!path.length) {
    const projectPage = /^\d+$/.test(query.projectPage || '') ? Number(query.projectPage) : 1;
    if (!Number.isSafeInteger(projectPage) || projectPage < 1 || projectPage > 10000) notFound();
    const [projectRows,approvals] = await Promise.all([portalProjects(db,actor,{limit:11,offset:(projectPage-1)*10}),approvalRequests(db,actor)]);
    const projects = projectRows.slice(0,10);
    const milestones = await portalMilestoneSummaries(db,actor,{projectIds:projects.map(row=>row.id)});
    const details = await Promise.all(projects.map(async project=>[project.id,await portalDeliverables(db,actor,project.id),await listFiles(db,actor,project.id,{portal:true})]));
    body = <><PortalHome workspaceName={access.workspace.name} user={{name:contact.name}} clients={[{...client,projects}]} milestones={milestones} deliverables={Object.fromEntries(details.map(([id,d])=>[id,d]))} files={Object.fromEntries(details.map(([id,,f])=>[id,f]))} approvals={approvals} preview={preview}/>
      {(projectPage>1 || projectRows.length>10)&&<nav className="bo-form-actions" aria-label="Project pages">
        {projectPage>1&&<Button href={`${base}?projectPage=${projectPage-1}`}>Previous projects</Button>}
        {projectRows.length>10&&<Button href={`${base}?projectPage=${projectPage+1}`}>More projects</Button>}
      </nav>}</>;
  } else if(path[0]==='discussions'){
    const parent={type:path[1],id:path[2]},data=await getRecordDiscussions(db,actor,parent,{threadId:query.threadId||null,page:query.page?Number(query.page):1,resolved:query.resolved==='true'});if(!data)notFound();
    body=<RecordDiscussion initial={data} workspaceId={actor.workspaceId} api={`${apiBase}/discussions/${parent.type}/${parent.id}`} returnHref={base} portal readOnly/>;
  } else if (path[0]==='content') {
    if (path[1]) {
      const item = await getPortalContent(db,actor,path[1]);if(!item)notFound();
      body = <PortalContentDetail item={item} preview={preview}/>;
    } else {
      const result = await portalContent(db,actor,query);
      body = result.ok ? <PortalContentList result={result} preview={preview}/> : <Notice tone="error">Choose an available content view and page. <a href={`${base}/content`}>Reset view</a></Notice>;
    }
  } else if (path[0]==='approvals') {
    if (!path[1]) notFound();
    const item = await getPortalApproval(db,actor,path[1]);if(!item)notFound();
    body = <><Button href={base} variant="ghost">Back to home</Button><PageHeader title="Approval needed" subtitle={`Review round ${item.number}`}/><ContentReviewSnapshot snapshot={item.snapshot}/><p className="bo-hint">Responses are disabled in preview.</p></>;
  } else if (path[0]==='pages') {
    const rows = tree?.rows || [];
    if (!path[1]) body = <><PageHeader title="Pages"/>{rows.length?<PageLinks rows={rows} base={base}/>:<EmptyState title="No shared pages"><p>Pages shared with this contact will appear here.</p></EmptyState>}</>;
    else {
      const page = await getWorkspacePage(db,actor,path[1]);if(!page)notFound();
      const number = /^\d+$/.test(query.page||'')?Number(query.page):1;
      const discussion = await getPageComments(db,actor,page.id,{threadId:query.thread||null,page:number,resolved:query.resolved==='true'});
      if (!discussion) notFound();
      const children = rows.filter(row=>row.parent_id===page.id), parent = rows.find(row=>row.id===rows.find(row=>row.id===page.id)?.parent_id);
      body = <article className="bo-page-editor bo-page-reader">
        <Button href={parent?`${base}/pages/${parent.id}`:`${base}/pages`} variant="ghost">{parent?parent.title:'All pages'}</Button>
        <div className="bo-page-title"><PageGlyph name={page.icon} size={22}/><h1>{page.title}</h1></div>
        <div className="bo-page-body" dangerouslySetInnerHTML={{__html:previewDocument(page.body,base,apiBase)}}/>
        {children.length>0&&<section className="bo-section"><h2 className="bo-h2">Subpages</h2><PageLinks rows={children} base={base}/></section>}
        <section className="bo-section"><h2 className="bo-h2">Discussion</h2>
          <nav className="bo-portal-content-actions" aria-label="Discussion views"><Button href={`${base}/pages/${page.id}`}>Open</Button><Button href={`${base}/pages/${page.id}?resolved=true`}>Resolved</Button></nav>
          {discussion.messages ? <ul className="bo-rows">{discussion.messages.map(message=><li key={message.id} className="bo-row"><div><span className="bo-comment-author"><UserAvatar seed={message.author} size={28} src={`/api/bloomops${base}/pages/${page.id}/photos/${message.id}`}/><strong>{message.author}</strong></span><p className="bo-body" style={{whiteSpace:'pre-wrap'}}>{message.body}</p></div></li>)}</ul> : discussion.threads.length ? <ul className="bo-rows">{discussion.threads.map(thread=><li className="bo-row" key={thread.id}><div><span className="bo-comment-author"><UserAvatar seed={thread.author} size={28} src={`/api/bloomops${base}/pages/${page.id}/photos/${thread.id}`}/><strong>{thread.author}</strong></span><p className="bo-body">{thread.preview}</p><a className="bo-link" href={`${base}/pages/${page.id}?thread=${thread.id}`}>View discussion ({thread.count})</a></div></li>)}</ul> : <p className="bo-body">No discussions here yet.</p>}
          <div className="bo-form-actions">{number>1&&<Button href={discussionHref(base,page.id,query,number-1)}>Previous page</Button>}{discussion.more&&<Button href={discussionHref(base,page.id,query,number+1)}>Next page</Button>}</div>
        </section>
      </article>;
    }
  }
  // Do not render data accumulated before a staff/contact revocation.
  if (!await db.get(sql`SELECT 1 AS ok WHERE ${previewLiveCondition(actor)}`)) notFound();
  return <ClientPreviewShell client={client} contact={contact} workspaceName={access.workspace.name} base={base} apiBase={apiBase} section={path[0]||'home'} hasContent={hasContent} hasPages={Boolean(tree?.rows.length)}>{body}</ClientPreviewShell>;
}
function PageLinks({rows,base}) { return <ul className="bo-rows">{rows.map(row=><li className="bo-row" key={row.id}><PageGlyph name={row.icon} size={18}/><a className="bo-link" href={`${base}/pages/${row.id}`}>{row.title}</a></li>)}</ul>; }
function discussionHref(base,id,query,page) { const search=new URLSearchParams({page:String(page)});if(query.thread)search.set('thread',query.thread);if(query.resolved==='true')search.set('resolved','true');return `${base}/pages/${id}?${search}`; }

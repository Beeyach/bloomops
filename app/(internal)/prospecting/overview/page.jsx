import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectGoogle} from '@/lib/bloomops/prospect-google.mjs';
import {prospectOutreachOverview} from '@/lib/bloomops/prospect-outreach.mjs';
import {prospectReplyOverview} from '@/lib/bloomops/prospect-replies.mjs';
import {Button,PageHeader,Status} from '@/components/bloomops/Primitives';
import {Icon} from '@/components/bloomops/Icons';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
export const dynamic='force-dynamic';
export const metadata={title:'Prospecting Overview'};
export default async function OverviewPage({searchParams}){
 const {access,actor}=await requireShell('internal'),query=await searchParams,data=await prospectOutreachOverview(access.db,actor,Number(query.page??1));if(!data)notFound();const connection=await getProspectGoogle(access.db,actor,access.env);if(!connection)notFound();
 const replies=await prospectReplyOverview(access.db,actor);if(!replies)notFound();
 return <div className="bo-prospect-page"><PageHeader title="Overview" subtitle="Your conversations, saved drafts and content reviews." actions={<Button href="/prospecting/mailbox" icon="history" variant="ghost">Mailbox review</Button>}/>
 <section className="bo-outreach-sender"><span className="bo-outreach-mark"><Icon name="mail" size={20}/></span><div><h2>Sending is off</h2><p>{data.sender?data.sender.email:'Set up your Google Workspace sender.'}</p><p className="bo-hint">{connection.connected?'Google is connected. No email is scheduled.':'Google is not connected. No email is scheduled.'}</p></div><Button href="/prospecting/sender" icon="settings">Sender setup</Button></section>
 {replies.rows.length>0&&<section className="bo-outreach-overview"><h2>Conversations</h2><ul className="bo-outreach-drafts">{replies.rows.map(row=><li key={row.id}><div className="bo-outreach-prospect"><ProspectAvatar id={row.id} website={row.website}/><h3>{row.businessName}</h3></div><Status tone={row.holdState==='stopped'?'error':row.holdState==='held'?'warning':'neutral'} glyph={row.holdState==='stopped'?'cross':row.holdState==='held'?'dash':'clock'} label={row.holdState==='stopped'?'Stopped':row.holdState==='held'?'Held for review':row.checkStatus==='checked'?'Thread checked':row.checkStatus==='checking'?'Check pending':'Not checked'}/><Button href={'/prospecting/'+row.id+'/replies'} icon="history">Review conversation</Button></li>)}</ul>{replies.more&&<p className="bo-hint">Showing the 20 most recently accepted conversations. Earlier reviews remain available from their delivery receipts.</p>}</section>}
 <section className="bo-outreach-overview"><h2>Saved drafts</h2>{data.rows.length?<ul className="bo-outreach-drafts">{data.rows.map(row=><li key={row.id}><div className="bo-outreach-prospect"><ProspectAvatar id={row.id} website={row.website}/><h3>{row.businessName}</h3></div><Status tone={row.approved?'success':'neutral'} label={row.approved?'Content approved':row.profileRevision!==row.sourceProfileRevision?'Profile changed':'Needs review'}/><Button href={'/prospecting/'+row.id+'/outreach'} icon="chevron-right">Review draft</Button></li>)}</ul>:<div className="bo-outreach-empty"><Icon name="pages" size={28}/><h3>{data.page===1?'No saved outreach drafts':'No more drafts'}</h3><p>Open a prospect to prepare an introduction and two follow-ups.</p><Button href="/prospecting" icon="prospecting">Browse prospects</Button></div>}</section>
 <nav className="bo-prospect-pagination" aria-label="Draft pages">{data.page>1&&<Button href={'?page='+(data.page-1)}>Previous</Button>}{data.more&&<Button href={'?page='+(data.page+1)}>Next</Button>}</nav>
 </div>;
}

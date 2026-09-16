import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {teamActionWorkload} from '@/lib/bloomops/team-workload.mjs';
import {Button,EmptyState,Facts,Notice,PageHeader,Section} from '@/components/bloomops/Primitives';
import {ActionList} from '@/components/bloomops/Actions';
export const dynamic='force-dynamic';
export const metadata={title:'Team Action workload'};
const href=(query,patch)=>'/team/workload?'+new URLSearchParams({...query,...patch});
const label=row=>row.membershipId?(row.name||'Assigned member'):'Unassigned';
function Counts({row}) {return <Facts items={[
  ['Open',row.open],['Overdue',row.overdue],['Waiting',row.waiting],['In review',row.review],
  ['Dependency-blocked',row.blocked],['Undated',row.undated],['Next dated work',row.nextDueDate||'None'],
]}/>;}
export default async function TeamWorkloadPage({searchParams}) {
  const {access,actor}=await requireShell('internal');
  const result=await teamActionWorkload(access.db,actor,await searchParams||{});
  return <><PageHeader title="Action workload" subtitle="Team · Current open Actions by assignee." actions={<><Button href="/team">People</Button><Button href="/team/departments">Department work</Button></>}/>
    <p className="bo-body">Only work you can currently read is included. Counts describe Actions, not hours or capacity. Waiting, review and blocked counts can overlap.</p>
    <p className="bo-small">Dates follow each Client’s timezone. Dependency-blocked Actions are excluded from Overdue. Done and cancelled work is excluded.</p>
    {!result.ok?<Notice tone="warning">{result.reason==='invalid'?'These workload filters are invalid.':result.reason==='not_found'?'No readable open Actions remain for that assignee.':'This workload view is unavailable.'} <a className="bo-link" href="/team/workload">Open current workload</a></Notice>:<>
      <Button href={href(result.query,{})}>Refresh workload</Button>
      {result.selected&&<Section title={`${label(result.selected)} — open Actions`}>
        {result.selected.membershipId&&!result.selected.active&&<p>This assignee is no longer active; their existing responsibility is retained.</p>}
        <Counts row={result.selected}/><ActionList items={result.actions?.items||[]}/>
        <nav aria-label="Assigned Actions pages" className="bo-form-actions">
          {result.query.actionPage>1&&<Button href={href(result.query,{actionPage:result.query.actionPage-1})}>Previous Actions</Button>}
          {result.actions?.hasMore&&<Button href={href(result.query,{actionPage:result.query.actionPage+1})}>Next Actions</Button>}
          <Button href={href(result.query,{assignee:'',actionPage:1})}>Close assigned Actions</Button>
        </nav>
      </Section>}
      <Section title="By assignee">
        {!result.items.length?<EmptyState title="No readable open Actions"><p>Assign work through its existing Work record. Completed work stays in Work history.</p></EmptyState>:
          <div className="bo-workload-list">{result.items.map(row=><section key={row.membershipId||'none'} className="bo-workload-person" aria-label={`${label(row)} workload`}>
            <h3 className="bo-h3"><a className="bo-link" href={href(result.query,{assignee:row.membershipId||'none',actionPage:1})}>{label(row)}</a></h3>
            {row.membershipId&&!row.active&&<p className="bo-hint">Inactive assignee</p>}<Counts row={row}/>
          </section>)}</div>}
        <nav aria-label="Workload pages" className="bo-form-actions">
          {result.query.page>1&&<Button href={href(result.query,{page:result.query.page-1})}>Previous people</Button>}
          {result.hasMore&&<Button href={href(result.query,{page:result.query.page+1})}>Next people</Button>}
        </nav>
      </Section>
    </>}
  </>;
}

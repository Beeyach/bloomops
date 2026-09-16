import TeamNavigation from '@/components/bloomops/TeamNavigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {teamDepartmentWork} from '@/lib/bloomops/team-departments.mjs';
import {Button,EmptyState,Field,Notice,PageHeader} from '@/components/bloomops/Primitives';
import {ProjectList} from '@/components/bloomops/Projects';
import {ActionList} from '@/components/bloomops/Actions';
export const dynamic='force-dynamic';
export const metadata={title:'Department work'};
const href=(query,patch)=>'/team/departments?'+new URLSearchParams({...query,...patch});
export default async function TeamDepartmentsPage({searchParams}) {
  const {access,actor}=await requireShell('internal');
  const result=await teamDepartmentWork(access.db,actor,await searchParams||{});
  return <><PageHeader title="Department work" subtitle="Projects and Actions across your agency."/><TeamNavigation active="departments"/>
    {!result.ok?<Notice tone="warning">This department selection is unavailable. <a className="bo-link" href="/team/departments">Reset department filters</a></Notice>:<>
      <form action="/team/departments" className="bo-action-filters" aria-label="Department work filters">
        <Field id="team-department" label="Department"><select id="team-department" name="department" className="bo-control" defaultValue={result.query.department}>{result.departments.map(d=><option key={d.slug} value={d.slug}>{d.name}{!d.active?' (inactive)':''}</option>)}</select></Field>
        <Field id="department-records" label="Records"><select id="department-records" name="tab" className="bo-control" defaultValue={result.query.tab}><option value="projects">Projects</option><option value="actions">Actions</option></select></Field>
        <Field id="department-state" label="Work state"><select id="department-state" name="state" className="bo-control" defaultValue={result.query.state}><option value="open">Open work</option><option value="all">All work</option></select></Field>
        <Button type="submit">Show department work</Button>
      </form>
      <h2 className="bo-h2">{result.department.name} {result.query.tab==='projects'?'projects':'Actions'}</h2>
      <p className="bo-small bo-section-description">Only records you can currently read are included. A Service sets its work’s department; work without a Service uses the Project department. Action access does not grant access to its Project.</p>
      {result.query.department!=='operations'&&<Button variant="ghost" href={'/'+result.query.department}>Open {result.department.name} workspace</Button>}
      {!result.records.items.length?<EmptyState title="No readable work in this view"><p>Try Actions for individually assigned work, or include all work to see completed records.</p></EmptyState>:
        result.query.tab==='projects'?<ProjectList projects={result.records.items} filtered structured/>:<ActionList items={result.records.items} structured/>}
      <nav className="bo-form-actions bo-results-actions" aria-label="Department work pages">
        {result.query.page>1&&<Button href={href(result.query,{page:result.query.page-1})}>Previous records</Button>}
        {result.records.hasMore&&result.query.page<10000&&<Button href={href(result.query,{page:result.query.page+1})}>Next records</Button>}
        <Button href={href(result.query,{})}>Refresh department work</Button>
      </nav>
    </>}
  </>;
}

import { notFound } from 'next/navigation';
import { cache } from 'react';
import { evaluate, loadInternalClientResource } from '@/lib/bloomops/authorization.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { authorizeProject, projectOptions } from '@/lib/bloomops/projects.mjs';
import { listProjectAssignments } from '@/lib/bloomops/project-assignments.mjs';
import { projectActivity } from '@/lib/bloomops/project-activity.mjs';
import { Button, PageHeader, Section } from '@/components/bloomops/Primitives';
import { ActivityRow } from '@/components/bloomops/Clients';
import { ProjectFacts } from '@/components/bloomops/Projects';
import ProjectControls from '@/components/bloomops/ProjectControls';
import ProjectTeam from '@/components/bloomops/ProjectTeam';
import { listMilestones } from '@/lib/bloomops/milestones.mjs';
import MilestoneControls from '@/components/bloomops/MilestoneControls';
import { listActions } from '@/lib/bloomops/actions.mjs';
import { ProjectActions } from '@/components/bloomops/ActionControls';
import { listDeliverables } from '@/lib/bloomops/deliverables.mjs';
import DeliverableControls from '@/components/bloomops/DeliverableControls';
import { listFiles } from '@/lib/bloomops/files.mjs';
import FileControls from '@/components/bloomops/FileControls';

export const dynamic = 'force-dynamic';
// Metadata and the page share this request's authorized Project read. React
// drops the result after rendering; the next navigation rechecks current data.
const projectForRequest = cache(async id => {
  const { access, actor } = await requireShell('internal');
  return { access, actor, result: await authorizeProject(access.db, actor, id, 'project.view') };
});

export async function generateMetadata({ params }) {
  const { result } = await projectForRequest((await params).id);
  return { title: result.project?.name || 'Project' };
}

export default async function ProjectPage({ params }) {
  const { access, actor, result } = await projectForRequest((await params).id);
  if (!result.ok) notFound();
  const { project, resource } = result;
  const mayManage = evaluate(actor, { action: 'project.manage', resource }).allowed;
  const [assignments, activity, options, clientResource, milestones, actions, deliverables, files] = await Promise.all([
    listProjectAssignments(access.db, actor, project.id), projectActivity(access.db, actor, project.id),
    mayManage ? projectOptions(access.db, actor, { clientId: project.clientId }) : null,
    loadInternalClientResource(access.db, actor.workspaceId, project.clientId),
    listMilestones(access.db, actor, project.id),
    listActions(access.db, actor, { projectId: project.id, view: 'all' }),
    listDeliverables(access.db, actor, project.id),
    listFiles(access.db, actor, project.id),
  ]);
  const clientHref = clientResource && evaluate(actor, { action: 'client.view', resource: clientResource }).allowed ? `/clients/${project.clientId}` : null;
  return <>
    <Button href="/work?tab=projects" variant="ghost" size="sm">Back to projects</Button>
    <PageHeader title={project.name} subtitle={[project.clientName, project.serviceName].filter(Boolean).join(' · ')} />
    {mayManage ? <ProjectControls key={project.revision} project={project} options={{ ...options, canRestrict: options.canRestrict || assignments.some(a => a.membershipId === actor.membershipId) }} clientHref={clientHref} /> : <Section id="project-details" title="Details"><ProjectFacts project={project} clientHref={clientHref} />{project.statusReason && <p className="bo-body bo-project-reason">{project.statusReason}</p>}</Section>}
    <MilestoneControls projectId={project.id} summary={milestones} mayManage={mayManage} canRestrict={options?.canRestrict || assignments.some(a => a.membershipId === actor.membershipId)} />
    <ProjectActions projectId={project.id} items={actions.items || []} members={options?.members || []} milestones={milestones.items.map(({ id, name }) => ({ id, name }))}
      mayManage={mayManage} membershipId={actor.membershipId} canRestrict={options?.canRestrict || assignments.some(a => a.membershipId === actor.membershipId)} />
    <DeliverableControls projectId={project.id} summary={deliverables} files={files.items} mayManage={evaluate(actor, { action: 'deliverable.manage', resource }).allowed}
      canRestrict={options?.canRestrict || assignments.some(a => a.membershipId === actor.membershipId)} />
    <FileControls projectId={project.id} summary={files} deliverables={deliverables.items.map(({ id, title }) => ({ id, title }))} mayManage={evaluate(actor, { action: 'file.manage', resource }).allowed}
      canRestrict={options?.canRestrict || assignments.some(a => a.membershipId === actor.membershipId)} />
    <ProjectTeam projectId={project.id} assignments={assignments} members={options?.members || []} mayManage={mayManage} />
    <Section id="project-activity" title="Activity">
      {activity.length ? <ol className="bo-activity" aria-label="Project history">{activity.map(event => <ActivityRow key={event.id} event={event} />)}</ol> : <p className="bo-small">No changes have been recorded yet.</p>}
      <p className="bo-small">This history is internal.</p>
    </Section>
  </>;
}

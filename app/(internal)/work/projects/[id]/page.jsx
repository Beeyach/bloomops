import { notFound } from 'next/navigation';
import { evaluate, loadInternalClientResource } from '@/lib/bloomops/authorization.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { authorizeProject, getProject, projectOptions } from '@/lib/bloomops/projects.mjs';
import { listProjectAssignments } from '@/lib/bloomops/project-assignments.mjs';
import { projectActivity } from '@/lib/bloomops/project-activity.mjs';
import { Button, PageHeader, Section } from '@/components/bloomops/Primitives';
import { ActivityRow } from '@/components/bloomops/Clients';
import { ProjectFacts } from '@/components/bloomops/Projects';
import ProjectControls from '@/components/bloomops/ProjectControls';
import ProjectTeam from '@/components/bloomops/ProjectTeam';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }) {
  const { access, actor } = await requireShell('internal');
  const project = await getProject(access.db, actor, (await params).id);
  return { title: project?.name || 'Project' };
}

export default async function ProjectPage({ params }) {
  const { access, actor } = await requireShell('internal');
  const result = await authorizeProject(access.db, actor, (await params).id, 'project.view');
  if (!result.ok) notFound();
  const { project, resource } = result;
  const mayManage = evaluate(actor, { action: 'project.manage', resource }).allowed;
  const [assignments, activity, options, clientResource] = await Promise.all([
    listProjectAssignments(access.db, actor, project.id), projectActivity(access.db, actor, project.id),
    mayManage ? projectOptions(access.db, actor, { clientId: project.clientId }) : null,
    loadInternalClientResource(access.db, actor.workspaceId, project.clientId),
  ]);
  const clientHref = clientResource && evaluate(actor, { action: 'client.view', resource: clientResource }).allowed ? `/clients/${project.clientId}` : null;
  return <>
    <Button href="/work" variant="ghost" size="sm">Back to projects</Button>
    <PageHeader title={project.name} subtitle={[project.clientName, project.serviceName].filter(Boolean).join(' · ')} />
    {mayManage ? <ProjectControls key={project.revision} project={project} options={{ ...options, canRestrict: options.canRestrict || assignments.some(a => a.membershipId === actor.membershipId) }} clientHref={clientHref} /> : <Section id="project-details" title="Details"><ProjectFacts project={project} clientHref={clientHref} />{project.statusReason && <p className="bo-body bo-project-reason">{project.statusReason}</p>}</Section>}
    <ProjectTeam projectId={project.id} assignments={assignments} members={options?.members || []} mayManage={mayManage} />
    <Section id="project-activity" title="Activity">
      {activity.length ? <ol className="bo-activity" aria-label="Project history">{activity.map(event => <ActivityRow key={event.id} event={event} />)}</ol> : <p className="bo-small">No changes have been recorded yet.</p>}
      <p className="bo-small">This history is internal.</p>
    </Section>
  </>;
}

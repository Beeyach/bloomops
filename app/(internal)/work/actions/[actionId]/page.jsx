import { notFound } from 'next/navigation';
import { evaluate } from '@/lib/bloomops/authorization.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { authorizeAction, getAction, listActions } from '@/lib/bloomops/actions.mjs';
import { listActionDependencies } from '@/lib/bloomops/action-dependencies.mjs';
import { projectOptions } from '@/lib/bloomops/projects.mjs';
import { listMilestones } from '@/lib/bloomops/milestones.mjs';
import { Button, PageHeader, Section } from '@/components/bloomops/Primitives';
import { ActionFacts } from '@/components/bloomops/Actions';
import { ActionControls } from '@/components/bloomops/ActionControls';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }) {
  const { access, actor } = await requireShell('internal');
  const action = await getAction(access.db, actor, (await params).actionId);
  return { title: action?.title || 'Action' };
}

export default async function ActionPage({ params }) {
  const { access, actor } = await requireShell('internal'), { actionId } = await params;
  const authorized = await authorizeAction(access.db, actor, actionId);
  if (!authorized.ok) notFound();
  const mayManage = evaluate(actor, { action: 'action.manage', resource: authorized.resource }).allowed;
  const mayProgress = evaluate(actor, { action: 'action.progress', resource: authorized.resource }).allowed;
  const [action, dependencies, options, milestones, candidates] = await Promise.all([
    getAction(access.db, actor, actionId), listActionDependencies(access.db, actor, actionId),
    mayManage ? projectOptions(access.db, actor, { clientId: authorized.resource.clientId }) : null,
    mayManage ? listMilestones(access.db, actor, authorized.resource.projectId) : null,
    mayManage ? listActions(access.db, actor, { projectId: authorized.resource.projectId, view: 'all' }) : null,
  ]);
  if (!action || !dependencies.ok) notFound();
  return <>
    <Button href="/work" variant="ghost" size="sm">Back to Actions</Button>
    <PageHeader title={action.title} subtitle={`${action.clientName} · ${action.projectName}`} actions={action.projectHref && <Button href={action.projectHref}>Open Project</Button>} />
    <Section id="action-details" title="Details"><ActionFacts action={action} /></Section>
    <ActionControls action={action} projectId={action.projectId} members={options?.members || []} milestones={(milestones?.items || []).map(({ id, name }) => ({ id, name }))}
      mayManage={mayManage} mayProgress={mayProgress} canRestrict={options?.canRestrict || authorized.resource.restrictedToMembershipIds.includes(actor.membershipId)}
      dependencies={dependencies} candidates={(candidates?.items || []).map(({ id, title }) => ({ id, title }))} />
  </>;
}

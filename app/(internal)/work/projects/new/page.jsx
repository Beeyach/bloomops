import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { projectOptions } from '@/lib/bloomops/projects.mjs';
import { Button, EmptyState, PageHeader } from '@/components/bloomops/Primitives';
import ProjectForm from '@/components/bloomops/ProjectForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create project' };

export default async function NewProjectPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const query = await searchParams;
  const options = await projectOptions(access.db, actor);
  if (!options) notFound();
  const clientId = options.clients.some(c => c.id === query?.clientId) ? query.clientId : '';
  return <>
    <Button href="/work?tab=projects" variant="ghost" size="sm">Back to projects</Button>
    <PageHeader title="Create project" subtitle="A clear piece of delivery for one client, with an optional purchased service." />
    {options.clients.length ? <ProjectForm options={options} clientId={clientId} /> : <EmptyState title="Add a client first" actions={<Button href="/clients/new">Add client</Button>}><p>Every project belongs to a client.</p></EmptyState>}
  </>;
}

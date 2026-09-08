import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { contentOptions } from '@/lib/bloomops/content.mjs';
import ContentForm from '@/components/bloomops/ContentForm';
import { Button, EmptyState, Field, Notice, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create Content' };
export default async function NewContentPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const params = await searchParams || {};
  if (Object.keys(params).some(k => k !== 'q') || (params.q != null && typeof params.q !== 'string')) notFound();
  const options = await contentOptions(access.db, actor, { query: params.q || '' });
  if (!options) notFound();
  return <><Button href="/social" variant="ghost">Back to Social</Button><PageHeader title="Create Content" subtitle="Start with an idea. Shape the details as the work develops." />
    <form action="/social/new" className="bo-content-parent-search"><Field id="content-parent-search" label="Find a Client"><input id="content-parent-search" name="q" className="bo-control" defaultValue={params.q || ''} maxLength={120} type="search" /></Field><Button type="submit">Find contexts</Button></form>
    {options.parentsOverflow && <Notice>The first 200 Clients and 200 Social services are shown. Narrow the Client search to find another context.</Notice>}
    {options.parents.length ? <ContentForm options={options} /> : <EmptyState title="No available context"><p>{params.q ? 'Try another Client name.' : 'A current Client or Social service assignment is needed to create Content.'}</p></EmptyState>}
  </>;
}

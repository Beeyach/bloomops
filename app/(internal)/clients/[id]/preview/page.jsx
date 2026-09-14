import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { clientPreviewContacts } from '@/lib/bloomops/client-preview.mjs';
import { getClient } from '@/lib/bloomops/clients.mjs';
import { previewBase } from '@/lib/bloomops/preview-links.mjs';
import { Button, PageHeader, EmptyState } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Preview as client' };
export default async function PreviewSelection({ params }) {
  const { access, actor } = await requireShell('internal'), { id } = await params;
  const selection = await clientPreviewContacts(access.db, actor, id);
  if (!selection) notFound();
  const client = await getClient(access.db, selection.viewer, id);
  if (!client) notFound();
  return <><Button href={`/clients/${encodeURIComponent(id)}`} variant="ghost">Back to client</Button>
    <PageHeader title="Preview as client" subtitle={client.name}/>
    <p className="bo-body">Choose a connected contact to see their shared work. Preview is read only.</p>
    {selection.contacts.length ? <ul className="bo-rows" aria-label="Connected contacts">{selection.contacts.map(contact=><li className="bo-row" key={contact.id}>
      <div className="bo-row-text"><strong className="bo-row-title">{contact.name}</strong>{contact.email&&<span className="bo-row-meta">{contact.email}</span>}</div>
      <Button href={previewBase(id, contact.id)} icon="eye">Preview<span className="sr-only"> as {contact.name}</span></Button>
    </li>)}</ul> : <EmptyState title="No connected client account"><p>This client needs a contact with an active portal account before their access can be previewed.</p></EmptyState>}
  </>;
}

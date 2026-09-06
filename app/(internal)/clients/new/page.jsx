import { evaluate } from '@/lib/bloomops/authorization.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { notFound } from 'next/navigation';
import { ownerCandidates, timezoneOptions } from '@/lib/bloomops/clients.mjs';
import { PageHeader } from '@/components/bloomops/Primitives';
import ClientForm from '@/components/bloomops/ClientForm';

// Add a client. A route rather than a dialog, so the form has an address a
// person can return to, a real back step, and room for seven fields on a
// phone without a sheet fighting the keyboard.
//
// The page refuses anyone the engine would refuse at the API: without
// `client.create` this address does not exist. That is the screen being
// honest, not the security boundary; POST /api/bloomops/clients asks the
// engine the same question on its own.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Add client' };

export default async function NewClientPage() {
  const { access, actor } = await requireShell('internal');
  if (!evaluate(actor, { action: 'client.create' }).allowed) notFound();
  const owners = await ownerCandidates(access.db, access.workspace.id);
  return (
    <>
      <PageHeader title="Add a client" subtitle="A client record with the person the agency talks to. Nobody is invited or emailed." />
      <div className="bo-page-narrow">
        <ClientForm owners={owners} timezones={timezoneOptions()} />
      </div>
    </>
  );
}

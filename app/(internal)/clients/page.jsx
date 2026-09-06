import { evaluate } from '@/lib/bloomops/authorization.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { listClients, normalizeFilter } from '@/lib/bloomops/clients.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { plural } from '@/lib/bloomops/format.mjs';
import { Button, EmptyState, PageHeader } from '@/components/bloomops/Primitives';
import { ClientFilters, ClientRow } from '@/components/bloomops/Clients';

// The Clients list (A6): every client this person may see, with the
// lifecycle filters.
//
// The scope is the actor's, resolved by the A4 engine on the server for
// this request: workspace-wide for Owner, Admin, and Project Manager; only
// the clients a Team Member holds a client_assignments row for; nothing at
// all for anyone else. The `status` in the address narrows that list and
// can never widen it, because listClients rebuilds the scope clause from
// the actor and adds the filter to it. A Client membership never reaches
// this page: requireShell sends them to the portal before anything renders.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clients' };

export default async function ClientsPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const params = await searchParams;
  const filter = normalizeFilter(params?.status);
  const { clients, counts, total } = await listClients(access.db, actor, { filter });
  const mayCreate = evaluate(actor, { action: 'client.create' }).allowed;
  const assigned = actor.scope?.kind === 'assigned';

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={navItem('clients').purpose}
        actions={
          mayCreate ? (
            <Button variant="primary" icon="plus" href="/clients/new">
              Add client
            </Button>
          ) : null
        }
      />

      {total === 0 ? (
        <EmptyState
          title={assigned ? 'No clients are assigned to you' : 'No clients yet'}
          actions={mayCreate ? <Button variant="primary" href="/clients/new">Add the first client</Button> : null}
        >
          {assigned ? (
            <p>When you are assigned to a client, they appear here. Being assigned to one of a client’s services does not add the client itself.</p>
          ) : (
            <p>Add a client to keep their contacts, status, and history in one place. Adding a client does not invite them to anything.</p>
          )}
        </EmptyState>
      ) : (
        <>
          <ClientFilters active={filter} counts={counts} />
          {clients.length === 0 ? (
            <EmptyState title="Nothing with that status">
              <p>No client you can see is at this stage right now.</p>
            </EmptyState>
          ) : (
            <>
              <p className="bo-small bo-list-count">{plural(clients.length, 'client')}</p>
              <ul className="bo-rows" aria-label="Clients">
                {clients.map((client) => (
                  <ClientRow key={client.id} client={client} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

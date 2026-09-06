import { Surface } from './Primitives';

// The portal's one page in Release A. Calm, short, and only what is true:
// which client this account is for (when it is linked), that nothing is
// waiting on the person, and what to do if they expected more. No
// internal vocabulary, no counts, no empty modules.

function firstName(user) {
  const name = String(user?.name || '').trim();
  return name ? name.split(/\s+/)[0] : '';
}

export function PortalHome({ workspaceName, user, clients = [] }) {
  const first = firstName(user);
  if (clients.length === 0) {
    return (
      <>
        <h1 className="bo-display bo-display-lg">{first ? `Hello, ${first}` : 'Hello'}</h1>
        <p className="bo-lede" style={{ marginTop: 12 }}>
          This is your portal with {workspaceName}.
        </p>
        <Surface padding="lg" style={{ marginTop: 32 }}>
          <h2 className="bo-h2" style={{ marginBottom: 8 }}>
            Your portal is not connected yet
          </h2>
          <p className="bo-body">
            You are signed in as {user.email}, but this account has not been connected to your work with {workspaceName} yet, so there is nothing to show for now. {workspaceName} will finish setting it up.
          </p>
          <p className="bo-body" style={{ marginTop: 12 }}>
            If you expected to see something here, reply to the person who invited you.
          </p>
        </Surface>
      </>
    );
  }
  const single = clients.length === 1 ? clients[0] : null;
  return (
    <>
      <h1 className="bo-display bo-display-lg">{single ? single.name : first ? `Hello, ${first}` : 'Hello'}</h1>
      <p className="bo-lede" style={{ marginTop: 12 }}>
        {single ? `Your work with ${workspaceName}.` : `Your work with ${workspaceName}, across ${clients.length} accounts.`}
      </p>
      {!single && (
        <ul className="bo-rows" style={{ marginTop: 32 }} aria-label="Your accounts">
          {clients.map((client) => (
            <li key={client.id} className="bo-row">
              <span className="bo-row-text">
                <span className="bo-row-title">{client.name}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Surface padding="lg" style={{ marginTop: 32 }}>
        <h2 className="bo-h2" style={{ marginBottom: 8 }}>
          Nothing needs your attention right now
        </h2>
        <p className="bo-body">
          There is nothing waiting on you, and nothing new has been shared with you yet. When {workspaceName} needs something from you, or has something to show you, it will appear here.
        </p>
        <p className="bo-body" style={{ marginTop: 12 }}>
          Need something in the meantime? Reply to the person at {workspaceName} you usually talk to.
        </p>
      </Surface>
    </>
  );
}

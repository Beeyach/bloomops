'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';
import { CLIENT_HEALTHS, CLIENT_HEALTH_LABELS, LIMITS } from '@/lib/bloomops/clients.mjs';
import Dialog from './Dialog';
import { Button, Facts, Field, Notice, Section, fieldAria } from './Primitives';
import { ClientHealth } from './Clients';
import { mapServerErrors } from './ClientForm';
import useClientEditDraft from './useClientEditDraft';
import {clientEditSnapshot} from '@/lib/bloomops/client-edit-values.mjs';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';

// The Overview tab of one client, for someone who may manage it.
//
// Three things can change here and each is its own control, because they
// are three different facts: the client's details, its health, and who owns
// it inside the agency. The client's relationship status is shown and never
// edited: moving a client out of Draft is the activation flow (A9), not a
// field. There is no Activate button in A6 and nothing here simulates one.
//
// A Team Member assigned to the client sees the same facts through
// ClientFactsList with no controls at all, rendered on the server.

export async function send(path, { method = 'PATCH', body = null } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const error = new Error(data?.error || (res.status === 401 ? 'Your session has ended. Sign in again.' : 'That did not work. Try again.'));
    error.fields = data?.errors || null;
    error.status = res.status;
    throw error;
  }
  return data || {};
}

const dateOnly = (value) => (value ? formatDate(`${value}T00:00:00.000Z`) : null);

// The plain facts of a client, the same for a manager and for a Team
// Member who may only read. Not a card: label and value pairs.
export function ClientFactsList({ client }) {
  const items = [
    ['Status', client.statusLabel],
    ['Health', <ClientHealth key="health" health={client.health} />],
    [
      'Website',
      client.website ? (
        <a key="w" className="bo-link" href={client.website} rel="noreferrer noopener" target="_blank">
          {client.website.replace(/^https?:\/\//, '')}
        </a>
      ) : (
        <span className="bo-soft">Not set</span>
      ),
    ],
    ['Time zone', client.timezone ? client.timezone.replace(/_/g, ' ') : <span key="tz" className="bo-soft">Not set</span>],
    ['Start date', dateOnly(client.startDate) || <span key="sd" className="bo-soft">Not set</span>],
  ];
  if (client.endDate) items.push(['End date', dateOnly(client.endDate)]);
  items.push([
    'Internal owner',
    client.owner ? (
      <span key="o">
        {client.owner.name}
        {!client.owner.active && <span className="bo-soft"> (no longer active in this workspace)</span>}
      </span>
    ) : (
      <span key="o" className="bo-soft">Nobody yet</span>
    ),
  ]);
  return <Facts items={items} />;
}

function DetailsForm({ client, scope, owners, onSaved, onCancel, closeRef }) {
  const draft = useClientEditDraft({scope,clientId:client.id,onSaved});
  const {fields:values,errors,busy,checking,pending,ready,message,conflict}=draft.view;
  useEffect(()=>{closeRef.current=()=>{if(draft.close())onCancel();};return()=>{closeRef.current=null;};});
  const shown=mapServerErrors(errors);
  const set=key=>e=>draft.edit(key,e.target.value);
  if(draft.lost)return <div className="bo-dialog-body"><Notice tone="error">This editor is no longer available. Close it and reopen the Client in your current workspace.</Notice><Button onClick={()=>closeRef.current?.()}>Close</Button></div>;
  if(!ready)return <div className="bo-dialog-body" aria-live="polite">{checking?'Checking current Client access…':<><Notice tone="error">{message}</Notice><Button onClick={draft.check}>Retry access check</Button></>}</div>;
  // An owner who is no longer active keeps their place in the list while
  // they are still the owner, so saving an unrelated field does not quietly
  // reassign the client to nobody.
  const options = client.owner && !owners.some((o) => o.id === client.owner.membershipId)
    ? [{ id: client.owner.membershipId, name: client.owner.name, roleLabel: client.owner.roleLabel }, ...owners]
    : owners;

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Enter the client or company name.';
    draft.setErrors(next);
    if (Object.keys(next).length > 0) return;
    draft.submit();
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="bo-dialog-body">
        <p className="bo-small">Unsaved details are kept in this browser for seven days when storage is available. They are only saved to the Client when you choose Save changes.</p>
        {draft.storageError && <Notice tone="error">{draft.storageError}</Notice>}
        {draft.copies.length>0 && <details><summary>Recovery copies ({draft.copies.length})</summary><ul className="bo-rows">{draft.copies.map(copy=><li key={copy.key}><span>{new Date(copy.at).toLocaleString()}</span> <Button size="sm" disabled={busy||checking} onClick={()=>draft.recover(copy.key)}>Restore copy</Button> <Button size="sm" disabled={busy||checking} onClick={()=>draft.discard(copy.key)}>Discard copy</Button></li>)}</ul></details>}
        <fieldset disabled={busy||checking||Boolean(pending)} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <Field id="edit-name" label="Client or company name" error={shown.name}>
          <input {...fieldAria({ id: 'edit-name', error: shown.name })} className="bo-control" type="text" maxLength={LIMITS.name} value={values.name} onChange={set('name')} required />
        </Field>
        <Field id="edit-website" label="Website" optional error={shown.website}>
          <input {...fieldAria({ id: 'edit-website', error: shown.website })} className="bo-control" type="text" inputMode="url" maxLength={LIMITS.website} value={values.website} onChange={set('website')} />
        </Field>
        <Field id="edit-timezone" label="Time zone" optional error={shown.timezone}>
          <select {...fieldAria({ id: 'edit-timezone', error: shown.timezone })} className="bo-control" value={values.timezone} onChange={set('timezone')}>
            <option value="">Not set</option>
            {client.timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field id="edit-start-date" label="Start date" optional error={shown.startDate}>
          <input {...fieldAria({ id: 'edit-start-date', error: shown.startDate })} className="bo-control" type="date" value={values.startDate} onChange={set('startDate')} />
        </Field>
        <Field id="edit-end-date" label="End date" optional error={shown.endDate} hint="Only if the relationship has an agreed end.">
          <input {...fieldAria({ id: 'edit-end-date', hint: true, error: shown.endDate })} className="bo-control" type="date" value={values.endDate} onChange={set('endDate')} />
        </Field>
        <Field
          id="edit-owner"
          label="Internal owner"
          optional
          error={shown.ownerMembershipId}
          hint="Who is responsible for this client inside the agency. It does not change anyone’s access."
        >
          <select {...fieldAria({ id: 'edit-owner', hint: true, error: shown.ownerMembershipId })} className="bo-control" value={values.ownerMembershipId} onChange={set('ownerMembershipId')}>
            <option value="">Nobody yet</option>
            {options.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
                {owner.roleLabel ? ` · ${owner.roleLabel}` : ''}
              </option>
            ))}
          </select>
        </Field>
        </fieldset>
        {message && <Notice tone={conflict?'error':'info'}>{message}</Notice>}
        {(conflict||pending) && <p><a className="bo-link" href={`/clients/${client.id}`} target="_blank" rel="noopener noreferrer">Open saved Client to compare</a></p>}
        {conflict && <Button onClick={draft.reload} disabled={busy||checking}>Reload saved details</Button>}
      </div>
      <div className="bo-dialog-actions">
        <Button onClick={()=>closeRef.current?.()} disabled={busy}>
          Close
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={checking||conflict}>
          {pending?'Retry same save':'Save changes'}
        </Button>
      </div>
    </form>
  );
}

export default function ClientOverview({ client, scope, owners, timezones }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [ready,setReady]=useState(false);
  const lifetime=useRef(null),closeRef=useRef(null);
  useEffect(()=>{
    const current={active:true};lifetime.current=current;setReady(true);
    const invalidate=()=>{current.active=false;setReady(false);setEditing(false);};
    const storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();};
    let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}
    addEventListener(DRAFT_CONTEXT_KEY,invalidate);addEventListener('storage',storage);
    return()=>{current.active=false;channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,invalidate);removeEventListener('storage',storage);};
  },[scope.userId,scope.workspaceId,client.id]);
  function saved(data){setEditing(false);toast(data.unchanged?'Nothing had changed.':'The client was updated.');router.refresh();}

  async function setHealth(health) {
    if (health === client.health||!ready||!lifetime.current?.active||healthBusy) return;
    const current=lifetime.current;
    setHealthBusy(true);
    try {
      await send(`/api/bloomops/clients/${client.id}`, { body: { health, expected:clientEditSnapshot(client),editorScope:scope } });
      if(!current.active)return;
      toast(`Health is now ${CLIENT_HEALTH_LABELS[health]}.`);
      router.refresh();
    } catch (err) {
      if(current.active)toast(err.status===409?'The saved Client changed. Refresh before changing its health.':err.message, { tone: 'error' });
    } finally {
      if(current.active)setHealthBusy(false);
    }
  }

  return (
    <>
      <Section
        id="details"
        title="Details"
        aside={
          <Button size="sm" disabled={!ready||healthBusy} onClick={() => setEditing(true)}>
            Edit details
          </Button>
        }
      >
        <ClientFactsList client={client} />
      </Section>

      <Section id="health" title="Health">
        <p className="bo-body">How the work with this client is going. It is a separate fact from the client’s status and changing it leaves the status alone.</p>
        <div className="bo-choices" role="group" aria-label="Client health">
          {CLIENT_HEALTHS.map((health) => (
            <Button
              key={health}
              size="sm"
              variant={health === client.health ? 'primary' : 'secondary'}
              aria-pressed={health === client.health}
              disabled={!ready||healthBusy||editing}
              onClick={() => setHealth(health)}
            >
              {CLIENT_HEALTH_LABELS[health]}
            </Button>
          ))}
        </div>
      </Section>

      <Dialog open={editing} onClose={() => closeRef.current?.()} title="Edit client details" initialFocus="#edit-name">
        <DetailsForm
          client={{ ...client, timezones }}
          owners={owners}
          scope={scope}
          closeRef={closeRef}
          onSaved={saved}
          onCancel={() => setEditing(false)}
        />
      </Dialog>
    </>
  );
}

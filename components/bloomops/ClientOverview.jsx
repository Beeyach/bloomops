'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';
import { CLIENT_HEALTHS, CLIENT_HEALTH_LABELS, LIMITS } from '@/lib/bloomops/clients.mjs';
import Dialog from './Dialog';
import { Button, Facts, Field, Notice, Section, fieldAria } from './Primitives';
import { ClientHealth } from './Clients';
import { mapServerErrors } from './ClientForm';

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

function DetailsForm({ client, owners, onSubmit, onCancel, busy, serverError, fieldErrors }) {
  const [values, setValues] = useState({
    name: client.name || '',
    website: client.website || '',
    timezone: client.timezone || '',
    startDate: client.startDate || '',
    endDate: client.endDate || '',
    ownerMembershipId: client.owner?.membershipId || '',
  });
  const [errors, setErrors] = useState({});
  const shown = { ...errors, ...fieldErrors };
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

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
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      name: values.name.trim(),
      website: values.website.trim(),
      timezone: values.timezone,
      startDate: values.startDate,
      endDate: values.endDate,
      ownerMembershipId: values.ownerMembershipId,
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="bo-dialog-body">
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
        {serverError && <Notice tone="error">{serverError}</Notice>}
      </div>
      <div className="bo-dialog-actions">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export default function ClientOverview({ client, owners, timezones }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  async function saveDetails(patch) {
    setBusy(true);
    setServerError('');
    setFieldErrors({});
    try {
      const data = await send(`/api/bloomops/clients/${client.id}`, { body: patch });
      setEditing(false);
      toast(data.unchanged ? 'Nothing had changed.' : 'The client was updated.');
      router.refresh();
    } catch (err) {
      if (err.fields) setFieldErrors(mapServerErrors(err.fields));
      else setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setHealth(health) {
    if (health === client.health) return;
    setHealthBusy(true);
    try {
      await send(`/api/bloomops/clients/${client.id}`, { body: { health } });
      toast(`Health is now ${CLIENT_HEALTH_LABELS[health]}.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setHealthBusy(false);
    }
  }

  return (
    <>
      <Section
        id="details"
        title="Details"
        aside={
          <Button size="sm" onClick={() => { setServerError(''); setFieldErrors({}); setEditing(true); }}>
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
              disabled={healthBusy}
              onClick={() => setHealth(health)}
            >
              {CLIENT_HEALTH_LABELS[health]}
            </Button>
          ))}
        </div>
      </Section>

      <Dialog open={editing} onClose={() => { if (!busy) setEditing(false); }} title="Edit client details" initialFocus="#edit-name">
        <DetailsForm
          client={{ ...client, timezones }}
          owners={owners}
          onSubmit={saveDetails}
          onCancel={() => setEditing(false)}
          busy={busy}
          serverError={serverError}
          fieldErrors={fieldErrors}
        />
      </Dialog>
    </>
  );
}

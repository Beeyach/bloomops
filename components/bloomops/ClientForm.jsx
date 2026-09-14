'use client';

import useClientCreationDraft from './useClientCreationDraft';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { LIMITS } from '@/lib/bloomops/clients.mjs';
import { Button, Field, Notice, fieldAria } from './Primitives';

// The create-client form. Short on purpose: this makes a client record, not
// an activation. Choosing services, assigning a team, generating onboarding,
// and inviting the client are later steps in later phases, so there is no
// wizard here and no "step 1 of 4".
//
// Three fields are required, because a client with no name cannot be found
// and a client with nobody to talk to cannot be worked with. Everything
// else is marked optional and can be filled in later from the client's own
// screen.
//
// The browser checks what it can so a person is not made to wait for a
// round trip on an obvious slip. The server validates all of it again
// regardless, and a server answer is shown as written.

const REQUIRED_HINT = 'Enter an email address, like name@example.com.';
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ClientForm({ userId, workspaceId, owners = [], timezones = [] }) {
  const router = useRouter();
  const recovery = useClientCreationDraft({ userId, workspaceId, onCreated: (id, name) => {
    toast(`${name} was added as a draft client.`);
    router.push(`/clients/${id}`);
    router.refresh();
  } });
  const { fields: values, errors, message: formError, busy, checking, client } = recovery.view;
  const set = key => e => recovery.edit(key, e.target.value);

  function submit(e) {
    e.preventDefault();
    // A sent request may already have committed. Reconcile that identity
    // before validating newer, possibly incomplete edits in this form.
    if (recovery.view.pending) { recovery.submit(); return; }
    const next = {};
    if (!values.name.trim()) next.name = 'Enter the client or company name.';
    if (!values.contactName.trim()) next.contactName = 'Enter the contact’s name.';
    if (!EMAIL_SHAPE.test(values.contactEmail.trim())) next.contactEmail = REQUIRED_HINT;
    recovery.setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = document.getElementById(Object.keys(next)[0] === 'name' ? 'client-name' : Object.keys(next)[0] === 'contactName' ? 'client-contact-name' : 'client-contact-email');
      first?.focus();
      return;
    }
    recovery.submit();
  }

  if (recovery.lost) return <Notice tone="warning">Your account or workspace changed. Reload this page before adding a client.</Notice>;

  return (
    <form onSubmit={submit} noValidate className="bo-form">
      {recovery.copies.length > 0 && <section className="bo-client-recovery" aria-label="Client recovery copies">
        <h2>Unsaved client details</h2>
        {recovery.copies.map(copy => <div key={copy.key} className="bo-client-recovery-row">
          <div><span>{copy.count} {copy.count === 1 ? 'field' : 'fields'}</span><time dateTime={new Date(copy.at).toISOString()}>{new Date(copy.at).toLocaleString()}</time></div>
          <Button disabled={busy || checking} onClick={() => recovery.recover(copy.key)}>Review recovered fields</Button>
          <Button variant="ghost" disabled={busy || checking} onClick={() => recovery.discard(copy.key)}>Discard copy</Button>
        </div>)}
      </section>}
      {recovery.storageError && <Notice tone="warning">{recovery.storageError}</Notice>}
      {checking && <p role="status">Checking current access and saved client…</p>}
      {client && <section className="bo-client-recovery" aria-label="Saved client">
        <h2>Client saved</h2>
        {client.name && <p>{client.name}</p>}
        <div className="bo-form-actions"><Button href={`/clients/${client.id}`} variant="primary">Open saved client</Button><Button disabled={busy || checking} onClick={recovery.download} icon="download">Download my input</Button><Button disabled={busy || checking} onClick={recovery.reset}>Start another client</Button></div>
      </section>}
      <fieldset className="bo-client-form-fields" disabled={!recovery.ready || checking}>
      <Field id="client-name" label="Client or company name" error={errors.name} hint="What the agency calls this client.">
        <input
          {...fieldAria({ id: 'client-name', hint: true, error: errors.name })}
          className="bo-control"
          type="text"
          autoComplete="organization"
          maxLength={LIMITS.name}
          value={values.name}
          onChange={set('name')}
          required
        />
      </Field>

      <Field id="client-contact-name" label="Primary contact name" error={errors.contactName}>
        <input
          {...fieldAria({ id: 'client-contact-name', error: errors.contactName })}
          className="bo-control"
          type="text"
          autoComplete="name"
          maxLength={LIMITS.contactName}
          value={values.contactName}
          onChange={set('contactName')}
          required
        />
      </Field>

      <Field
        id="client-contact-email"
        label="Primary contact email"
        error={errors.contactEmail}
        hint="Saved with the contact. Nobody is invited or emailed when a client is added."
      >
        <input
          {...fieldAria({ id: 'client-contact-email', hint: true, error: errors.contactEmail })}
          className="bo-control"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={LIMITS.contactEmail}
          value={values.contactEmail}
          onChange={set('contactEmail')}
          required
        />
      </Field>

      <Field id="client-website" label="Website" optional error={errors.website}>
        <input
          {...fieldAria({ id: 'client-website', error: errors.website })}
          className="bo-control"
          type="text"
          inputMode="url"
          autoComplete="url"
          maxLength={LIMITS.website}
          value={values.website}
          onChange={set('website')}
        />
      </Field>

      <Field id="client-timezone" label="Time zone" optional error={errors.timezone} hint="Used when scheduling work with this client.">
        <select
          {...fieldAria({ id: 'client-timezone', hint: true, error: errors.timezone })}
          className="bo-control"
          value={values.timezone}
          onChange={set('timezone')}
        >
          <option value="">Not set</option>
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Field>

      <Field id="client-start-date" label="Start date" optional error={errors.startDate}>
        <input
          {...fieldAria({ id: 'client-start-date', error: errors.startDate })}
          className="bo-control"
          type="date"
          value={values.startDate}
          onChange={set('startDate')}
        />
      </Field>

      <Field
        id="client-owner"
        label="Internal owner"
        optional
        error={errors.ownerMembershipId}
        hint="Who is responsible for this client inside the agency. It does not change anyone’s access."
      >
        <select
          {...fieldAria({ id: 'client-owner', hint: true, error: errors.ownerMembershipId })}
          className="bo-control"
          value={values.ownerMembershipId}
          onChange={set('ownerMembershipId')}
        >
          <option value="">Nobody yet</option>
          {[...new Set(owners.map(owner => owner.roleLabel))].map(role => <optgroup key={role} label={role}>
            {owners.filter(owner => owner.roleLabel === role).map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </optgroup>)}
        </select>
      </Field>

      </fieldset>
      {formError && <Notice tone={client ? "info" : "warning"}>{formError}</Notice>}

      <div className="bo-form-actions">
        <Button href="/clients">Cancel</Button>
        {!client && <Button type="submit" variant="primary" loading={busy} disabled={!recovery.ready || checking}>
          {busy ? 'Saving…' : recovery.view.pending ? 'Retry save' : 'Add client'}
        </Button>}
        {!client && recovery.view.pending && <Button disabled={busy || checking} onClick={recovery.download}>Download my input</Button>}
      </div>
      <p className="bo-small">The client is saved as a draft. Services, onboarding, and portal access come later.</p>
    </form>
  );
}

// The server names fields the way the domain layer does; the form uses the
// same names, so this is a pass-through that keeps unknown keys out.
export function mapServerErrors(errors) {
  const allowed = ['name', 'contactName', 'contactEmail', 'website', 'timezone', 'startDate', 'endDate', 'company', 'ownerMembershipId', 'health'];
  const out = {};
  for (const key of allowed) if (errors[key]) out[key] = errors[key];
  return out;
}

'use client';

import { useState } from 'react';
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

export default function ClientForm({ owners = [], timezones = [] }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: '',
    contactName: '',
    contactEmail: '',
    website: '',
    timezone: '',
    startDate: '',
    ownerMembershipId: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Enter the client or company name.';
    if (!values.contactName.trim()) next.contactName = 'Enter the contact’s name.';
    if (!EMAIL_SHAPE.test(values.contactEmail.trim())) next.contactEmail = REQUIRED_HINT;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = document.getElementById(Object.keys(next)[0] === 'name' ? 'client-name' : Object.keys(next)[0] === 'contactName' ? 'client-contact-name' : 'client-contact-email');
      first?.focus();
      return;
    }
    send();
  }

  async function send() {
    setBusy(true);
    setFormError('');
    try {
      const res = await fetch('/api/bloomops/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          contactName: values.contactName.trim(),
          contactEmail: values.contactEmail.trim(),
          website: values.website.trim() || undefined,
          timezone: values.timezone || undefined,
          startDate: values.startDate || undefined,
          ownerMembershipId: values.ownerMembershipId || undefined,
        }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        // Per-field answers go beside the fields; anything else is one
        // sentence above the actions.
        if (data?.errors) setErrors(mapServerErrors(data.errors));
        setFormError(data?.errors ? '' : data?.error || (res.status === 401 ? 'Your session has ended. Sign in again.' : 'That did not work. Try again.'));
        return;
      }
      toast(`${values.name.trim()} was added as a draft client.`);
      router.push(`/clients/${data.client.id}`);
      router.refresh();
    } catch {
      setFormError('That did not work. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="bo-form">
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
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name} · {owner.roleLabel}
            </option>
          ))}
        </select>
      </Field>

      {formError && <Notice tone="error">{formError}</Notice>}

      <div className="bo-form-actions">
        <Button href="/clients">Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>
          Add client
        </Button>
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

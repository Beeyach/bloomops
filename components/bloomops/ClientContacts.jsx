'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmDialog } from '@/lib/dialog.mjs';
import { toast } from '@/lib/toast.mjs';
import { LIMITS } from '@/lib/bloomops/clients.mjs';
import Dialog from './Dialog';
import { Button, EmptyState, Field, Notice, Section, fieldAria } from './Primitives';
import { ContactRow } from './Clients';
import { send } from './ClientOverview';

// Contact management for one client.
//
// A client may have several contacts and at most one primary. Making one
// contact primary takes the marker from whoever held it, in one request the
// server writes as a single batch, so the two can never both be primary and
// a failure changes nothing. A client is allowed to have no primary contact
// at all; nobody is promoted automatically when the primary is removed or
// stands down, because who speaks for a client is a decision.
//
// A contact who can sign in to the client portal cannot be removed here and
// cannot have their address taken away. Ending that relationship belongs to
// the portal flow (A9/A10), not to tidying an address book. The server
// refuses it either way; the screen says so plainly rather than offering a
// control that will fail.

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ContactForm({ contact, onSubmit, onCancel, busy, serverError, fieldErrors, idPrefix }) {
  const [values, setValues] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    title: contact?.title || '',
  });
  const [errors, setErrors] = useState({});
  const shown = { ...errors, ...fieldErrors };
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const id = (key) => `${idPrefix}-${key}`;

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Enter the contact’s name.';
    if (values.email.trim() && !EMAIL_SHAPE.test(values.email.trim())) next.email = 'Enter an email address, like name@example.com.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      title: values.title.trim(),
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="bo-dialog-body">
        <Field id={id('name')} label="Name" error={shown.name}>
          <input {...fieldAria({ id: id('name'), error: shown.name })} className="bo-control" type="text" autoComplete="name" maxLength={LIMITS.contactName} value={values.name} onChange={set('name')} required />
        </Field>
        <Field id={id('title')} label="Job title" optional error={shown.title}>
          <input {...fieldAria({ id: id('title'), error: shown.title })} className="bo-control" type="text" maxLength={LIMITS.contactTitle} value={values.title} onChange={set('title')} />
        </Field>
        <Field
          id={id('email')}
          label="Email address"
          optional
          error={shown.email}
          hint={contact?.linked ? 'This contact can sign in to the client portal, so their address cannot be removed.' : 'Adding an address does not invite anyone.'}
        >
          <input {...fieldAria({ id: id('email'), hint: true, error: shown.email })} className="bo-control" type="email" inputMode="email" autoComplete="email" maxLength={LIMITS.contactEmail} value={values.email} onChange={set('email')} />
        </Field>
        <Field id={id('phone')} label="Phone" optional error={shown.phone}>
          <input {...fieldAria({ id: id('phone'), error: shown.phone })} className="bo-control" type="tel" inputMode="tel" autoComplete="tel" maxLength={LIMITS.contactPhone} value={values.phone} onChange={set('phone')} />
        </Field>
        {serverError && <Notice tone="error">{serverError}</Notice>}
      </div>
      <div className="bo-dialog-actions">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {contact ? 'Save contact' : 'Add contact'}
        </Button>
      </div>
    </form>
  );
}

const contactFieldErrors = (errors) => {
  const out = {};
  for (const key of ['name', 'email', 'phone', 'title']) if (errors?.[key]) out[key] = errors[key];
  return out;
};

export default function ClientContacts({ clientId, clientName, contacts }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState({});
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const mark = (id, value) => setRowBusy((b) => ({ ...b, [id]: value }));
  const reset = () => {
    setServerError('');
    setFieldErrors({});
  };

  async function add(values) {
    setBusy(true);
    reset();
    try {
      await send(`/api/bloomops/clients/${clientId}/contacts`, { method: 'POST', body: values });
      setAdding(false);
      toast(`${values.name} was added as a contact.`);
      router.refresh();
    } catch (err) {
      if (err.fields) setFieldErrors(contactFieldErrors(err.fields));
      else setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(values) {
    setBusy(true);
    reset();
    try {
      const data = await send(`/api/bloomops/clients/${clientId}/contacts/${editing.id}`, { body: values });
      setEditing(null);
      toast(data.unchanged ? 'Nothing had changed.' : `${values.name} was updated.`);
      router.refresh();
    } catch (err) {
      if (err.fields) setFieldErrors(contactFieldErrors(err.fields));
      else setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary(contact) {
    mark(contact.id, 'primary');
    try {
      await send(`/api/bloomops/clients/${clientId}/contacts/${contact.id}`, { body: { isPrimary: true } });
      toast(`${contact.name} is now the primary contact.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(contact.id, null);
    }
  }

  async function clearPrimary(contact) {
    mark(contact.id, 'primary');
    try {
      await send(`/api/bloomops/clients/${clientId}/contacts/${contact.id}`, { body: { isPrimary: false } });
      toast(`${clientName} has no primary contact now.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(contact.id, null);
    }
  }

  async function remove(contact) {
    const ok = await confirmDialog({
      title: `Remove ${contact.name}?`,
      message: `They are taken off ${clientName}’s contacts. Their history stays in this client’s activity.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    mark(contact.id, 'remove');
    try {
      await send(`/api/bloomops/clients/${clientId}/contacts/${contact.id}`, { method: 'DELETE' });
      toast(`${contact.name} was removed.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(contact.id, null);
    }
  }

  return (
    <>
      <Section
        id="contacts"
        title="Contacts"
        aside={
          <Button size="sm" icon="plus" onClick={() => { reset(); setAdding(true); }}>
            Add contact
          </Button>
        }
      >
        {contacts.length === 0 ? (
          <EmptyState title="No contacts yet">
            <p>Add the people at {clientName} the agency talks to. Adding a contact does not invite them to anything.</p>
          </EmptyState>
        ) : (
          <ul className="bo-rows" aria-label="Contacts">
            {contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                actions={
                  <>
                    <Button size="sm" onClick={() => { reset(); setEditing(contact); }} aria-label={`Edit ${contact.name}`}>
                      Edit
                    </Button>
                    {contact.isPrimary ? (
                      <Button size="sm" loading={rowBusy[contact.id] === 'primary'} onClick={() => clearPrimary(contact)} aria-label={`Remove the primary marker from ${contact.name}`}>
                        Clear primary
                      </Button>
                    ) : (
                      <Button size="sm" loading={rowBusy[contact.id] === 'primary'} onClick={() => makePrimary(contact)} aria-label={`Make ${contact.name} the primary contact`}>
                        Make primary
                      </Button>
                    )}
                    {!contact.linked && (
                      <Button size="sm" variant="danger" loading={rowBusy[contact.id] === 'remove'} onClick={() => remove(contact)} aria-label={`Remove ${contact.name}`}>
                        Remove
                      </Button>
                    )}
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Dialog open={adding} onClose={() => { if (!busy) setAdding(false); }} title="Add a contact" initialFocus="#add-contact-name">
        <ContactForm idPrefix="add-contact" onSubmit={add} onCancel={() => setAdding(false)} busy={busy} serverError={serverError} fieldErrors={fieldErrors} />
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => { if (!busy) setEditing(null); }} title="Edit contact" initialFocus="#edit-contact-name">
        {editing && (
          <ContactForm
            key={editing.id}
            idPrefix="edit-contact"
            contact={editing}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            busy={busy}
            serverError={serverError}
            fieldErrors={fieldErrors}
          />
        )}
      </Dialog>
    </>
  );
}

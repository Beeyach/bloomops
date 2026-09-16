'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { LIMITS, SERVICE_STATUSES, SERVICE_STATUS_LABELS } from '@/lib/bloomops/services.mjs';
import Dialog from './Dialog';
import { Button, EmptyState, Field, Notice, Section, fieldAria } from './Primitives';
import { ServiceRow } from './Services';
import { send } from './ClientOverview';

// The purchased services of one client, for someone who may manage them.
//
// A client with Social, Ads, and GHL is one client with three of these
// rows. Adding one is a small form, not a wizard: what was bought, and the
// few facts that are known at the time. Nothing here activates anything.
//
// The status control offers all six canonical service statuses and changes
// only the service. The client's own lifecycle is a separate fact on a
// separate record and no request from this screen can move it.
//
// Two services of the same type cannot run at once. The add form leaves out
// a type that already has an open engagement so the screen does not invite
// the mistake, and the server refuses it anyway, in words, whatever the
// browser sends.

const SERVICE_FIELD_KEYS = ['serviceTypeId', 'packageName', 'startDate', 'endDate', 'scopeNotes', 'status'];

const serviceFieldErrors = (errors) => {
  const out = {};
  for (const key of SERVICE_FIELD_KEYS) if (errors?.[key]) out[key] = errors[key];
  return out;
};

function ServiceForm({ service, serviceTypes, onSubmit, onCancel, busy, serverError, fieldErrors, idPrefix }) {
  const editing = Boolean(service);
  const [values, setValues] = useState({
    serviceTypeId: service?.serviceTypeId || serviceTypes[0]?.id || '',
    packageName: service?.packageName || '',
    startDate: service?.startDate || '',
    endDate: service?.endDate || '',
    scopeNotes: service?.scopeNotes || '',
    status: service?.status || 'planned',
  });
  const [errors, setErrors] = useState({});
  const shown = { ...errors, ...fieldErrors };
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const id = (key) => `${idPrefix}-${key}`;
  // Nothing left to add: the client already has every service in the
  // catalogue open. The form says so and offers nothing, rather than four
  // fields that cannot be submitted.
  const nothingToAdd = !editing && serviceTypes.length === 0;

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!editing && !values.serviceTypeId) next.serviceTypeId = 'Choose the service this client bought.';
    if (values.startDate && values.endDate && values.endDate < values.startDate) next.endDate = 'The end date cannot be before the start date.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const payload = {
      packageName: values.packageName.trim(),
      startDate: values.startDate,
      scopeNotes: values.scopeNotes.trim(),
    };
    // A new engagement is always Planned and the server decides that, so
    // creation never sends a status. Editing sends the status and the end
    // date, which only make sense once the engagement exists.
    if (editing) {
      payload.status = values.status;
      payload.endDate = values.endDate;
    } else {
      payload.serviceTypeId = values.serviceTypeId;
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="bo-dialog-body">
        {editing ? (
          <>
            {/* Not a control: an engagement keeps the service it was
                bought for, so this is a fact the form states rather than a
                field with a label pointing at nothing editable. */}
            <div className="bo-service-fixed">
              <span className="bo-label">Service</span>
              <p className="bo-body">
                {service.serviceTypeName}
                {service.departmentName ? <span className="bo-service-department">{service.departmentName}</span> : null}
              </p>
            </div>
            <Field id={id('status')} label="Status" error={shown.status} hint="This changes the service only. The client’s own status is not affected.">
              <select {...fieldAria({ id: id('status'), hint: true, error: shown.status })} className="bo-control" value={values.status} onChange={set('status')}>
                {SERVICE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {SERVICE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : nothingToAdd ? (
          <Notice tone="info">Every service in the catalogue is already running for this client. Complete or cancel one before adding it again.</Notice>
        ) : (
          <Field id={id('serviceTypeId')} label="Service" error={shown.serviceTypeId} hint="A new service starts as Planned.">
            <select
              {...fieldAria({ id: id('serviceTypeId'), hint: true, error: shown.serviceTypeId })}
              className="bo-control"
              value={values.serviceTypeId}
              onChange={set('serviceTypeId')}
              required
            >
              {serviceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.departmentName ? `${type.name} (${type.departmentName})` : type.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!nothingToAdd && (
          <>
        <Field id={id('packageName')} label="Package" optional error={shown.packageName} hint="What the client bought, in your own words.">
          <input
            {...fieldAria({ id: id('packageName'), hint: true, error: shown.packageName })}
            className="bo-control"
            type="text"
            maxLength={LIMITS.packageName}
            value={values.packageName}
            onChange={set('packageName')}
          />
        </Field>
        <Field id={id('startDate')} label="Start date" optional error={shown.startDate}>
          <input {...fieldAria({ id: id('startDate'), error: shown.startDate })} className="bo-control" type="date" value={values.startDate} onChange={set('startDate')} />
        </Field>
        {editing && (
          <Field id={id('endDate')} label="End date" optional error={shown.endDate}>
            <input {...fieldAria({ id: id('endDate'), error: shown.endDate })} className="bo-control" type="date" value={values.endDate} onChange={set('endDate')} />
          </Field>
        )}
        <Field id={id('scopeNotes')} label="Scope notes" optional error={shown.scopeNotes} hint="Internal. What is and is not included.">
          <textarea
            {...fieldAria({ id: id('scopeNotes'), hint: true, error: shown.scopeNotes })}
            className="bo-control bo-textarea"
            rows={4}
            maxLength={LIMITS.scopeNotes}
            value={values.scopeNotes}
            onChange={set('scopeNotes')}
          />
        </Field>
          </>
        )}
        {serverError && <Notice tone="error">{serverError}</Notice>}
      </div>
      <div className="bo-dialog-actions">
        <Button onClick={onCancel} disabled={busy}>
          {nothingToAdd ? 'Close' : 'Cancel'}
        </Button>
        {!nothingToAdd && (
          <Button type="submit" variant="primary" loading={busy}>
            {editing ? 'Save service' : 'Add service'}
          </Button>
        )}
      </div>
    </form>
  );
}

export default function ClientServices({ clientId, clientName, services, availableTypes }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const reset = () => {
    setServerError('');
    setFieldErrors({});
  };

  async function add(values) {
    setBusy(true);
    reset();
    try {
      await send(`/api/bloomops/clients/${clientId}/services`, { method: 'POST', body: values });
      setAdding(false);
      toast('The service was added as Planned.');
      router.refresh();
    } catch (err) {
      if (err.fields) setFieldErrors(serviceFieldErrors(err.fields));
      else setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(values) {
    setBusy(true);
    reset();
    try {
      const data = await send(`/api/bloomops/clients/${clientId}/services/${editing.id}`, { body: values });
      setEditing(null);
      toast(data.unchanged ? 'Nothing had changed.' : `${editing.serviceTypeName} was updated.`);
      router.refresh();
    } catch (err) {
      if (err.fields) setFieldErrors(serviceFieldErrors(err.fields));
      else setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section
        id="services"
        title="Services"
        aside={
          <Button size="sm" icon="plus" onClick={() => { reset(); setAdding(true); }}>
            Add service
          </Button>
        }
      >
        {services.length === 0 ? (
          <EmptyState title="No services yet">
            <p>Add what {clientName} has bought. One client can hold several services at once, each with its own status.</p>
          </EmptyState>
        ) : (
          <ul className="bo-rows" aria-label="Purchased services">
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                actions={
                  <Button size="sm" onClick={() => { reset(); setEditing(service); }} aria-label={`Edit ${service.serviceTypeName}`}>
                    Edit
                  </Button>
                }
              />
            ))}
          </ul>
        )}
        <p className="bo-small bo-service-note">
          A service has its own status. Changing it does not change {clientName}’s own status.
        </p>
      </Section>

      <Dialog open={adding} onClose={() => { if (!busy) setAdding(false); }} title="Add a service" initialFocus="#add-service-serviceTypeId">
        <ServiceForm
          idPrefix="add-service"
          serviceTypes={availableTypes}
          onSubmit={add}
          onCancel={() => setAdding(false)}
          busy={busy}
          serverError={serverError}
          fieldErrors={fieldErrors}
        />
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => { if (!busy) setEditing(null); }} title="Edit service" initialFocus="#edit-service-status">
        {editing && (
          <ServiceForm
            key={editing.id}
            idPrefix="edit-service"
            service={editing}
            serviceTypes={availableTypes}
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

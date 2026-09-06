'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmDialog } from '@/lib/dialog.mjs';
import { toast } from '@/lib/toast.mjs';
import { ASSIGNMENT_ROLES, ASSIGNMENT_ROLE_LABELS } from '@/lib/bloomops/assignments.mjs';
import Dialog from './Dialog';
import { Button, EmptyState, Field, Notice, Section, fieldAria } from './Primitives';
import { AssignmentRow, ServiceTeamHeading } from './Services';
import { send } from './ClientOverview';

// Who inside the agency works on this client, for someone who may change it.
//
// The most important thing this screen does is keep two different amounts
// of access visibly apart. Somebody on the client-wide team reaches the
// client and every service under it, including services added later.
// Somebody on one service's team reaches that service and nothing else: not
// the client record, not the client's other services. They are two lists
// under two headings with two explanations, never one "Team" list.
//
// Being assigned is not the same as being the internal owner. The owner
// section above says who is responsible; these lists say who has access.
// Neither writes the other, and removing an assignment leaves the owner
// exactly as recorded.
//
// Somebody whose membership has ended keeps their row, marked. The engine
// refuses them anyway, and taking the row away is a decision a manager
// makes rather than something that happens quietly.

function AssignForm({ candidates, assigned, onSubmit, onCancel, busy, serverError, fieldErrors, idPrefix, scopeHint }) {
  const available = candidates.filter((c) => !assigned.some((a) => a.membershipId === c.membershipId));
  const [values, setValues] = useState({ membershipId: available[0]?.membershipId || '', assignmentRole: 'member' });
  const [errors, setErrors] = useState({});
  const shown = { ...errors, ...fieldErrors };
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const id = (key) => `${idPrefix}-${key}`;

  function submit(e) {
    e.preventDefault();
    if (!values.membershipId) {
      setErrors({ membershipId: 'Choose someone from the list.' });
      return;
    }
    setErrors({});
    onSubmit(values);
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="bo-dialog-body">
        {available.length === 0 ? (
          <Notice tone="info">Everyone active in this workspace is already on this list.</Notice>
        ) : (
          <Field id={id('membershipId')} label="Person" error={shown.membershipId} hint={scopeHint}>
            <select
              {...fieldAria({ id: id('membershipId'), hint: true, error: shown.membershipId })}
              className="bo-control"
              value={values.membershipId}
              onChange={set('membershipId')}
              required
            >
              {available.map((c) => (
                <option key={c.membershipId} value={c.membershipId}>
                  {c.name} · {c.roleLabel}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id={id('assignmentRole')} label="On this work they are" error={shown.assignmentRole}>
          <select {...fieldAria({ id: id('assignmentRole'), error: shown.assignmentRole })} className="bo-control" value={values.assignmentRole} onChange={set('assignmentRole')}>
            {ASSIGNMENT_ROLES.map((role) => (
              <option key={role} value={role}>
                {ASSIGNMENT_ROLE_LABELS[role]}
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
        <Button type="submit" variant="primary" loading={busy} disabled={available.length === 0}>
          Assign
        </Button>
      </div>
    </form>
  );
}

export default function ClientTeam({ clientId, clientName, clientAssignments, services, serviceAssignments, candidates, children }) {
  const router = useRouter();
  // `target` is null, { kind: 'client' }, or { kind: 'service', service }.
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState({});
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const mark = (id, value) => setRowBusy((b) => ({ ...b, [id]: value }));
  const reset = () => {
    setServerError('');
    setFieldErrors({});
  };

  const basePath = (service) => (service ? `/api/bloomops/clients/${clientId}/services/${service.id}/assignments` : `/api/bloomops/clients/${clientId}/assignments`);

  async function assign(values) {
    setBusy(true);
    reset();
    const service = target?.kind === 'service' ? target.service : null;
    try {
      const data = await send(basePath(service), { method: 'POST', body: values });
      const person = candidates.find((c) => c.membershipId === values.membershipId);
      setTarget(null);
      toast(data.unchanged ? 'Nothing had changed.' : `${person?.name || 'They'} was assigned to ${service ? service.serviceTypeName : clientName}.`);
      router.refresh();
    } catch (err) {
      if (err.fields) setFieldErrors({ membershipId: err.fields.membershipId, assignmentRole: err.fields.assignmentRole });
      else setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(assignment, service) {
    const next = assignment.assignmentRole === 'lead' ? 'member' : 'lead';
    mark(assignment.id, 'role');
    try {
      await send(`${basePath(service)}/${assignment.id}`, { body: { assignmentRole: next } });
      toast(`${assignment.name} is now ${ASSIGNMENT_ROLE_LABELS[next].toLowerCase()}.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(assignment.id, null);
    }
  }

  async function remove(assignment, service) {
    const ok = await confirmDialog({
      title: `Remove ${assignment.name}?`,
      message: service
        ? `They lose access to ${service.serviceTypeName}. Any other assignment they hold on ${clientName} stays.`
        : `They lose ${clientName} and every service under it. A service they are assigned to directly stays.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    mark(assignment.id, 'remove');
    try {
      await send(`${basePath(service)}/${assignment.id}`, { method: 'DELETE' });
      toast(`${assignment.name} was removed.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(assignment.id, null);
    }
  }

  const rowActions = (assignment, service) => (
    <>
      <Button
        size="sm"
        loading={rowBusy[assignment.id] === 'role'}
        onClick={() => changeRole(assignment, service)}
        aria-label={`Make ${assignment.name} ${assignment.assignmentRole === 'lead' ? 'member' : 'lead'}`}
      >
        {assignment.assignmentRole === 'lead' ? 'Make member' : 'Make lead'}
      </Button>
      <Button
        size="sm"
        variant="danger"
        loading={rowBusy[assignment.id] === 'remove'}
        onClick={() => remove(assignment, service)}
        aria-label={`Remove ${assignment.name}${service ? ` from ${service.serviceTypeName}` : ''}`}
      >
        Remove
      </Button>
    </>
  );

  return (
    <>
      {children}

      <Section
        id="client-team"
        title="Client-wide team"
        aside={
          <Button size="sm" icon="plus" onClick={() => { reset(); setTarget({ kind: 'client' }); }}>
            Assign to client
          </Button>
        }
      >
        <p className="bo-body">People here work across every service {clientName} has, including services added later.</p>
        {clientAssignments.length === 0 ? (
          <EmptyState title="Nobody is assigned to the whole client">
            <p>Assign someone here when they work across {clientName}. For work on one service only, use the service teams below.</p>
          </EmptyState>
        ) : (
          <ul className="bo-rows" aria-label="Client-wide team">
            {clientAssignments.map((assignment) => (
              <AssignmentRow key={assignment.id} assignment={assignment} actions={rowActions(assignment, null)} />
            ))}
          </ul>
        )}
      </Section>

      <Section id="service-teams" title="Service teams">
        <p className="bo-body">People here work on one service only. Being on a service team does not give access to {clientName}’s other services.</p>
        {services.length === 0 ? (
          <EmptyState title="No services yet">
            <p>Add a service on the Services tab, then assign the people who work on it.</p>
          </EmptyState>
        ) : (
          services.map((service) => {
            const assigned = serviceAssignments[service.id] || [];
            return (
              <div key={service.id} className="bo-service-team">
                <ServiceTeamHeading service={service} />
                {assigned.length === 0 ? (
                  <p className="bo-small">Nobody is assigned to this service yet.</p>
                ) : (
                  <ul className="bo-rows" aria-label={`${service.serviceTypeName} team`}>
                    {assigned.map((assignment) => (
                      <AssignmentRow key={assignment.id} assignment={assignment} actions={rowActions(assignment, service)} />
                    ))}
                  </ul>
                )}
                {/* The service is named by the heading right above this,
                    so the button says what it does and leaves the name to
                    its accessible label. A label carrying the full service
                    name is wider than a 320px screen. */}
                <Button
                  size="sm"
                  icon="plus"
                  onClick={() => { reset(); setTarget({ kind: 'service', service }); }}
                  aria-label={`Assign someone to ${service.serviceTypeName}`}
                >
                  Assign someone
                </Button>
              </div>
            );
          })
        )}
      </Section>

      <Dialog
        open={Boolean(target)}
        onClose={() => { if (!busy) setTarget(null); }}
        title={target?.kind === 'service' ? `Assign to ${target.service.serviceTypeName}` : `Assign to ${clientName}`}
        initialFocus="#assign-membershipId"
      >
        {target && (
          <AssignForm
            key={target.kind === 'service' ? target.service.id : 'client'}
            idPrefix="assign"
            candidates={candidates}
            assigned={target.kind === 'service' ? serviceAssignments[target.service.id] || [] : clientAssignments}
            scopeHint={
              target.kind === 'service'
                ? `They get ${target.service.serviceTypeName} and nothing else of ${clientName}’s.`
                : `They get ${clientName} and every service under it.`
            }
            onSubmit={assign}
            onCancel={() => setTarget(null)}
            busy={busy}
            serverError={serverError}
            fieldErrors={fieldErrors}
          />
        )}
      </Dialog>
    </>
  );
}

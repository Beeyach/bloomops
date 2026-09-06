// The Service Engagements domain (A7).
//
// A service engagement is one purchased service for one client. A client
// who buys Social, Ads, and GHL is one client with three engagements, never
// three clients: nothing here creates, renames, or touches a client record.
//
// What A7 owns here
//   creating an engagement from the workspace's own service catalogue
//   editing its package name, dates, and scope notes
//   its own lifecycle, the six canonical statuses
//   the invariant that stops a client holding two live engagements of the
//     same service type at once
//   the activity every one of those records
//
// What it deliberately does not own
//   the client's lifecycle. Service status and client relationship status
//   are two separate canonical facts on two separate records. Pausing a
//   service does not pause the client, and nothing in this file writes to
//   bloomops_clients at all.
//
//   activation. Creating an engagement generates no onboarding, instantiates
//   no template, sets no source_template_version_id, invites nobody, sends
//   no mail, and creates no project or action. A9 owns activation and will
//   call into this domain rather than around it.
//
//   approval_preference and source_template_version_id. Both columns exist
//   from A2 and both belong to later phases, so no route reads them from a
//   request and no form offers them.
//
// Every read is scoped through the actor the A4 engine loaded, and every
// write names the workspace and the client in its WHERE clause, so a
// foreign id reaches nothing.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, activityValues } from './activity.mjs';
import { newId, trimmed, validateDate } from './clients.mjs';
import { findServiceType } from './service-catalog.mjs';

// ── vocabulary ────────────────────────────────────────────────────────────

export const SERVICE_STATUSES = schema.SERVICE_ENGAGEMENT_STATUSES;
export const SERVICE_OPEN_STATUSES = schema.SERVICE_OPEN_STATUSES;
export const SERVICE_TERMINAL_STATUSES = schema.SERVICE_TERMINAL_STATUSES;

export const SERVICE_STATUS_LABELS = {
  planned: 'Planned',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// A tone and a glyph, so a status is never colour alone. Deliberately not
// borrowed from the client tables: a paused service and a paused client are
// different facts that happen to share a word.
export const SERVICE_STATUS_TONE = {
  planned: ['neutral', 'dot'],
  onboarding: ['info', 'clock'],
  active: ['success', 'check'],
  paused: ['warning', 'clock'],
  completed: ['neutral', 'check'],
  cancelled: ['neutral', 'dash'],
};

export const serviceStatusLabel = (status) => SERVICE_STATUS_LABELS[status] || status;

export const isOpenStatus = (status) => SERVICE_OPEN_STATUSES.includes(status);

export const LIMITS = {
  packageName: 120,
  // Long enough for what was actually agreed, short enough that it stays a
  // note and does not become a document. Pages are the document layer.
  scopeNotes: 2000,
};

// ── validation ────────────────────────────────────────────────────────────

export function validatePackageName(raw) {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  if (text.length > LIMITS.packageName) return { ok: false, message: `Use ${LIMITS.packageName} characters or fewer for the package.` };
  return { ok: true, value: text };
}

export function validateScopeNotes(raw) {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  if (text.length > LIMITS.scopeNotes) return { ok: false, message: `Use ${LIMITS.scopeNotes} characters or fewer for the scope notes.` };
  return { ok: true, value: text };
}

export function validateServiceStatus(raw) {
  const status = trimmed(raw);
  if (!SERVICE_STATUSES.includes(status)) return { ok: false, message: 'Choose a status from the list.' };
  return { ok: true, value: status };
}

// The service type must be one of this workspace's own, and must still be
// active to start something new with it. A type from another workspace and
// an id that never existed give the same answer, because findServiceType
// puts the workspace in the WHERE clause rather than comparing afterwards.
export async function validateServiceType(db, workspaceId, raw) {
  const id = trimmed(raw);
  if (!id) return { ok: false, message: 'Choose the service this client bought.' };
  const type = await findServiceType(db, workspaceId, id);
  if (!type || !type.active) return { ok: false, message: 'Choose the service this client bought.' };
  return { ok: true, value: type };
}

// ── reading ───────────────────────────────────────────────────────────────

// Which of this client's engagements this actor may see.
//
// Owner, Admin, and Project Manager reach the workspace, so they see all of
// them. A Team Member sees every engagement of a client they hold a
// client_assignments row for, and otherwise only the individual engagements
// they hold a service_assignments row for. A Client membership reaches
// every engagement of their own client (A4's contact scope), which is what
// a later portal projection will build on; the internal screens never call
// this for a Client, because they load the client as an internal record
// first and the engine refuses them there.
function visibleServiceIds(actor, clientId, rows) {
  if (!actor || actor.status !== 'active' || !actor.scope) return [];
  const scope = actor.scope;
  if (scope.kind === 'workspace') return rows;
  if (scope.kind === 'contact') return scope.clientIds.has(clientId) ? rows : [];
  if (scope.kind !== 'assigned') return [];
  if (scope.clientIds.has(clientId)) return rows;
  return rows.filter((row) => scope.serviceEngagementIds.has(row.id));
}

function decorate(row) {
  return {
    id: row.id,
    clientId: row.clientId,
    serviceTypeId: row.serviceTypeId,
    serviceTypeName: row.serviceTypeName,
    serviceTypeActive: row.serviceTypeActive,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    packageName: row.packageName,
    status: row.status,
    statusLabel: serviceStatusLabel(row.status),
    startDate: row.startDate,
    endDate: row.endDate,
    scopeNotes: row.scopeNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const engagementColumns = () => {
  const e = schema.serviceEngagements;
  return {
    id: e.id,
    clientId: e.clientId,
    serviceTypeId: e.serviceTypeId,
    packageName: e.packageName,
    status: e.status,
    startDate: e.startDate,
    endDate: e.endDate,
    scopeNotes: e.scopeNotes,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    serviceTypeName: schema.serviceTypes.name,
    serviceTypeActive: schema.serviceTypes.active,
    departmentId: schema.departments.id,
    departmentName: schema.departments.name,
  };
};

const withCatalogue = (query) => {
  const e = schema.serviceEngagements;
  return query
    .from(e)
    .innerJoin(schema.serviceTypes, and(eq(schema.serviceTypes.id, e.serviceTypeId), eq(schema.serviceTypes.workspaceId, e.workspaceId)))
    .leftJoin(
      schema.departments,
      and(eq(schema.departments.id, schema.serviceTypes.departmentId), eq(schema.departments.workspaceId, schema.serviceTypes.workspaceId)),
    );
};

// Every engagement of one client this actor may see, in a stable order:
// open work first, then by service name, so the list does not reshuffle
// when a package is renamed.
export async function listClientServices(db, actor, clientId) {
  if (!actor || !actor.workspaceId || !clientId) return [];
  const e = schema.serviceEngagements;
  const rows = await withCatalogue(db.select(engagementColumns()))
    .where(and(eq(e.workspaceId, actor.workspaceId), eq(e.clientId, String(clientId))))
    .orderBy(asc(schema.serviceTypes.name), asc(e.id));
  const visible = visibleServiceIds(actor, String(clientId), rows).map(decorate);
  const openFirst = (row) => (isOpenStatus(row.status) ? 0 : 1);
  return visible.sort((a, b) => openFirst(a) - openFirst(b) || a.serviceTypeName.localeCompare(b.serviceTypeName) || a.id.localeCompare(b.id));
}

// One engagement of one client, or null. The client id comes from the route
// and is part of the lookup, so an engagement that belongs to a different
// client of the same workspace answers exactly as one that does not exist.
export async function getClientService(db, actor, clientId, serviceEngagementId) {
  const services = await listClientServices(db, actor, clientId);
  return services.find((s) => s.id === String(serviceEngagementId || '')) || null;
}

// The same read without an actor, for a caller that has already been
// authorised against the engagement itself (a route that loaded the
// internal service resource through the engine).
export async function findServiceEngagement(db, workspaceId, clientId, serviceEngagementId) {
  const id = String(serviceEngagementId || '').trim();
  if (!workspaceId || !clientId || !id) return null;
  const e = schema.serviceEngagements;
  const rows = await withCatalogue(db.select(engagementColumns()))
    .where(and(eq(e.workspaceId, workspaceId), eq(e.clientId, String(clientId)), eq(e.id, id)))
    .limit(1);
  return rows[0] ? decorate(rows[0]) : null;
}

// The service types this client could still start something new with:
// active types with no open engagement already. The server refuses a
// duplicate whatever the browser sends; this only keeps the form from
// inviting one.
export async function availableServiceTypes(db, workspaceId, clientId, allTypes) {
  const e = schema.serviceEngagements;
  const open = await db
    .select({ serviceTypeId: e.serviceTypeId })
    .from(e)
    .where(and(eq(e.workspaceId, workspaceId), eq(e.clientId, String(clientId)), inArray(e.status, SERVICE_OPEN_STATUSES)));
  const taken = new Set(open.map((r) => r.serviceTypeId));
  return allTypes.filter((t) => t.active && !taken.has(t.id));
}

// ── the duplicate invariant ───────────────────────────────────────────────

// The database holds it: a partial unique index over (client_id,
// service_type_id) that applies only while the engagement is open
// (migration 0004). A read-then-insert would let two simultaneous requests
// both pass their check and both insert, so the check below is only for a
// useful message; the index is what makes the rule true.
const isOpenServiceConflict = (err) => {
  const message = String(err?.message || err);
  return /UNIQUE constraint failed/i.test(message) && /service_engagements/i.test(message);
};

const duplicateRefusal = (typeName) => ({
  ok: false,
  reason: 'duplicate_service',
  errors: {
    serviceTypeId: typeName
      ? `${typeName} is already running for this client. Complete or cancel it before adding it again.`
      : 'That service is already running for this client. Complete or cancel it before adding it again.',
  },
});

async function openEngagementOf(db, workspaceId, clientId, serviceTypeId, { excludeId = null } = {}) {
  const e = schema.serviceEngagements;
  const rows = await db
    .select({ id: e.id })
    .from(e)
    .where(and(
      eq(e.workspaceId, workspaceId),
      eq(e.clientId, String(clientId)),
      eq(e.serviceTypeId, serviceTypeId),
      inArray(e.status, SERVICE_OPEN_STATUSES),
    ));
  return rows.find((r) => r.id !== excludeId) || null;
}

// ── creating ──────────────────────────────────────────────────────────────

// Add one purchased service to one client.
//
// The new engagement is always Planned. The browser cannot choose a
// starting status: Onboarding and Active describe work that activation
// coordinates (A9), and letting a create request name them would let a
// client skip it. Nothing else happens either: no client field changes, no
// onboarding, no template, no invitation, no mail, no project, no action.
//
// The engagement and its event are one batch, so a failure leaves neither.
export async function createServiceEngagement(db, { workspaceId, clientId, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const errors = {};
  const type = await validateServiceType(db, workspaceId, input?.serviceTypeId);
  if (!type.ok) errors.serviceTypeId = type.message;
  const packageName = validatePackageName(input?.packageName);
  if (!packageName.ok) errors.packageName = packageName.message;
  const startDate = validateDate(input?.startDate, 'the start date');
  if (!startDate.ok) errors.startDate = startDate.message;
  const scopeNotes = validateScopeNotes(input?.scopeNotes);
  if (!scopeNotes.ok) errors.scopeNotes = scopeNotes.message;
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

  const existing = await openEngagementOf(db, workspaceId, clientId, type.value.id);
  if (existing) return duplicateRefusal(type.value.name);

  const iso = now.toISOString();
  const serviceEngagementId = newId();
  try {
    await db.batch([
      db.insert(schema.serviceEngagements).values({
        id: serviceEngagementId,
        workspaceId,
        clientId: String(clientId),
        serviceTypeId: type.value.id,
        packageName: packageName.value,
        status: 'planned',
        startDate: startDate.value,
        endDate: null,
        // Both are later phases and neither is ever taken from a request.
        approvalPreference: null,
        scopeNotes: scopeNotes.value,
        sourceTemplateVersionId: null,
        createdAt: iso,
        updatedAt: iso,
      }),
      db.insert(schema.activityEvents).values(activityValues({
        workspaceId,
        eventType: ACTIVITY.SERVICE_ENGAGEMENT_CREATED,
        subjectType: 'service_engagement',
        subjectId: serviceEngagementId,
        clientId: String(clientId),
        serviceEngagementId,
        actorMembershipId,
        actorUserId,
        // The service type's name is recorded so the history stays readable
        // if the catalogue entry is later renamed or deactivated.
        metadata: { serviceTypeName: type.value.name, packageName: packageName.value },
        occurredAt: iso,
      })),
    ]);
  } catch (err) {
    // The index refused it, which means another request won the race
    // between the check above and this insert. A calm answer, never the
    // database's own words.
    if (isOpenServiceConflict(err)) return duplicateRefusal(type.value.name);
    throw err;
  }
  return { ok: true, serviceEngagementId };
}

// ── updating ──────────────────────────────────────────────────────────────

const DETAIL_FIELDS = ['packageName', 'startDate', 'endDate', 'scopeNotes'];

export const SERVICE_DETAIL_LABELS = {
  packageName: 'Package',
  startDate: 'Start date',
  endDate: 'End date',
  scopeNotes: 'Scope notes',
};

// Change one engagement's details, its status, or both.
//
// Only the keys present in `input` are considered, and a value equal to
// what is stored is a no-op that records nothing. The service type itself is
// never editable: an engagement is the purchase of one service, and buying
// a different one is a different engagement.
//
// A status change is its own fact and its own event. It changes nothing on
// the client: not relationship status, not health, not dates. It also
// cannot re-open a terminal engagement into a conflict, because the same
// invariant applies to the new status; that comes back as the same calm
// refusal a duplicate create gets.
export async function updateServiceEngagement(db, { workspaceId, clientId, service, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  if (!service) return { ok: false, reason: 'not_found' };
  if (input && Object.prototype.hasOwnProperty.call(input, 'serviceTypeId')) {
    return { ok: false, reason: 'service_type_not_editable', errors: { serviceTypeId: 'A service engagement keeps the service it was bought for. Add a different service instead.' } };
  }

  const errors = {};
  const patch = {};
  const changes = {};
  const has = (key) => input && Object.prototype.hasOwnProperty.call(input, key);
  const apply = (key, result) => {
    if (!result.ok) {
      errors[key] = result.message;
      return;
    }
    if (result.value === service[key]) return;
    patch[key] = result.value;
    changes[key] = { from: service[key] ?? null, to: result.value };
  };

  if (has('packageName')) apply('packageName', validatePackageName(input.packageName));
  if (has('startDate')) apply('startDate', validateDate(input.startDate, 'the start date'));
  if (has('endDate')) apply('endDate', validateDate(input.endDate, 'the end date'));
  if (has('scopeNotes')) apply('scopeNotes', validateScopeNotes(input.scopeNotes));

  let statusChange = null;
  if (has('status')) {
    const status = validateServiceStatus(input.status);
    if (!status.ok) errors.status = status.message;
    else if (status.value !== service.status) {
      patch.status = status.value;
      statusChange = { from: service.status, to: status.value };
    }
  }

  const startFinal = 'startDate' in patch ? patch.startDate : service.startDate;
  const endFinal = 'endDate' in patch ? patch.endDate : service.endDate;
  if (!errors.startDate && !errors.endDate && startFinal && endFinal && endFinal < startFinal) {
    errors.endDate = 'The end date cannot be before the start date.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

  // Reopening a completed or cancelled engagement while another one of the
  // same service type is already running is the one lifecycle move the
  // invariant forbids. It is refused in words rather than as a constraint
  // failure, and the index below still has the last say.
  if (statusChange && isOpenStatus(statusChange.to) && !isOpenStatus(statusChange.from)) {
    const clash = await openEngagementOf(db, workspaceId, clientId, service.serviceTypeId, { excludeId: service.id });
    if (clash) return duplicateRefusal(service.serviceTypeName);
  }

  const detailChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => DETAIL_FIELDS.includes(key)));
  const changedDetails = Object.keys(detailChanges).length > 0;
  if (!changedDetails && !statusChange) return { ok: true, unchanged: true };

  const iso = now.toISOString();
  const event = (eventType, metadata) =>
    db.insert(schema.activityEvents).values(activityValues({
      workspaceId,
      eventType,
      subjectType: 'service_engagement',
      subjectId: service.id,
      clientId: String(clientId),
      serviceEngagementId: service.id,
      actorMembershipId,
      actorUserId,
      metadata: { serviceTypeName: service.serviceTypeName, ...metadata },
      occurredAt: iso,
    }));
  const writes = [
    db
      .update(schema.serviceEngagements)
      .set({ ...patch, updatedAt: iso })
      .where(and(
        eq(schema.serviceEngagements.workspaceId, workspaceId),
        eq(schema.serviceEngagements.clientId, String(clientId)),
        eq(schema.serviceEngagements.id, service.id),
      )),
  ];
  // Details and status are two distinct facts and each is worth its own
  // line of history. Neither is recorded twice, and neither is recorded
  // when nothing moved.
  if (changedDetails) writes.push(event(ACTIVITY.SERVICE_DETAILS_UPDATED, { fields: Object.keys(detailChanges) }));
  if (statusChange) writes.push(event(ACTIVITY.SERVICE_STATUS_CHANGED, statusChange));

  try {
    await db.batch(writes);
  } catch (err) {
    if (isOpenServiceConflict(err)) return duplicateRefusal(service.serviceTypeName);
    throw err;
  }
  return { ok: true, changed: { details: changedDetails ? Object.keys(detailChanges) : [], status: Boolean(statusChange) } };
}

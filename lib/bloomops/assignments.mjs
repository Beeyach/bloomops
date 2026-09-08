// Scoped team assignment (A7): who inside the agency works on a client, and
// who works on one of its individual services.
//
// The two rows mean different things, and the difference is the whole point
// of this file.
//
//   client_assignments   the whole client. A Team Member with this row
//                        reaches the client record and every service
//                        engagement under it, including ones added later.
//
//   service_assignments  exactly one engagement. A Team Member with only
//                        this row reaches that engagement and nothing else:
//                        not the client record, not the client's other
//                        engagements, not another client's engagement of the
//                        same service type.
//
// Nothing here interprets those rows. The A4 engine already does, in
// loadAssignedScope and canAccessService, and A7 deliberately did not touch
// it: this file writes the rows the engine reads, and the scope narrows or
// widens on the next request because the actor is loaded fresh every time.
//
// Department membership is not on that list. Belonging to Social organises
// a person; it grants no client and no service. A4 ignores
// department_memberships entirely and A7 keeps it that way.
//
// Ownership is not on that list either. clients.owner_membership_id is
// operational responsibility, established in A6 as explicitly not an
// authorization grant. Assigning somebody does not make them the owner,
// naming an owner writes no assignment row, and removing an assignment
// leaves the owner exactly as recorded.
//
// Assignments are also history. Somebody who was legitimately assigned and
// has since been suspended or removed keeps their row: the engine refuses
// them anyway (it requires an active membership), the screen says they are
// no longer active, and a manager decides whether to take the row away.
// Nothing here deletes a row because a membership changed.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, activityValues, activityForMutation } from './activity.mjs';
import { ROLE_LABELS } from './membership.mjs';
import { newId, trimmed } from './clients.mjs';

// ── vocabulary ────────────────────────────────────────────────────────────

// The two values the schema allows, and no more. The documents do not ask
// for exactly one lead, so nothing here enforces one: a client or a service
// may have several leads, or none.
export const ASSIGNMENT_ROLES = ['lead', 'member'];

export const ASSIGNMENT_ROLE_LABELS = {
  lead: 'Lead',
  member: 'Member',
};

export const assignmentRoleLabel = (role) => ASSIGNMENT_ROLE_LABELS[role] || role;

export function validateAssignmentRole(raw, { required = true } = {}) {
  const role = trimmed(raw);
  if (!role) return required ? { ok: false, message: 'Choose Lead or Member.' } : { ok: true, value: null };
  if (!ASSIGNMENT_ROLES.includes(role)) return { ok: false, message: 'Choose Lead or Member.' };
  return { ok: true, value: role };
}

// The roles that may be assigned to delivery work. A Client membership is
// never a candidate: assignment is internal delivery scope, and the portal
// relationship is client_contacts.user_id, which is A9/A10's.
const ASSIGNABLE_ROLES = ['owner', 'admin', 'project_manager', 'team_member'];

// ── candidates ────────────────────────────────────────────────────────────

// Who a NEW assignment may name: an active internal membership of this
// workspace. Never a Client membership, never a suspended or removed one,
// never a pending invitation (an invitation is not a membership at all),
// never a membership of another workspace, and never a bare user id.
export async function assignmentCandidates(db, workspaceId) {
  if (!workspaceId) return [];
  const m = schema.workspaceMemberships;
  const rows = await db
    .select({ id: m.id, role: m.role, name: schema.user.name, email: schema.user.email })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(m.workspaceId, workspaceId), eq(m.status, 'active'), inArray(m.role, ASSIGNABLE_ROLES)))
    .orderBy(asc(schema.user.name), asc(schema.user.email));
  return rows.map((r) => ({ membershipId: r.id, role: r.role, roleLabel: ROLE_LABELS[r.role] || r.role, name: r.name || r.email, email: r.email }));
}

// Is this membership id assignable right now? A membership from another
// workspace is indistinguishable from an id that never existed, so both come
// back the same way and neither says anything about the other workspace.
export async function validateAssignee(db, workspaceId, membershipId) {
  const id = trimmed(membershipId);
  if (!id) return { ok: false, message: 'Choose someone from the list.' };
  const candidates = await assignmentCandidates(db, workspaceId);
  const match = candidates.find((c) => c.membershipId === id);
  if (!match) return { ok: false, message: 'Choose someone from the list.' };
  return { ok: true, value: match };
}

// ── reading ───────────────────────────────────────────────────────────────

// Everyone assigned to the client as a whole. `active` says whether their
// membership still stands: a suspended or removed person keeps their row and
// their place in the list, marked, because the assignment is a record of who
// was put on this work.
export async function listClientAssignments(db, workspaceId, clientId) {
  if (!workspaceId || !clientId) return [];
  const a = schema.clientAssignments;
  const m = schema.workspaceMemberships;
  const rows = await db
    .select({
      id: a.id,
      membershipId: a.membershipId,
      assignmentRole: a.assignmentRole,
      createdAt: a.createdAt,
      role: m.role,
      status: m.status,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(a)
    .innerJoin(m, and(eq(m.id, a.membershipId), eq(m.workspaceId, a.workspaceId)))
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(a.workspaceId, workspaceId), eq(a.clientId, String(clientId))))
    .orderBy(asc(a.assignmentRole), asc(schema.user.name), asc(schema.user.email));
  return rows.map(describeAssignment);
}

// Everyone assigned to specific engagements, grouped by engagement id, so
// the Team tab can render one list per service with a single query.
export async function listServiceAssignments(db, workspaceId, serviceEngagementIds) {
  const ids = (serviceEngagementIds || []).map(String).filter(Boolean);
  const map = new Map(ids.map((id) => [id, []]));
  if (!workspaceId || ids.length === 0) return map;
  const a = schema.serviceAssignments;
  const m = schema.workspaceMemberships;
  const rows = await db
    .select({
      id: a.id,
      serviceEngagementId: a.serviceEngagementId,
      membershipId: a.membershipId,
      assignmentRole: a.assignmentRole,
      createdAt: a.createdAt,
      role: m.role,
      status: m.status,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(a)
    .innerJoin(m, and(eq(m.id, a.membershipId), eq(m.workspaceId, a.workspaceId)))
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(a.workspaceId, workspaceId), inArray(a.serviceEngagementId, ids)))
    .orderBy(asc(a.assignmentRole), asc(schema.user.name), asc(schema.user.email));
  for (const row of rows) {
    const list = map.get(row.serviceEngagementId);
    if (list) list.push(describeAssignment(row));
  }
  return map;
}

function describeAssignment(row) {
  return {
    id: row.id,
    membershipId: row.membershipId,
    serviceEngagementId: row.serviceEngagementId || null,
    assignmentRole: row.assignmentRole,
    assignmentRoleLabel: assignmentRoleLabel(row.assignmentRole),
    name: row.name || row.email,
    email: row.email,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    active: row.status === 'active',
    createdAt: row.createdAt,
  };
}

// ── the two shapes of assignment ──────────────────────────────────────────

// Client and service assignments are the same operation over two tables, so
// they are described once and the two exported sets of functions differ only
// in this configuration. Keeping one implementation is what makes the two
// behave identically: same candidate rule, same no-op semantics, same
// leak-safe not-found, same event shape.
const CLIENT_KIND = {
  table: () => schema.clientAssignments,
  parentColumn: () => schema.clientAssignments.clientId,
  // The physical names of the table and of the two columns its unique index
  // covers. They are what scopes duplicate detection below to this one
  // constraint, so nothing else a failing statement could raise is ever
  // mistaken for a re-assignment.
  tableName: 'client_assignments',
  parentColumnName: 'client_id',
  subjectType: 'client_assignment',
  added: 'CLIENT_ASSIGNMENT_ADDED',
  updated: 'CLIENT_ASSIGNMENT_UPDATED',
  removed: 'CLIENT_ASSIGNMENT_REMOVED',
};

const SERVICE_KIND = {
  table: () => schema.serviceAssignments,
  parentColumn: () => schema.serviceAssignments.serviceEngagementId,
  tableName: 'service_assignments',
  parentColumnName: 'service_engagement_id',
  subjectType: 'service_assignment',
  added: 'SERVICE_ASSIGNMENT_ADDED',
  updated: 'SERVICE_ASSIGNMENT_UPDATED',
  removed: 'SERVICE_ASSIGNMENT_REMOVED',
};

const parentValues = (kind, { clientId, serviceEngagementId }) =>
  kind === CLIENT_KIND ? { clientId: String(clientId) } : { serviceEngagementId: String(serviceEngagementId) };

const parentId = (kind, ctx) => (kind === CLIENT_KIND ? String(ctx.clientId) : String(ctx.serviceEngagementId));

function eventFor(kind, { workspaceId, ctx, assignmentId, eventType, metadata, actorMembershipId, actorUserId, iso }) {
  return {
    workspaceId,
    eventType,
    subjectType: kind.subjectType,
    subjectId: assignmentId,
    // Both kinds carry the client, so one client's Activity tab reads as one
    // story; only the service kind carries the engagement.
    clientId: String(ctx.clientId),
    serviceEngagementId: kind === SERVICE_KIND ? String(ctx.serviceEngagementId) : null,
    actorMembershipId,
    actorUserId,
    metadata,
    occurredAt: iso,
  };
}

// The name of the person and, for a service assignment, of the service are
// recorded on the event so the history stays readable after either is
// renamed, deactivated, or removed from the workspace.
const baseMetadata = (kind, ctx, person) => ({
  memberName: person.name,
  ...(kind === SERVICE_KIND && ctx.serviceTypeName ? { serviceTypeName: ctx.serviceTypeName } : {}),
});

async function findAssignment(db, kind, workspaceId, ctx, assignmentId) {
  const t = kind.table();
  const id = trimmed(assignmentId);
  if (!workspaceId || !id) return null;
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(kind.parentColumn(), parentId(kind, ctx)), eq(t.id, id)))
    .limit(1);
  return rows[0] || null;
}

// Did this failure come from the one unique index that says "this person is
// already on this client / this service"?
//
// Scoped deliberately tightly. The message must name a UNIQUE violation on
// THIS kind's physical table AND on both columns of that table's unique
// index. A foreign key failure, a CHECK failure, a unique violation on any
// other table (including anything the activity event in the same batch
// could raise), and an error of any other shape all fail this test and are
// re-thrown untouched, because swallowing them as a re-assignment would
// turn a real fault into a silent success.
//
// The text is read from the error and its cause chain, because the D1
// driver wraps the SQLite error rather than replacing it.
function isDuplicateAssignment(kind, err) {
  let node = err;
  const seen = new Set();
  while (node && !seen.has(node)) {
    seen.add(node);
    const message = String(node.message || node);
    if (
      /UNIQUE constraint failed/i.test(message) &&
      message.includes(`${kind.tableName}.${kind.parentColumnName}`) &&
      message.includes(`${kind.tableName}.membership_id`)
    ) {
      return true;
    }
    node = node.cause;
  }
  return false;
}

// The assignment this person already holds on this parent, or null. The
// workspace, the parent, and the membership are all in the WHERE clause, so
// this can only ever find the row the unique index just refused.
async function assignmentOf(db, kind, workspaceId, ctx, membershipId) {
  const t = kind.table();
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(kind.parentColumn(), parentId(kind, ctx)), eq(t.membershipId, membershipId)))
    .limit(1);
  return rows[0] || null;
}

// Assign somebody, or change the role they already hold.
//
// Re-assigning the same person is never a second row: the same role is a
// no-op that records nothing, a different role is a role change that records
// one update event. Those semantics have to hold under concurrent requests,
// not only sequential ones, and two things make that true.
//
// Atomicity. The assignment row and its ADDED event are one batch, with the
// id generated here so the event can name the row it describes before either
// exists. D1 applies a batch as one transaction, so a failure leaves neither:
// there is no state in which an assignment exists without the significant
// activity event that records it.
//
// Concurrency. The read below is the fast path and never the authority. Two
// requests can both read nothing before either writes, and then one of them
// loses the unique index. That loser does not fail: it re-reads the winning
// row by workspace, parent, and membership, and resolves through exactly the
// semantics above. The database has the last word, and the caller gets the
// same answer it would have got had the two requests arrived in order.
async function addAssignment(db, kind, { workspaceId, ctx, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const errors = {};
  const person = await validateAssignee(db, workspaceId, input?.membershipId);
  if (!person.ok) errors.membershipId = person.message;
  const role = validateAssignmentRole(input?.assignmentRole == null ? 'member' : input.assignmentRole);
  if (!role.ok) errors.assignmentRole = role.message;
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

  const t = kind.table();
  const iso = now.toISOString();
  const membershipId = person.value.membershipId;

  const resolveExisting = (assignment) => {
    if (assignment.assignmentRole === role.value) return { ok: true, unchanged: true, assignmentId: assignment.id };
    return changeAssignmentRole(db, kind, {
      workspaceId,
      ctx,
      assignment,
      person: person.value,
      role: role.value,
      actorMembershipId,
      actorUserId,
      iso,
    });
  };

  // Two attempts, not a loop without end. The second exists for the narrow
  // case where the row that won the race is gone again by the time it is
  // read back, which leaves creating it the right answer once more.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await assignmentOf(db, kind, workspaceId, ctx, membershipId);
    if (existing) return resolveExisting(existing);

    const assignmentId = newId();
    try {
      await db.batch([
        db.insert(t).values({
          id: assignmentId,
          workspaceId,
          ...parentValues(kind, ctx),
          membershipId,
          assignmentRole: role.value,
          createdAt: iso,
        }),
        db.insert(schema.activityEvents).values(activityValues(eventFor(kind, {
          workspaceId,
          ctx,
          assignmentId,
          eventType: ACTIVITY[kind.added],
          metadata: { ...baseMetadata(kind, ctx, person.value), assignmentRole: role.value },
          actorMembershipId,
          actorUserId,
          iso,
        }))),
      ]);
      return { ok: true, assignmentId, created: true };
    } catch (err) {
      // Anything that is not this table's own duplicate is a real fault.
      if (!isDuplicateAssignment(kind, err)) throw err;
      const winner = await assignmentOf(db, kind, workspaceId, ctx, membershipId);
      if (winner) return resolveExisting(winner);
      // The winner has already been removed again. Try once more.
    }
  }
  // Both attempts lost to a row that was gone by the time it was read. The
  // caller gets a calm answer rather than a constraint message; nothing was
  // written, and nothing was recorded.
  return { ok: false, reason: 'conflict', errors: { membershipId: 'That could not be saved just now. Try again.' } };
}

async function changeAssignmentRole(db, kind, { workspaceId, ctx, assignment, person, role, actorMembershipId, actorUserId, iso }) {
  const t = kind.table();
  const condition = and(eq(t.workspaceId, workspaceId), eq(kind.parentColumn(), parentId(kind, ctx)), eq(t.id, assignment.id), eq(t.assignmentRole, assignment.assignmentRole));
  const [, rows] = await db.batch([
    activityForMutation(db, t, condition, eventFor(kind, {
      workspaceId,
      ctx,
      assignmentId: assignment.id,
      eventType: ACTIVITY[kind.updated],
      metadata: { ...baseMetadata(kind, ctx, person), from: assignment.assignmentRole, to: role },
      actorMembershipId,
      actorUserId,
      iso,
    })),
    db.update(t).set({ assignmentRole: role }).where(condition).returning({ id: t.id }),
  ]);
  if (!rows.length) return { ok: false, reason: 'conflict' };
  return { ok: true, assignmentId: assignment.id, changed: { role: true } };
}

// Change the role of one existing assignment, named by its own id.
//
// An assignment id that belongs to another client, another service, or
// another workspace answers exactly as one that never existed. The person
// is not re-validated as a candidate: they were assignable when they were
// assigned, and someone whose membership was later suspended can still be
// corrected from Lead to Member without first being reinstated.
async function updateAssignment(db, kind, { workspaceId, ctx, assignmentId, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const assignment = await findAssignment(db, kind, workspaceId, ctx, assignmentId);
  if (!assignment) return { ok: false, reason: 'not_found' };
  const role = validateAssignmentRole(input?.assignmentRole);
  if (!role.ok) return { ok: false, reason: 'invalid', errors: { assignmentRole: role.message } };
  if (role.value === assignment.assignmentRole) return { ok: true, unchanged: true, assignmentId: assignment.id };
  const person = await describeMember(db, workspaceId, assignment.membershipId);
  return changeAssignmentRole(db, kind, {
    workspaceId,
    ctx,
    assignment,
    person,
    role: role.value,
    actorMembershipId,
    actorUserId,
    iso: now.toISOString(),
  });
}

// Take one assignment away.
//
// This narrows scope and nothing else. Removing a client assignment leaves
// every service assignment of the same person standing, so someone who had
// both keeps the one service and loses the client and its other services.
// Removing a service assignment leaves a client assignment standing, so
// someone who had both still reaches that service through the client. The
// engine works this out from the rows on the next request; nothing here
// cascades, and nothing here touches the client's owner.
async function removeAssignment(db, kind, { workspaceId, ctx, assignmentId, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const assignment = await findAssignment(db, kind, workspaceId, ctx, assignmentId);
  if (!assignment) return { ok: false, reason: 'not_found' };
  const person = await describeMember(db, workspaceId, assignment.membershipId);
  const t = kind.table();
  const iso = now.toISOString();
  const condition = and(eq(t.workspaceId, workspaceId), eq(kind.parentColumn(), parentId(kind, ctx)), eq(t.id, assignment.id), eq(t.assignmentRole, assignment.assignmentRole));
  const [, rows] = await db.batch([
    activityForMutation(db, t, condition, eventFor(kind, {
      workspaceId,
      ctx,
      assignmentId: assignment.id,
      eventType: ACTIVITY[kind.removed],
      metadata: { ...baseMetadata(kind, ctx, person), assignmentRole: assignment.assignmentRole },
      actorMembershipId,
      actorUserId,
      iso,
    })),
    db.delete(t).where(condition).returning({ id: t.id }),
  ]);
  if (!rows.length) return { ok: false, reason: 'conflict' };
  return { ok: true, removed: { membershipId: assignment.membershipId, name: person.name } };
}

// The display name for an event, for a membership that may no longer be
// active. Falls back to the address, and then to nothing rather than an id.
async function describeMember(db, workspaceId, membershipId) {
  const m = schema.workspaceMemberships;
  const rows = await db
    .select({ name: schema.user.name, email: schema.user.email })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(m.workspaceId, workspaceId), eq(m.id, membershipId)))
    .limit(1);
  const row = rows[0];
  return { membershipId, name: row ? row.name || row.email : null };
}

// ── the two public surfaces ───────────────────────────────────────────────

export const addClientAssignment = (db, { workspaceId, clientId, ...rest }) =>
  addAssignment(db, CLIENT_KIND, { workspaceId, ctx: { clientId }, ...rest });

export const updateClientAssignment = (db, { workspaceId, clientId, ...rest }) =>
  updateAssignment(db, CLIENT_KIND, { workspaceId, ctx: { clientId }, ...rest });

export const removeClientAssignment = (db, { workspaceId, clientId, ...rest }) =>
  removeAssignment(db, CLIENT_KIND, { workspaceId, ctx: { clientId }, ...rest });

export const addServiceAssignment = (db, { workspaceId, clientId, serviceEngagementId, serviceTypeName = null, ...rest }) =>
  addAssignment(db, SERVICE_KIND, { workspaceId, ctx: { clientId, serviceEngagementId, serviceTypeName }, ...rest });

export const updateServiceAssignment = (db, { workspaceId, clientId, serviceEngagementId, serviceTypeName = null, ...rest }) =>
  updateAssignment(db, SERVICE_KIND, { workspaceId, ctx: { clientId, serviceEngagementId, serviceTypeName }, ...rest });

export const removeServiceAssignment = (db, { workspaceId, clientId, serviceEngagementId, serviceTypeName = null, ...rest }) =>
  removeAssignment(db, SERVICE_KIND, { workspaceId, ctx: { clientId, serviceEngagementId, serviceTypeName }, ...rest });

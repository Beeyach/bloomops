// Reading a client's operational history, and saying it in words.
//
// activity_events is append-only: triggers from migration 0001 abort any
// UPDATE or DELETE of a row. A6 adds no history table of its own and edits
// nothing that was recorded; it writes new events through the one helper in
// lib/bloomops/activity.mjs and reads them back here.
//
// The stored row is machine-shaped: an upper-case event type, ids, and a
// small JSON metadata object. Nobody should be asked to read that. The
// functions here turn one row into a sentence a person can understand,
// with the actor's name where there is one and old and new values where
// they matter. Event codes, ids, and raw JSON never reach the screen.
//
// This is internal history. Nothing here is exposed to the client portal.
import { contentReadCondition } from './content-access.mjs';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { CLIENT_HEALTH_LABELS, DETAIL_LABELS } from './clients.mjs';
import { SERVICE_DETAIL_LABELS, serviceStatusLabel } from './services.mjs';
import { assignmentRoleLabel } from './assignments.mjs';
import { projectReadCondition } from './project-access.mjs';
import { milestoneReadCondition } from './milestone-access.mjs';
import { readableAction } from './action-access.mjs';
import { ACTION_STATUS_LABELS } from './action-values.mjs';
import { deliverableReadCondition } from './deliverable-access.mjs';
import { fileReadCondition } from './file-access.mjs';
import { DELIVERABLE_STATUS_LABELS } from './deliverable-values.mjs';
import { MILESTONE_STATUS_LABELS } from './milestone-values.mjs';
import { PROJECT_STATUS_LABELS, PROJECT_HEALTH_LABELS, PROJECT_DETAIL_LABELS } from './project-values.mjs';

const label = (map, key) => map[key] || key;

function parseMetadata(json) {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sentenceList(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function fieldList(fields) {
  return sentenceList(Object.keys(fields || {}).map((key) => label(DETAIL_LABELS, key).toLowerCase()));
}

// A7 events record which fields moved as a plain array of keys rather than
// the old and new values, because a package name or a scope note is the
// agency's own wording and history does not need a second copy of it.
function serviceFieldList(fields) {
  return sentenceList((Array.isArray(fields) ? fields : []).map((key) => label(SERVICE_DETAIL_LABELS, key).toLowerCase()));
}

// The service an event is about, by the name recorded when it happened, so
// a later rename does not rewrite what the history says. "this service" is
// the fallback, never an id.
const serviceName = (metadata) => metadata.serviceTypeName || null;
const memberName = (metadata) => metadata.memberName || null;

// One event as { title, detail }. `title` is what happened; `detail` is the
// specific, when there is one worth reading.
export function describeEvent(eventType, metadata = {}) {
  switch (eventType) {
    case 'CONTENT_CREATED': return { title: 'Content created', detail: metadata.contentTitle || null };
    case 'CONTENT_DETAILS_UPDATED': return { title: 'Content details updated', detail: metadata.contentTitle || null };
    case 'FILE_UPLOADED': return { title: 'File uploaded', detail: metadata.filename || null };
    case 'FILE_ARCHIVED': return { title: 'File archived', detail: metadata.filename || null };
    case 'FILE_VISIBILITY_CHANGED': return { title: 'File visibility changed', detail: metadata.filename || null };
    case 'DELIVERABLE_CREATED': return { title: 'Deliverable created', detail: metadata.deliverableTitle || null };
    case 'DELIVERABLE_DETAILS_UPDATED': return { title: 'Deliverable details updated', detail: metadata.deliverableTitle || null };
    case 'DELIVERABLE_STATUS_CHANGED': return { title: 'Deliverable status changed', detail: `${metadata.deliverableTitle || 'Deliverable'}: ${DELIVERABLE_STATUS_LABELS[metadata.from] || 'previous status'} → ${DELIVERABLE_STATUS_LABELS[metadata.to] || 'updated status'}.` };
    case 'ACTION_CREATED': return { title: 'Action created', detail: metadata.actionTitle || null };
    case 'ACTION_DETAILS_UPDATED': return { title: 'Action details updated', detail: metadata.actionTitle || null };
    case 'ACTION_ASSIGNEE_CHANGED': return { title: 'Action assignee changed', detail: metadata.actionTitle || null };
    case 'ACTION_STATUS_CHANGED': return { title: 'Action status changed', detail: `${metadata.actionTitle || 'Action'}: ${ACTION_STATUS_LABELS[metadata.from] || 'previous status'} → ${ACTION_STATUS_LABELS[metadata.to] || 'updated status'}.` };
    case 'ACTION_DEPENDENCY_ADDED': return { title: 'Action dependency added', detail: metadata.actionTitle || null };
    case 'ACTION_DEPENDENCY_REMOVED': return { title: 'Action dependency removed', detail: metadata.actionTitle || null };
    case 'MILESTONE_CREATED': return { title: 'Milestone created', detail: metadata.milestoneName || null };
    case 'MILESTONE_DETAILS_UPDATED': return { title: 'Milestone details updated', detail: metadata.milestoneName || null };
    case 'MILESTONE_STATUS_CHANGED': return { title: 'Milestone status changed', detail: `${metadata.milestoneName || 'Milestone'}: ${MILESTONE_STATUS_LABELS[metadata.from] || 'previous status'} → ${MILESTONE_STATUS_LABELS[metadata.to] || 'updated status'}.` };
    case 'MILESTONE_ORDER_CHANGED': return { title: 'Milestone order changed', detail: null };
    case 'PROJECT_CREATED': return { title: 'Project created', detail: metadata.projectName || null };
    case 'PROJECT_DETAILS_UPDATED': return { title: 'Project details updated', detail: `${metadata.projectName || 'Project'}: ${(metadata.fields || []).map((key) => PROJECT_DETAIL_LABELS[key] || 'details').join(', ')} changed.` };
    case 'PROJECT_OWNER_CHANGED': return { title: 'Project owner changed', detail: `${metadata.projectName || 'Project'}: ${metadata.assigned ? 'responsibility assigned' : 'owner cleared'}.` };
    case 'PROJECT_STATUS_CHANGED': return { title: 'Project status changed', detail: `${metadata.projectName || 'Project'}: ${PROJECT_STATUS_LABELS[metadata.from] || 'previous status'} → ${PROJECT_STATUS_LABELS[metadata.to] || 'updated status'}.` };
    case 'PROJECT_HEALTH_CHANGED': return { title: 'Project health changed', detail: `${metadata.projectName || 'Project'}: ${PROJECT_HEALTH_LABELS[metadata.from] || 'previous health'} → ${PROJECT_HEALTH_LABELS[metadata.to] || 'updated health'}.` };
    case 'PROJECT_ASSIGNMENT_ADDED': return { title: 'Project team member added', detail: `${metadata.memberName || 'A colleague'} was assigned to ${metadata.projectName || 'this project'} as ${assignmentRoleLabel(metadata.assignmentRole).toLowerCase()}.` };
    case 'PROJECT_ASSIGNMENT_UPDATED': return { title: 'Project team role changed', detail: `${metadata.memberName || 'A colleague'} is now ${assignmentRoleLabel(metadata.to).toLowerCase()} on ${metadata.projectName || 'this project'}.` };
    case 'PROJECT_ASSIGNMENT_REMOVED': return { title: 'Project team member removed', detail: `${metadata.memberName || 'A colleague'} was removed from ${metadata.projectName || 'this project'}.` };
    case 'CLIENT_ACTIVATED': return { title: 'Client activated', detail: 'The client moved from Draft to Onboarding.' };
    case 'ONBOARDING_STARTED': return { title: 'Onboarding created', detail: 'Requirements were generated from the purchased services.' };
    case 'ONBOARDING_COMPLETED': return { title: 'Onboarding completed', detail: 'Every required step is satisfied.' };
    case 'CLIENT_ONBOARDING_COMPLETED': return { title: 'Client became Active', detail: 'Onboarding is complete.' };
    case 'ONBOARDING_ITEM_SUBMITTED': return { title: 'Onboarding step submitted', detail: metadata.title || null };
    case 'ONBOARDING_ITEM_COMPLETED': return { title: 'Onboarding step completed', detail: metadata.title || null };
    case 'ONBOARDING_ITEM_VERIFIED': return { title: 'Onboarding step verified', detail: metadata.title || null };
    case 'ONBOARDING_ITEM_WAIVED': return { title: 'Onboarding step waived', detail: [metadata.title, metadata.reason].filter(Boolean).join(': ') };
    case 'ONBOARDING_ITEM_NOT_APPLICABLE': return { title: 'Onboarding step marked not applicable', detail: [metadata.title, metadata.reason].filter(Boolean).join(': ') };
    case 'CLIENT_INVITED': return { title: 'Portal invitation delivered', detail: null };
    case 'INVITATION_SENT': return { title: 'Invitation prepared', detail: null };
    case 'INVITATION_RESENT': return { title: 'Invitation renewed', detail: null };
    case 'CLIENT_CREATED':
      return { title: 'Client created', detail: null };
    case 'CLIENT_DETAILS_UPDATED': {
      const fields = fieldList(metadata.fields);
      return { title: 'Details updated', detail: fields ? `Changed ${fields}.` : null };
    }
    case 'CLIENT_HEALTH_CHANGED':
      return {
        title: 'Health changed',
        detail: metadata.from
          ? `From ${label(CLIENT_HEALTH_LABELS, metadata.from)} to ${label(CLIENT_HEALTH_LABELS, metadata.to)}.`
          : `Set to ${label(CLIENT_HEALTH_LABELS, metadata.to)}.`,
      };
    case 'CLIENT_OWNER_CHANGED': {
      if (metadata.toName && metadata.fromName) return { title: 'Owner changed', detail: `From ${metadata.fromName} to ${metadata.toName}.` };
      if (metadata.toName) return { title: 'Owner set', detail: `${metadata.toName} now owns this client.` };
      if (metadata.fromName) return { title: 'Owner removed', detail: `${metadata.fromName} no longer owns this client.` };
      return { title: 'Owner changed', detail: null };
    }
    case 'CLIENT_CONTACT_ADDED':
      return { title: 'Contact added', detail: metadata.name ? `${metadata.name} was added.` : null };
    case 'CLIENT_CONTACT_UPDATED': {
      const fields = (metadata.fields || []).map((f) => (f === 'title' ? 'job title' : f === 'email' ? 'email address' : f === 'phone' ? 'phone number' : 'name'));
      const what = fields.length === 0 ? '' : fields.length === 1 ? fields[0] : `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`;
      return { title: 'Contact updated', detail: metadata.name ? `${metadata.name}${what ? `: ${what} changed.` : '.'}` : null };
    }
    case 'CLIENT_CONTACT_REMOVED':
      return { title: 'Contact removed', detail: metadata.name ? `${metadata.name} was removed.` : null };
    case 'CLIENT_PRIMARY_CONTACT_CHANGED':
      return metadata.cleared
        ? { title: 'Primary contact cleared', detail: metadata.name ? `${metadata.name} is no longer the primary contact.` : null }
        : { title: 'Primary contact changed', detail: metadata.name ? `${metadata.name} is now the primary contact.` : null };

    // ── services (A7) ────────────────────────────────────────────────────
    case 'SERVICE_ENGAGEMENT_CREATED': {
      const name = serviceName(metadata);
      if (!name) return { title: 'Service added', detail: null };
      return { title: 'Service added', detail: metadata.packageName ? `${name} (${metadata.packageName}) was added.` : `${name} was added.` };
    }
    case 'SERVICE_DETAILS_UPDATED': {
      const name = serviceName(metadata);
      const fields = serviceFieldList(metadata.fields);
      if (!fields) return { title: 'Service updated', detail: name ? `${name} was updated.` : null };
      return { title: 'Service updated', detail: name ? `${name}: ${fields} changed.` : `Changed ${fields}.` };
    }
    case 'SERVICE_STATUS_CHANGED': {
      const name = serviceName(metadata) || 'This service';
      const to = serviceStatusLabel(metadata.to);
      return {
        title: 'Service status changed',
        detail: metadata.from ? `${name} changed from ${serviceStatusLabel(metadata.from)} to ${to}.` : `${name} is now ${to}.`,
      };
    }

    // ── team assignment (A7) ─────────────────────────────────────────────
    // Client-wide and service-specific assignment read differently on
    // purpose: they are different amounts of access, so a person skimming
    // the history can tell them apart without opening the Team tab.
    case 'CLIENT_ASSIGNMENT_ADDED': {
      const who = memberName(metadata);
      const role = assignmentRoleLabel(metadata.assignmentRole).toLowerCase();
      return { title: 'Client team member added', detail: who ? `${who} was assigned to this client as ${role}.` : null };
    }
    case 'CLIENT_ASSIGNMENT_UPDATED': {
      const who = memberName(metadata);
      if (!who || !metadata.to) return { title: 'Client team role changed', detail: null };
      return { title: 'Client team role changed', detail: `${who} is now ${assignmentRoleLabel(metadata.to).toLowerCase()} on this client.` };
    }
    case 'CLIENT_ASSIGNMENT_REMOVED': {
      const who = memberName(metadata);
      return { title: 'Client team member removed', detail: who ? `${who} was removed from this client.` : null };
    }
    case 'SERVICE_ASSIGNMENT_ADDED': {
      const who = memberName(metadata);
      const name = serviceName(metadata);
      if (!who) return { title: 'Service team member added', detail: null };
      const role = assignmentRoleLabel(metadata.assignmentRole).toLowerCase();
      return { title: 'Service team member added', detail: name ? `${who} was assigned to ${name} as ${role}.` : `${who} was assigned as ${role}.` };
    }
    case 'SERVICE_ASSIGNMENT_UPDATED': {
      const who = memberName(metadata);
      const name = serviceName(metadata);
      if (!who || !metadata.to) return { title: 'Service team role changed', detail: null };
      const role = assignmentRoleLabel(metadata.to).toLowerCase();
      return { title: 'Service team role changed', detail: name ? `${who} is now ${role} on ${name}.` : `${who} is now ${role}.` };
    }
    case 'SERVICE_ASSIGNMENT_REMOVED': {
      const who = memberName(metadata);
      const name = serviceName(metadata);
      if (!who) return { title: 'Service team member removed', detail: null };
      return { title: 'Service team member removed', detail: name ? `${who} was removed from ${name}.` : `${who} was removed from this service.` };
    }
    default:
      // A history that cannot render an event still shows that something
      // happened, in plain words and never as a code.
      return { title: 'Client updated', detail: null };
  }
}

// The history of one client, newest first, already in words.
//
// The caller must already have decided that this actor may see this client
// (the A4 engine, through an internal client resource). The workspace and
// the client id are both in the WHERE clause anyway, so another workspace's
// history is unreachable even with a foreign id in hand.
//
// Ordering falls back to the insert order (rowid) within one timestamp,
// because a single request can record two genuinely distinct facts in one
// batch at the same millisecond and they should read in the order they
// happened.
export async function clientActivity(db, workspaceId, clientId, { limit = 60, actor = null } = {}) {
  if (!workspaceId || !clientId) return [];
  const a = schema.activityEvents;
  const rows = await db
    .select({
      id: a.id,
      eventType: a.eventType,
      metadataJson: a.metadataJson,
      occurredAt: a.occurredAt,
      actorMembershipId: a.actorMembershipId,
      actorName: schema.user.name,
      actorEmail: schema.user.email,
    })
    .from(a)
    .leftJoin(schema.workspaceMemberships, and(eq(schema.workspaceMemberships.id, a.actorMembershipId), eq(schema.workspaceMemberships.workspaceId, a.workspaceId)))
    .leftJoin(schema.user, eq(schema.user.id, schema.workspaceMemberships.userId))
    .where(and(eq(a.workspaceId, workspaceId), eq(a.clientId, clientId),
      sql`(${a.subjectType} <> 'content' OR EXISTS (SELECT 1 FROM content_items WHERE content_items.id=${a.subjectId} AND content_items.workspace_id=${a.workspaceId} AND ${contentReadCondition(actor)}))`,
      sql`(${a.subjectType} <> 'project' OR EXISTS (SELECT 1 FROM projects WHERE projects.id=${a.subjectId} AND ${projectReadCondition(actor)}))`,
      sql`(${a.subjectType} <> 'milestone' OR EXISTS (SELECT 1 FROM milestones JOIN projects ON projects.id=milestones.project_id
        WHERE milestones.id=${a.subjectId} AND milestones.workspace_id=${a.workspaceId} AND ${milestoneReadCondition(actor)}))`,
      sql`(${a.subjectType} <> 'action' OR EXISTS (SELECT 1 FROM actions WHERE actions.id=${a.subjectId}
        AND actions.workspace_id=${a.workspaceId} AND ${readableAction(actor)}))`,
      sql`(${a.subjectType} <> 'deliverable' OR EXISTS (SELECT 1 FROM deliverables JOIN projects ON projects.id=deliverables.project_id
        WHERE deliverables.id=${a.subjectId} AND deliverables.workspace_id=${a.workspaceId} AND ${deliverableReadCondition(actor)}))`,
      sql`(${a.subjectType} <> 'file' OR EXISTS (SELECT 1 FROM assets WHERE assets.id=${a.subjectId} AND assets.workspace_id=${a.workspaceId} AND ${fileReadCondition(actor)}))`,
      // Item history follows item visibility too. A client assignment alone
      // does not reveal a restricted step's title or resolution rationale.
      ['owner', 'admin'].includes(actor?.role) && actor.workspaceId === workspaceId ? undefined : sql`(${a.subjectType} <> 'onboarding_item' OR EXISTS (
        SELECT 1 FROM onboarding_items i WHERE i.workspace_id=${workspaceId} AND i.id=${a.subjectId} AND i.visibility IN ('client','internal')
      ))`))
    .orderBy(desc(a.occurredAt), sql`"activity_events".rowid desc`)
    .limit(limit);
  return rows.map((row) => {
    const { title, detail } = describeEvent(row.eventType, parseMetadata(row.metadataJson));
    return {
      id: row.id,
      title,
      detail,
      actor: row.actorName || row.actorEmail || null,
      occurredAt: row.occurredAt,
    };
  });
}

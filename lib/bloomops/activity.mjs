// Append-only operational history. One helper so every writer records the
// same shape, and so metadata is always JSON the reader can rely on.
import { schema } from './db.mjs';

export const ACTIVITY = {
  WORKSPACE_CREATED: 'WORKSPACE_CREATED',
  MEMBERSHIP_CREATED: 'MEMBERSHIP_CREATED',
  MEMBERSHIP_ACTIVATED: 'MEMBERSHIP_ACTIVATED',
  MEMBERSHIP_SUSPENDED: 'MEMBERSHIP_SUSPENDED',
  MEMBERSHIP_REINSTATED: 'MEMBERSHIP_REINSTATED',
  MEMBERSHIP_REMOVED: 'MEMBERSHIP_REMOVED',
  INVITATION_SENT: 'INVITATION_SENT',
  INVITATION_RESENT: 'INVITATION_RESENT',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  CAPABILITY_GRANTED: 'CAPABILITY_GRANTED',
  CAPABILITY_REVOKED: 'CAPABILITY_REVOKED',
  // Clients (A6). One event per significant fact that changed: a validation
  // failure, a refused request, and a no-op write none of them record
  // anything, and one request never records the same fact twice.
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_DETAILS_UPDATED: 'CLIENT_DETAILS_UPDATED',
  CLIENT_OWNER_CHANGED: 'CLIENT_OWNER_CHANGED',
  CLIENT_HEALTH_CHANGED: 'CLIENT_HEALTH_CHANGED',
  CLIENT_CONTACT_ADDED: 'CLIENT_CONTACT_ADDED',
  CLIENT_CONTACT_UPDATED: 'CLIENT_CONTACT_UPDATED',
  CLIENT_CONTACT_REMOVED: 'CLIENT_CONTACT_REMOVED',
  CLIENT_PRIMARY_CONTACT_CHANGED: 'CLIENT_PRIMARY_CONTACT_CHANGED',
  // Services and scoped team assignment (A7). Same rules: one event per
  // fact that actually changed, none on a refusal, none on a no-op, and
  // never the same fact twice. A service event carries both the client and
  // the engagement, so one client's history reads as one story.
  SERVICE_ENGAGEMENT_CREATED: 'SERVICE_ENGAGEMENT_CREATED',
  SERVICE_DETAILS_UPDATED: 'SERVICE_DETAILS_UPDATED',
  SERVICE_STATUS_CHANGED: 'SERVICE_STATUS_CHANGED',
  CLIENT_ASSIGNMENT_ADDED: 'CLIENT_ASSIGNMENT_ADDED',
  CLIENT_ASSIGNMENT_UPDATED: 'CLIENT_ASSIGNMENT_UPDATED',
  CLIENT_ASSIGNMENT_REMOVED: 'CLIENT_ASSIGNMENT_REMOVED',
  SERVICE_ASSIGNMENT_ADDED: 'SERVICE_ASSIGNMENT_ADDED',
  SERVICE_ASSIGNMENT_UPDATED: 'SERVICE_ASSIGNMENT_UPDATED',
  SERVICE_ASSIGNMENT_REMOVED: 'SERVICE_ASSIGNMENT_REMOVED',
};

// The row an event becomes, without writing it. Callers that must record an
// event in the same atomic write as the change it describes (client
// creation, say) put `db.insert(schema.activityEvents).values(activityValues(...))`
// into their batch instead of calling recordActivity afterwards.
export function activityValues({ workspaceId, eventType, subjectType, subjectId, actorMembershipId = null, actorUserId = null, clientId = null, serviceEngagementId = null, metadata = null, occurredAt = null }) {
  if (!ACTIVITY[eventType]) throw new Error(`Unknown activity event type ${eventType}`);
  const values = {
    workspaceId,
    eventType,
    subjectType,
    subjectId,
    actorMembershipId,
    actorUserId,
    clientId,
    serviceEngagementId,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
  };
  if (occurredAt) values.occurredAt = occurredAt;
  return values;
}

export async function recordActivity(db, event) {
  await db.insert(schema.activityEvents).values(activityValues(event));
}

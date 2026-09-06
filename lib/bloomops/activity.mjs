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
};

export async function recordActivity(db, { workspaceId, eventType, subjectType, subjectId, actorMembershipId = null, actorUserId = null, clientId = null, metadata = null, occurredAt = null }) {
  if (!ACTIVITY[eventType]) throw new Error(`Unknown activity event type ${eventType}`);
  const values = {
    workspaceId,
    eventType,
    subjectType,
    subjectId,
    actorMembershipId,
    actorUserId,
    clientId,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
  };
  if (occurredAt) values.occurredAt = occurredAt;
  await db.insert(schema.activityEvents).values(values);
}

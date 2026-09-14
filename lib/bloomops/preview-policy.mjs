import { sql } from 'drizzle-orm';

// Server-owned, request-local authority. Symbols survive actor spreads but
// cannot be supplied in JSON, cookies or query parameters. No session changes.
const PREVIEW = Symbol('client-preview');
export const previewContext = actor => actor?.[PREVIEW] || null;
export function attachPreview(actor, context) {
  return { ...actor, scope: { kind: 'contact', clientIds: new Set([context.clientId]) },
    [PREVIEW]: Object.freeze({ ...context }) };
}
export function previewClientCondition(actor, clientId) {
  const context = previewContext(actor);
  return context ? sql`${clientId} = ${context.clientId}` : sql`1`;
}
export function previewViewerCondition(viewer, clientId) {
  if (!viewer || viewer.status !== 'active') return sql`0`;
  return sql`EXISTS (SELECT 1 FROM workspace_memberships staff JOIN workspaces ws ON ws.id=staff.workspace_id
    JOIN bloomops_clients client ON client.workspace_id=ws.id AND client.id=${clientId}
    WHERE ws.id=${viewer.workspaceId} AND ws.status='active' AND staff.id=${viewer.membershipId}
      AND staff.user_id=${viewer.userId} AND staff.role=${viewer.role} AND staff.status='active'
      AND (staff.role IN ('owner','admin','project_manager') OR (staff.role='team_member'
        AND EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=ws.id
          AND ca.client_id=client.id AND ca.membership_id=staff.id))))`;
}
export function previewLiveCondition(actor) {
  const context = previewContext(actor);
  if (!context) return sql`1`;
  const { viewer, clientId, contactId } = context;
  return sql`(${previewViewerCondition(viewer, clientId)} AND EXISTS (
    SELECT 1 FROM client_contacts contact
    JOIN workspace_memberships recipient ON recipient.workspace_id=contact.workspace_id AND recipient.user_id=contact.user_id
    WHERE contact.workspace_id=${actor.workspaceId} AND contact.client_id=${clientId} AND contact.id=${contactId}
      AND recipient.id=${actor.membershipId} AND recipient.user_id=${actor.userId}
      AND recipient.role='client' AND recipient.status='active'))`;
}

const READS = new Set(['client.view', 'onboarding.view', 'service.view', 'project.view',
  'milestone.view', 'deliverable.view', 'file.view', 'portal.content.list',
  'portal.content.view', 'approval.view', 'recording.view', 'pages.shared']);
export const previewAllows = (actor, action) => !previewContext(actor) || READS.has(action);

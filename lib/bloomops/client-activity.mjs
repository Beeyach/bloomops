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
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { CLIENT_HEALTH_LABELS, DETAIL_LABELS } from './clients.mjs';

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

function fieldList(fields) {
  const names = Object.keys(fields || {}).map((key) => label(DETAIL_LABELS, key).toLowerCase());
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// One event as { title, detail }. `title` is what happened; `detail` is the
// specific, when there is one worth reading.
export function describeEvent(eventType, metadata = {}) {
  switch (eventType) {
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
export async function clientActivity(db, workspaceId, clientId, { limit = 60 } = {}) {
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
    .where(and(eq(a.workspaceId, workspaceId), eq(a.clientId, clientId)))
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

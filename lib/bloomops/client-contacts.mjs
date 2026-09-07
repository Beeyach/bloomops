// Client contacts (A6): the people at a client the agency actually talks to.
//
// A client may have any number of contacts and at most one primary. The
// database holds that last part (a partial unique index on client_id where
// is_primary = 1, migration 0003), so it is true whatever order a caller
// writes in and whatever two concurrent requests do. The functions here
// write the primary switch as one batch, clearing the old primary and
// setting the new one together, so the index is never momentarily violated
// and a failure leaves the client with the primary it started with.
//
// The portal identity link
//
// client_contacts.user_id is the durable relationship between a contact and
// a person who can sign in to the client portal. A4 reads it and nothing
// else to decide which client a Client membership may see. A9 and A10 own
// its whole lifecycle: inviting a contact, accepting, linking, and one day
// unlinking. A6 therefore:
//
//   - never writes user_id, on create or on update
//   - never accepts it from a request, at any nesting depth
//   - never infers it from a matching email address, an existing identity,
//     or invitation history
//   - refuses to delete a linked contact, and refuses to take a linked
//     contact's address away, because either would quietly revoke a real
//     person's standing relationship with the agency through a screen that
//     is not about portal access at all
//
// Changing a linked contact's name, title, phone, address, or primary
// marker is ordinary editing and is allowed: none of it touches the link.
import { and, asc, eq, ne } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, activityValues } from './activity.mjs';
import { LIMITS, newId, validateContactName, validateEmail, validateOptionalText } from './clients.mjs';

// Every contact of one client, primary first, then by name.
export async function listContacts(db, workspaceId, clientId) {
  const c = schema.clientContacts;
  const rows = await db
    .select({ id: c.id, name: c.name, email: c.email, phone: c.phone, title: c.title, isPrimary: c.isPrimary, userId: c.userId, createdAt: c.createdAt })
    .from(c)
    .where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId)))
    .orderBy(asc(c.name), asc(c.id));
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      title: r.title,
      isPrimary: Boolean(r.isPrimary),
      // Whether a contact can sign in to the portal is a fact the internal
      // screen may show. The user id itself is not, and never leaves here.
      linked: Boolean(r.userId),
      createdAt: r.createdAt,
    }))
    .sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));
}

// One contact of one named client. The client id is part of the lookup, so
// a contact id belonging to another client of the same workspace comes back
// null exactly as an unknown id does, and a route addressed at client A can
// never reach client B's contact.
async function findContact(db, workspaceId, clientId, contactId) {
  const c = schema.clientContacts;
  const rows = await db
    .select()
    .from(c)
    .where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId), eq(c.id, String(contactId || ''))))
    .limit(1);
  return rows[0] || null;
}

const isEmailConflict = (err) => /UNIQUE constraint failed/i.test(String(err?.message || err)) && /email/i.test(String(err?.message || err));

const DUPLICATE_EMAIL = 'Another contact for this client already uses that address.';

function validateContactInput(input, { requireName = true } = {}) {
  const errors = {};
  const values = {};
  const has = (key) => input && Object.prototype.hasOwnProperty.call(input, key);

  if (requireName || has('name')) {
    const name = validateContactName(input?.name);
    if (!name.ok) errors.name = name.message;
    else values.name = name.value;
  }
  if (requireName || has('email')) {
    const email = validateEmail(input?.email);
    if (!email.ok) errors.email = email.message;
    else values.email = email.value;
  }
  if (requireName || has('phone')) {
    const phone = validateOptionalText(input?.phone, LIMITS.contactPhone, 'the phone number');
    if (!phone.ok) errors.phone = phone.message;
    else values.phone = phone.value;
  }
  if (requireName || has('title')) {
    const title = validateOptionalText(input?.title, LIMITS.contactTitle, 'the job title');
    if (!title.ok) errors.title = title.message;
    else values.title = title.value;
  }
  return { errors, values };
}

// The writes that make `contactId` the one primary contact of `clientId`,
// as one batch: every other primary is cleared in the same statement that
// the new one is set, so the unique index sees a single primary at commit
// and no intermediate state can be observed or left behind.
function primarySwitchWrites(db, workspaceId, clientId, contactId, iso) {
  const c = schema.clientContacts;
  return [
    db
      .update(c)
      .set({ isPrimary: false, updatedAt: iso })
      .where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId), eq(c.isPrimary, true), ne(c.id, contactId))),
    db
      .update(c)
      .set({ isPrimary: true, updatedAt: iso })
      .where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId), eq(c.id, contactId))),
  ];
}

function contactEvent(db, { workspaceId, clientId, contact, eventType, actorMembershipId, actorUserId, metadata, occurredAt }) {
  return db.insert(schema.activityEvents).values(activityValues({
    workspaceId,
    eventType,
    subjectType: 'client_contact',
    subjectId: contact.id,
    clientId,
    actorMembershipId,
    actorUserId,
    // Enough to render a useful history line and no more: a name, and what
    // changed. Never the whole request body, and never a copy of every
    // address the contact has ever had.
    metadata,
    occurredAt,
  }));
}

// Add a contact. A new contact may be made primary at the same time, which
// clears whichever contact held it. user_id is not written and cannot be
// requested.
export async function addContact(db, { workspaceId, clientId, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const { errors, values } = validateContactInput(input);
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

  const iso = now.toISOString();
  const contactId = newId();
  const makePrimary = input?.isPrimary === true || input?.isPrimary === 'true';
  const contact = { id: contactId, name: values.name };
  const writes = [
    db.insert(schema.clientContacts).values({
      id: contactId,
      workspaceId,
      clientId,
      name: values.name,
      email: values.email,
      phone: values.phone,
      title: values.title,
      userId: null,
      isPrimary: false,
      createdAt: iso,
      updatedAt: iso,
    }),
    contactEvent(db, { workspaceId, clientId, contact, eventType: ACTIVITY.CLIENT_CONTACT_ADDED, actorMembershipId, actorUserId, metadata: { name: values.name }, occurredAt: iso }),
  ];
  if (makePrimary) {
    writes.push(...primarySwitchWrites(db, workspaceId, clientId, contactId, iso));
    writes.push(contactEvent(db, { workspaceId, clientId, contact, eventType: ACTIVITY.CLIENT_PRIMARY_CONTACT_CHANGED, actorMembershipId, actorUserId, metadata: { name: values.name }, occurredAt: iso }));
  }
  try {
    await db.batch(writes);
  } catch (err) {
    if (isEmailConflict(err)) return { ok: false, reason: 'duplicate_email', errors: { email: DUPLICATE_EMAIL } };
    throw err;
  }
  return { ok: true, contactId };
}

// Edit one contact, and optionally move the primary marker.
//
// Only keys present in `input` are considered. A value equal to what is
// stored records nothing. `isPrimary` is a separate fact from the contact's
// details, so a request that renames a contact and makes them primary
// records two events, and a request that does neither records none.
export async function updateContact(db, { workspaceId, clientId, contactId, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const existing = await findContact(db, workspaceId, clientId, contactId);
  if (!existing) return { ok: false, reason: 'not_found' };

  const { errors, values } = validateContactInput(input, { requireName: false });
  const has = (key) => input && Object.prototype.hasOwnProperty.call(input, key);

  // Taking a linked contact's address away would leave a person who can
  // sign in to the portal with no way for the agency to reach them, from a
  // screen that says nothing about portal access. A9/A10 own that.
  if (!errors.email && has('email') && existing.userId && values.email === null && existing.email) {
    errors.email = 'This contact can sign in to the client portal, so their email address cannot be removed.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

  const patch = {};
  const changed = [];
  for (const key of ['name', 'email', 'phone', 'title']) {
    if (!has(key)) continue;
    if (values[key] === existing[key]) continue;
    patch[key] = values[key];
    changed.push(key);
  }

  let primaryChange = null;
  if (has('isPrimary')) {
    const wanted = input.isPrimary === true || input.isPrimary === 'true';
    if (wanted !== Boolean(existing.isPrimary)) primaryChange = wanted;
  }

  if (changed.length === 0 && primaryChange === null) return { ok: true, unchanged: true };

  const iso = now.toISOString();
  const c = schema.clientContacts;
  const contact = { id: existing.id, name: patch.name ?? existing.name };
  const writes = [];
  if (changed.length > 0) {
    writes.push(
      db
        .update(c)
        .set({ ...patch, updatedAt: iso })
        .where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId), eq(c.id, existing.id))),
    );
    writes.push(contactEvent(db, { workspaceId, clientId, contact, eventType: ACTIVITY.CLIENT_CONTACT_UPDATED, actorMembershipId, actorUserId, metadata: { name: contact.name, fields: changed }, occurredAt: iso }));
  }
  if (primaryChange === true) {
    writes.push(...primarySwitchWrites(db, workspaceId, clientId, existing.id, iso));
    writes.push(contactEvent(db, { workspaceId, clientId, contact, eventType: ACTIVITY.CLIENT_PRIMARY_CONTACT_CHANGED, actorMembershipId, actorUserId, metadata: { name: contact.name }, occurredAt: iso }));
  } else if (primaryChange === false) {
    writes.push(
      db
        .update(c)
        .set({ isPrimary: false, updatedAt: iso })
        .where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId), eq(c.id, existing.id))),
    );
    // A client is allowed to have no primary contact. Nothing is promoted
    // in its place: who speaks for the client is a decision, not a default.
    writes.push(contactEvent(db, { workspaceId, clientId, contact, eventType: ACTIVITY.CLIENT_PRIMARY_CONTACT_CHANGED, actorMembershipId, actorUserId, metadata: { name: contact.name, cleared: true }, occurredAt: iso }));
  }
  try {
    await db.batch(writes);
  } catch (err) {
    if (isEmailConflict(err)) return { ok: false, reason: 'duplicate_email', errors: { email: DUPLICATE_EMAIL } };
    throw err;
  }
  return { ok: true, changed, primary: primaryChange };
}

// Remove a contact. A contact who can sign in to the client portal is
// refused: deleting the row would revoke a real person's access to their
// own portal from a screen about the agency's address book. A9/A10 own
// ending a portal relationship deliberately.
export async function removeContact(db, { workspaceId, clientId, contactId, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const existing = await findContact(db, workspaceId, clientId, contactId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.userId) return { ok: false, reason: 'linked' };

  const iso = now.toISOString();
  const c = schema.clientContacts;
  try {
    await db.batch([
      db.delete(c).where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId), eq(c.id, existing.id))),
      contactEvent(db, {
        workspaceId,
        clientId,
        contact: existing,
        eventType: ACTIVITY.CLIENT_CONTACT_REMOVED,
        actorMembershipId,
        actorUserId,
        metadata: { name: existing.name, wasPrimary: Boolean(existing.isPrimary) },
        occurredAt: iso,
      }),
    ]);
  } catch (error) {
    for (let e = error; e; e = e.cause) {
      if (/FOREIGN KEY constraint failed/.test(String(e.message))) return { ok: false, reason: 'invited_contact' };
    }
    throw error;
  }
  return { ok: true, wasPrimary: Boolean(existing.isPrimary) };
}

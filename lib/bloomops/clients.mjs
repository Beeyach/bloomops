// The Clients domain (A6): the first real BloomOps business domain.
//
// Everything a client record is, and every rule about changing one, lives
// here. Route handlers authenticate, authorise, parse, call one function
// below, and map the result to a response; React components render what
// these functions return. No business rule is written twice.
//
// What A6 owns
//   the client record's identity (name, company, website, timezone, dates)
//   the internal owner
//   health
//   the client list and its lifecycle filters
//   client contacts, including which one is primary
//   the operational activity every significant change records
//
// What A6 deliberately does not own
//   lifecycle transitions. A new client is always Draft, and nothing here
//   moves one out of Draft or anywhere else. The canonical path out of
//   Draft is the A9 activation transaction (validate, generate onboarding,
//   move to Onboarding, prepare portal access, invite, record activity),
//   and a plain field edit that set relationship_status would bypass all of
//   it. Paused, Completed, and Ended describe an engagement that A7 has not
//   built yet and the canonical documents give no transition rules for, so
//   A6 shows lifecycle and never writes it. updateClient refuses the field
//   outright rather than ignoring it, so a caller reaching for it learns.
//   See docs/BUILD_STATE.md.
//
//   the portal identity link. client_contacts.user_id is the durable
//   relationship between a contact and a person who can sign in to the
//   portal, and A9/A10 own its whole lifecycle. Nothing in A6 sets it,
//   clears it, infers it from a matching address, or lets a request name
//   it. See lib/bloomops/client-contacts.mjs.
//
//   assignments. client_assignments is A7's. owner_membership_id is
//   operational responsibility, not an authorization grant: naming someone
//   the owner of a client does not widen what the A4 engine lets them
//   reach, and setting an owner writes no assignment row.
//
// Every read is scoped through the actor the A4 engine loaded, and every
// write names the workspace in its WHERE clause, so nothing here can see or
// touch another workspace's rows even when handed a foreign id.
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, activityValues } from './activity.mjs';
import { ROLE_LABELS } from './membership.mjs';

// ── vocabulary ────────────────────────────────────────────────────────────

export const CLIENT_STATUSES = schema.CLIENT_RELATIONSHIP_STATUSES;
export const CLIENT_HEALTHS = schema.CLIENT_HEALTHS;

export const CLIENT_STATUS_LABELS = {
  draft: 'Draft',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  ended: 'Ended',
};

export const CLIENT_HEALTH_LABELS = {
  on_track: 'On Track',
  needs_attention: 'Needs Attention',
  at_risk: 'At Risk',
};

// Status and health are separate facts about a client and are presented as
// separate facts. Neither tone table borrows from the other.
export const CLIENT_STATUS_TONE = {
  draft: ['neutral', 'dot'],
  onboarding: ['info', 'clock'],
  active: ['success', 'check'],
  paused: ['warning', 'clock'],
  completed: ['neutral', 'check'],
  ended: ['neutral', 'dash'],
};

export const CLIENT_HEALTH_TONE = {
  on_track: ['success', 'check'],
  needs_attention: ['warning', 'clock'],
  at_risk: ['error', 'cross'],
};

export const clientStatusLabel = (status) => CLIENT_STATUS_LABELS[status] || status;
export const clientHealthLabel = (health) => CLIENT_HEALTH_LABELS[health] || health;

// The lifecycle filters the list offers, in lifecycle order with All first.
export const CLIENT_FILTERS = [
  { key: 'all', label: 'All', status: null },
  ...CLIENT_STATUSES.map((status) => ({ key: status, label: CLIENT_STATUS_LABELS[status], status })),
];

export function isClientFilter(key) {
  return CLIENT_FILTERS.some((f) => f.key === key);
}

// A filter narrows what the actor already reaches. It never widens it: the
// scope clause is built from the actor and the filter only adds to the
// WHERE, so an unknown or invented value falls back to All and still sees
// nothing extra.
export function normalizeFilter(key) {
  return isClientFilter(key) ? key : 'all';
}

// ── field limits and validation ───────────────────────────────────────────

export const LIMITS = {
  name: 120,
  company: 120,
  website: 300,
  timezone: 64,
  contactName: 120,
  contactEmail: 254,
  contactPhone: 40,
  contactTitle: 120,
};

const EMAIL_SHAPE = /^[^\s@'"<>()[\],;:\\]+@[^\s@'"<>()[\],;:\\]+\.[^\s@'"<>()[\],;:\\]+$/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function trimmed(value, max) {
  if (value == null) return '';
  const text = String(value).trim();
  return max ? text.slice(0, max + 1) : text;
}

// A client name: present, and short enough to render in a row. Truncating
// silently would lose what the person typed, so an over-long value is an
// error they can see and fix.
export function validateName(raw) {
  const name = trimmed(raw);
  if (!name) return { ok: false, message: 'Enter the client or company name.' };
  if (name.length > LIMITS.name) return { ok: false, message: `Use ${LIMITS.name} characters or fewer for the name.` };
  return { ok: true, value: name };
}

export function validateContactName(raw) {
  const name = trimmed(raw);
  if (!name) return { ok: false, message: 'Enter the contact’s name.' };
  if (name.length > LIMITS.contactName) return { ok: false, message: `Use ${LIMITS.contactName} characters or fewer for the name.` };
  return { ok: true, value: name };
}

// One canonical spelling per address, the same rule membership uses, so a
// contact address and an identity address always agree.
export function validateEmail(raw, { required = false } = {}) {
  const email = trimmed(raw).toLowerCase();
  if (!email) return required ? { ok: false, message: 'Enter an email address, like name@example.com.' } : { ok: true, value: null };
  if (email.length > LIMITS.contactEmail || !EMAIL_SHAPE.test(email)) return { ok: false, message: 'Enter an email address, like name@example.com.' };
  return { ok: true, value: email };
}

export function validateOptionalText(raw, max, label) {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  if (text.length > max) return { ok: false, message: `Use ${max} characters or fewer for ${label}.` };
  return { ok: true, value: text };
}

// A website is stored as an absolute http(s) URL. A person types
// "example.com"; that is a website, so it is completed rather than
// refused. Anything that is not a web address (a mailto:, a javascript:,
// a bare word with no dot) is refused, and nothing unparsed is ever
// rendered into an href.
export function validateWebsite(raw) {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  if (text.length > LIMITS.website) return { ok: false, message: `Use ${LIMITS.website} characters or fewer for the website.` };
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: 'Enter a website address, like example.com.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, message: 'Enter a website address, like example.com.' };
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return { ok: false, message: 'Enter a website address, like example.com.' };
  const value = url.toString().replace(/\/$/, '');
  if (value.length > LIMITS.website) return { ok: false, message: `Use ${LIMITS.website} characters or fewer for the website.` };
  return { ok: true, value };
}

// A real IANA zone or nothing. Intl is the authority the runtime already
// carries, so the list never goes stale in the repository.
export function isTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateTimezone(raw) {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  if (text.length > LIMITS.timezone || !text.includes('/') || !isTimezone(text)) {
    return { ok: false, message: 'Choose a time zone from the list.' };
  }
  return { ok: true, value: text };
}

// Dates on a client are calendar dates, not moments: a start date is the
// same day wherever it is read.
export function validateDate(raw, label) {
  const text = trimmed(raw);
  if (!text) return { ok: true, value: null };
  if (!DATE_SHAPE.test(text)) return { ok: false, message: `Enter ${label} as a date.` };
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, message: `Enter ${label} as a real date.` };
  }
  return { ok: true, value: text };
}

export function validateHealth(raw) {
  const health = trimmed(raw);
  if (!CLIENT_HEALTHS.includes(health)) return { ok: false, message: 'Choose On Track, Needs Attention, or At Risk.' };
  return { ok: true, value: health };
}

// ── the time zones offered ────────────────────────────────────────────────

// The picker offers what the runtime supports where it can list them, and a
// small useful set where it cannot, so a form never renders an empty
// select. A typed value is validated against Intl either way, so the list
// is a convenience and never the rule.
const FALLBACK_TIMEZONES = [
  'Pacific/Auckland', 'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth',
  'Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Dubai',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'Europe/Warsaw', 'Europe/Athens',
  'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Mexico_City',
  'America/New_York', 'America/Toronto', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Vancouver',
  'Pacific/Honolulu', 'UTC',
];

export function timezoneOptions() {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : null;
  const list = Array.isArray(supported) && supported.length > 0 ? supported.filter((z) => z.includes('/')) : FALLBACK_TIMEZONES;
  return [...new Set(list)].sort();
}

// ── slug ──────────────────────────────────────────────────────────────────

// Slugs are generated from the name and never asked for. They are unique
// inside one workspace only: two agencies may both have a client called
// James, and one agency may have two clients called James, which gets the
// second one `james-2`.
export function slugify(name) {
  const slug = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'client';
}

const randomSuffix = () => Math.random().toString(36).slice(2, 7);

// Candidate slugs to try in order. The first is the plain slug; the next
// few number it from what is already taken; the last few are random, so
// two simultaneous requests for the same name cannot livelock on the same
// candidate. Nothing here assumes a candidate is still free when it is
// used: the unique index decides, and createClient retries on its refusal.
async function slugCandidates(db, workspaceId, name) {
  const base = slugify(name);
  const existing = await db
    .select({ slug: schema.clients.slug })
    .from(schema.clients)
    .where(and(eq(schema.clients.workspaceId, workspaceId), or(eq(schema.clients.slug, base), sql`${schema.clients.slug} LIKE ${`${base}-%`}`)));
  const taken = new Set(existing.map((r) => r.slug));
  const candidates = [];
  if (!taken.has(base)) candidates.push(base);
  for (let n = 2; candidates.length < 3 && n < 200; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) candidates.push(candidate);
  }
  while (candidates.length < 6) candidates.push(`${base}-${randomSuffix()}`);
  return candidates;
}

const isSlugConflict = (err) => /UNIQUE constraint failed/i.test(String(err?.message || err)) && /slug/i.test(String(err?.message || err));

// ── ids ───────────────────────────────────────────────────────────────────

// The schema defaults ids in the database, but an atomic create has to know
// the client's id before the contact row that points at it is written, so
// A6 generates ids in the same shape (32 lower-case hex characters) and
// puts every insert of one create into a single batch.
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── owner candidates ──────────────────────────────────────────────────────

// Who may be named the internal owner of a client.
//
// owner_membership_id is operational responsibility and nothing else: the
// A4 engine does not read it, so naming someone the owner grants them no
// access they did not already have. That makes it possible to hand a client
// to a Team Member who then cannot open it, which would be a confusing and
// useless state, so A6 offers as owner:
//
//   - anyone whose role already reaches every client in the workspace
//     (Owner, Admin, Project Manager), and
//   - a Team Member who already reaches this client through a real
//     client_assignments row, so an owner who is already on the client
//     stays selectable.
//
// A service-only assignment does not qualify, because under A4 it does not
// reach the client record. A7 owns assignment management and may widen this
// once a manager can grant the access in the same place they name the
// owner. Client memberships are never candidates.
const WORKSPACE_SCOPE_ROLES = ['owner', 'admin', 'project_manager'];

export async function ownerCandidates(db, workspaceId, { clientId = null } = {}) {
  const m = schema.workspaceMemberships;
  const rows = await db
    .select({ id: m.id, role: m.role, status: m.status, userId: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(m.workspaceId, workspaceId), eq(m.status, 'active'), inArray(m.role, WORKSPACE_SCOPE_ROLES)))
    .orderBy(asc(schema.user.name), asc(schema.user.email));
  const candidates = rows.map((r) => ({ id: r.id, role: r.role, roleLabel: ROLE_LABELS[r.role] || r.role, name: r.name || r.email, email: r.email }));
  if (!clientId) return candidates;
  const assigned = await db
    .select({ id: m.id, role: m.role, name: schema.user.name, email: schema.user.email })
    .from(schema.clientAssignments)
    .innerJoin(m, and(eq(m.id, schema.clientAssignments.membershipId), eq(m.workspaceId, schema.clientAssignments.workspaceId)))
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(
      eq(schema.clientAssignments.workspaceId, workspaceId),
      eq(schema.clientAssignments.clientId, clientId),
      eq(m.status, 'active'),
      eq(m.role, 'team_member'),
    ))
    .orderBy(asc(schema.user.name), asc(schema.user.email));
  for (const r of assigned) {
    if (!candidates.some((c) => c.id === r.id)) {
      candidates.push({ id: r.id, role: r.role, roleLabel: ROLE_LABELS[r.role] || r.role, name: r.name || r.email, email: r.email });
    }
  }
  return candidates;
}

// Is this membership id an acceptable owner right now? A membership from
// another workspace is indistinguishable from a wrong id, so both come back
// the same way and neither says anything about the other workspace.
export async function validateOwner(db, workspaceId, membershipId, { clientId = null } = {}) {
  const id = trimmed(membershipId);
  if (!id) return { ok: true, value: null };
  const candidates = await ownerCandidates(db, workspaceId, { clientId });
  const match = candidates.find((c) => c.id === id);
  if (!match) return { ok: false, message: 'Choose an owner from the list.' };
  return { ok: true, value: match.id };
}

// ── reading ───────────────────────────────────────────────────────────────

// The WHERE clause that limits a query to what this actor reaches. Owner,
// Admin, and Project Manager reach the workspace; a Team Member reaches
// the clients they hold a client_assignments row for and nothing else (a
// service assignment reaches the engagement, not the client record); every
// other actor, a Client membership included, reaches nothing here, because
// this is the internal Clients area.
function scopeClause(actor) {
  const t = schema.clients;
  if (!actor || actor.status !== 'active' || !actor.scope) return null;
  if (actor.scope.kind === 'workspace') return eq(t.workspaceId, actor.workspaceId);
  if (actor.scope.kind !== 'assigned') return null;
  const ids = [...actor.scope.clientIds];
  if (ids.length === 0) return null;
  return and(eq(t.workspaceId, actor.workspaceId), inArray(t.id, ids));
}

function decorate(row) {
  return {
    ...row,
    statusLabel: clientStatusLabel(row.relationshipStatus),
    healthLabel: clientHealthLabel(row.health),
  };
}

// The list. `filter` is a key from CLIENT_FILTERS; anything else is All.
// Counts come back per lifecycle so the filter row can say how many are
// behind each one, always within the actor's own scope.
export async function listClients(db, actor, { filter = 'all', limit = 200 } = {}) {
  const key = normalizeFilter(filter);
  const scope = scopeClause(actor);
  if (!scope) return { filter: key, clients: [], counts: emptyCounts(), total: 0 };
  const t = schema.clients;
  const countRows = await db
    .select({ status: t.relationshipStatus, n: sql`count(*)` })
    .from(t)
    .where(scope)
    .groupBy(t.relationshipStatus);
  const counts = emptyCounts();
  let total = 0;
  for (const row of countRows) {
    const n = Number(row.n) || 0;
    if (row.status in counts) counts[row.status] = n;
    total += n;
  }
  counts.all = total;
  const where = key === 'all' ? scope : and(scope, eq(t.relationshipStatus, key));
  const rows = await db
    .select({
      id: t.id,
      name: t.name,
      company: t.company,
      relationshipStatus: t.relationshipStatus,
      health: t.health,
      startDate: t.startDate,
      ownerMembershipId: t.ownerMembershipId,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
    })
    .from(t)
    .leftJoin(schema.workspaceMemberships, and(eq(schema.workspaceMemberships.id, t.ownerMembershipId), eq(schema.workspaceMemberships.workspaceId, t.workspaceId)))
    .leftJoin(schema.user, eq(schema.user.id, schema.workspaceMemberships.userId))
    .where(where)
    .orderBy(asc(t.name), asc(t.id))
    .limit(limit);
  const primaries = await primaryContactsFor(db, actor?.workspaceId, rows.map((r) => r.id));
  return {
    filter: key,
    total,
    counts,
    clients: rows.map((r) => decorate({
      id: r.id,
      name: r.name,
      company: r.company,
      relationshipStatus: r.relationshipStatus,
      health: r.health,
      startDate: r.startDate,
      owner: r.ownerMembershipId ? { membershipId: r.ownerMembershipId, name: r.ownerName || r.ownerEmail } : null,
      primaryContact: primaries.get(r.id) || null,
    })),
  };
}

function emptyCounts() {
  const counts = { all: 0 };
  for (const status of CLIENT_STATUSES) counts[status] = 0;
  return counts;
}

async function primaryContactsFor(db, workspaceId, clientIds) {
  const map = new Map();
  if (!workspaceId || clientIds.length === 0) return map;
  const c = schema.clientContacts;
  const rows = await db
    .select({ clientId: c.clientId, name: c.name, email: c.email })
    .from(c)
    .where(and(eq(c.workspaceId, workspaceId), eq(c.isPrimary, true), inArray(c.clientId, clientIds)));
  for (const row of rows) map.set(row.clientId, { name: row.name, email: row.email });
  return map;
}

// One client, everything the internal detail screen shows, or null. The id
// is looked up inside the actor's scope, so a client in another workspace
// and a client this Team Member is not assigned to both come back null,
// exactly as a client that does not exist does. The caller answers all
// three the same way.
export async function getClient(db, actor, clientId) {
  const scope = scopeClause(actor);
  if (!scope || !clientId) return null;
  const t = schema.clients;
  const rows = await db
    .select({
      client: t,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
      ownerRole: schema.workspaceMemberships.role,
      ownerStatus: schema.workspaceMemberships.status,
    })
    .from(t)
    .leftJoin(schema.workspaceMemberships, and(eq(schema.workspaceMemberships.id, t.ownerMembershipId), eq(schema.workspaceMemberships.workspaceId, t.workspaceId)))
    .leftJoin(schema.user, eq(schema.user.id, schema.workspaceMemberships.userId))
    .where(and(scope, eq(t.id, String(clientId))))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const c = row.client;
  return decorate({
    id: c.id,
    workspaceId: c.workspaceId,
    name: c.name,
    company: c.company,
    slug: c.slug,
    relationshipStatus: c.relationshipStatus,
    health: c.health,
    timezone: c.timezone,
    website: c.website,
    startDate: c.startDate,
    endDate: c.endDate,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    owner: c.ownerMembershipId
      ? {
          membershipId: c.ownerMembershipId,
          name: row.ownerName || row.ownerEmail,
          email: row.ownerEmail,
          role: row.ownerRole,
          roleLabel: ROLE_LABELS[row.ownerRole] || row.ownerRole,
          // An owner who was later suspended or removed keeps the record of
          // who was responsible. The screen says so rather than quietly
          // reassigning the client to nobody.
          active: row.ownerStatus === 'active',
        }
      : null,
  });
}

// ── creating ──────────────────────────────────────────────────────────────

// Create a client and its first contact.
//
// A new client is always Draft and always On Track, whatever the request
// says; the browser cannot choose a starting lifecycle. Creating a client
// invites nobody: no invitation row, no membership, no email, no
// client_contacts.user_id, even when the address already belongs to a
// person who can sign in. Portal access is A9/A10's.
//
// The client, its primary contact, and the CLIENT_CREATED event are one
// batch, so a failure leaves nothing behind: no client without its contact,
// and no client without its history.
export async function createClient(db, { workspaceId, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  const errors = {};
  const name = validateName(input?.name);
  if (!name.ok) errors.name = name.message;
  const contactName = validateContactName(input?.contactName);
  if (!contactName.ok) errors.contactName = contactName.message;
  const contactEmail = validateEmail(input?.contactEmail, { required: true });
  if (!contactEmail.ok) errors.contactEmail = contactEmail.message;
  const company = validateOptionalText(input?.company, LIMITS.company, 'the company name');
  if (!company.ok) errors.company = company.message;
  const website = validateWebsite(input?.website);
  if (!website.ok) errors.website = website.message;
  const timezone = validateTimezone(input?.timezone);
  if (!timezone.ok) errors.timezone = timezone.message;
  const startDate = validateDate(input?.startDate, 'the start date');
  if (!startDate.ok) errors.startDate = startDate.message;
  const owner = await validateOwner(db, workspaceId, input?.ownerMembershipId);
  if (!owner.ok) errors.ownerMembershipId = owner.message;
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

  const iso = now.toISOString();
  const candidates = await slugCandidates(db, workspaceId, name.value);
  let lastError = null;
  for (const slug of candidates) {
    const clientId = newId();
    const contactId = newId();
    try {
      await db.batch([
        db.insert(schema.clients).values({
          id: clientId,
          workspaceId,
          name: name.value,
          company: company.value,
          slug,
          relationshipStatus: 'draft',
          health: 'on_track',
          timezone: timezone.value,
          website: website.value,
          startDate: startDate.value,
          endDate: null,
          ownerMembershipId: owner.value,
          createdAt: iso,
          updatedAt: iso,
        }),
        db.insert(schema.clientContacts).values({
          id: contactId,
          workspaceId,
          clientId,
          name: contactName.value,
          email: contactEmail.value,
          phone: null,
          title: null,
          // Never set here, and never taken from the request. The portal
          // link is A9/A10's, and a matching address is not a link.
          userId: null,
          isPrimary: true,
          createdAt: iso,
          updatedAt: iso,
        }),
        db.insert(schema.activityEvents).values(activityValues({
          workspaceId,
          eventType: ACTIVITY.CLIENT_CREATED,
          subjectType: 'client',
          subjectId: clientId,
          clientId,
          actorMembershipId,
          actorUserId,
          metadata: { name: name.value, ownerMembershipId: owner.value },
          occurredAt: iso,
        })),
      ]);
      return { ok: true, clientId, slug };
    } catch (err) {
      if (!isSlugConflict(err)) throw err;
      lastError = err;
    }
  }
  // Every candidate lost a race, which needs someone to look, but the
  // caller still gets a plain answer rather than a constraint message.
  return { ok: false, reason: 'slug_conflict', errors: { name: 'That name could not be saved just now. Try again.' }, cause: lastError };
}

// ── updating ──────────────────────────────────────────────────────────────

const DETAIL_FIELDS = ['name', 'company', 'website', 'timezone', 'startDate', 'endDate'];

const DETAIL_LABELS = {
  name: 'Name',
  company: 'Company',
  website: 'Website',
  timezone: 'Time zone',
  startDate: 'Start date',
  endDate: 'End date',
};

export { DETAIL_LABELS };

// Change the identity fields, the health, or the owner of one client.
//
// Only the keys present in `input` are considered, so a screen that edits
// three fields cannot blank the rest. A value equal to what is stored is a
// no-op and records nothing: activity is a history of changes, not of
// requests. Each of the three kinds of change records at most one event,
// and only when something actually moved.
//
// relationship_status is refused outright. See the note at the top of this
// file: moving a client through its lifecycle is A9's activation
// transaction, not a field edit.
export async function updateClient(db, { workspaceId, client, input, actorMembershipId = null, actorUserId = null, now = new Date() }) {
  if (!client) return { ok: false, reason: 'not_found' };
  if (input && Object.prototype.hasOwnProperty.call(input, 'relationshipStatus')) {
    return { ok: false, reason: 'status_not_editable', errors: { relationshipStatus: 'The client’s status is set by activation, not by editing.' } };
  }

  const errors = {};
  const patch = {};
  const changes = {};

  const has = (key) => input && Object.prototype.hasOwnProperty.call(input, key);
  const apply = (key, column, result) => {
    if (!result.ok) {
      errors[key] = result.message;
      return;
    }
    if (result.value === client[key]) return;
    patch[column] = result.value;
    changes[key] = { from: client[key] ?? null, to: result.value };
  };

  if (has('name')) apply('name', 'name', validateName(input.name));
  if (has('company')) apply('company', 'company', validateOptionalText(input.company, LIMITS.company, 'the company name'));
  if (has('website')) apply('website', 'website', validateWebsite(input.website));
  if (has('timezone')) apply('timezone', 'timezone', validateTimezone(input.timezone));
  if (has('startDate')) apply('startDate', 'startDate', validateDate(input.startDate, 'the start date'));
  if (has('endDate')) apply('endDate', 'endDate', validateDate(input.endDate, 'the end date'));

  let healthChange = null;
  if (has('health')) {
    const health = validateHealth(input.health);
    if (!health.ok) errors.health = health.message;
    else if (health.value !== client.health) {
      patch.health = health.value;
      healthChange = { from: client.health, to: health.value };
    }
  }

  // Keeping the owner already stored is a different question from naming a
  // new one, and only the second is a candidacy question.
  //
  // An owner who qualified when they were assigned may stop qualifying
  // later: suspended, removed, or a Team Member whose client assignment went
  // away. A6 deliberately keeps them on the record (getClient reports them
  // with `active`, the Team tab explains it, and the edit form keeps them in
  // its list) so that nothing silently reassigns a client. The edit form
  // therefore sends the stored id back on every save, and validating that as
  // a fresh assignment would fail an unrelated website or start-date edit
  // with "Choose an owner from the list."
  //
  // So the stored value coming back unchanged is a no-op: not validated as a
  // new candidate, not written, not recorded. Any *different* value, the
  // empty one that clears the owner included, goes through the candidate
  // policy exactly as before, and createClient is untouched because a client
  // being created has no stored owner to keep.
  let ownerChange = null;
  if (has('ownerMembershipId')) {
    const current = client.owner?.membershipId || null;
    const requested = trimmed(input.ownerMembershipId) || null;
    if (requested !== current) {
      const owner = await validateOwner(db, workspaceId, requested, { clientId: client.id });
      if (!owner.ok) errors.ownerMembershipId = owner.message;
      else {
        patch.ownerMembershipId = owner.value;
        ownerChange = { from: current, to: owner.value };
      }
    }
  }

  const startFinal = 'startDate' in patch ? patch.startDate : client.startDate;
  const endFinal = 'endDate' in patch ? patch.endDate : client.endDate;
  if (!errors.startDate && !errors.endDate && startFinal && endFinal && endFinal < startFinal) {
    errors.endDate = 'The end date cannot be before the start date.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

  const detailChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => DETAIL_FIELDS.includes(key)));
  const changedDetails = Object.keys(detailChanges).length > 0;
  if (!changedDetails && !healthChange && !ownerChange) return { ok: true, unchanged: true };

  const iso = now.toISOString();
  const writes = [
    db
      .update(schema.clients)
      .set({ ...patch, updatedAt: iso })
      .where(and(eq(schema.clients.workspaceId, workspaceId), eq(schema.clients.id, client.id))),
  ];
  const event = (eventType, metadata) =>
    db.insert(schema.activityEvents).values(activityValues({
      workspaceId,
      eventType,
      subjectType: 'client',
      subjectId: client.id,
      clientId: client.id,
      actorMembershipId,
      actorUserId,
      metadata,
      occurredAt: iso,
    }));
  // Three genuinely distinct facts can change in one request, and each is
  // worth its own line of history. Nothing records a fact twice.
  if (changedDetails) writes.push(event(ACTIVITY.CLIENT_DETAILS_UPDATED, { fields: detailChanges }));
  if (healthChange) writes.push(event(ACTIVITY.CLIENT_HEALTH_CHANGED, healthChange));
  if (ownerChange) writes.push(event(ACTIVITY.CLIENT_OWNER_CHANGED, await describeOwnerChange(db, workspaceId, ownerChange)));
  await db.batch(writes);
  return { ok: true, changed: { details: changedDetails ? Object.keys(detailChanges) : [], health: Boolean(healthChange), owner: Boolean(ownerChange) } };
}

// Owner events carry the names so history stays readable after a person
// leaves the workspace and their membership is no longer joinable.
async function describeOwnerChange(db, workspaceId, { from, to }) {
  const ids = [from, to].filter(Boolean);
  const names = new Map();
  if (ids.length > 0) {
    const m = schema.workspaceMemberships;
    const rows = await db
      .select({ id: m.id, name: schema.user.name, email: schema.user.email })
      .from(m)
      .innerJoin(schema.user, eq(schema.user.id, m.userId))
      .where(and(eq(m.workspaceId, workspaceId), inArray(m.id, ids)));
    for (const row of rows) names.set(row.id, row.name || row.email);
  }
  return { from, to, fromName: from ? names.get(from) || null : null, toName: to ? names.get(to) || null : null };
}

// Health on its own, for the one control that changes it. It goes through
// updateClient, so it cannot touch lifecycle even by accident: the patch
// updateClient builds from `{ health }` has one column in it.
export async function setClientHealth(db, args) {
  return updateClient(db, { ...args, input: { health: args.health } });
}

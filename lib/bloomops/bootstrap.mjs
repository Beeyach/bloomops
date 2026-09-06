// First-workspace bootstrap.
//
// There is no "create your agency" screen. The first workspace, its Owner,
// and its Admin are created on purpose, from explicit inputs, by a command
// an operator runs (scripts/bootstrap-workspace.mjs) or a test calls. The
// plan is a list of literal SQL statements, each guarded by NOT EXISTS, so
// the same plan can run through `wrangler d1 execute --file` against a
// remote database and through a D1 binding in tests, and running it again
// changes nothing: no second workspace, no second identity, no second
// membership. An identity that already exists keeps its name; a membership
// that already exists keeps its role and status, and the report says so.
//
// A7 adds the default service catalogue to the same plan: the four
// departments and the five initial service types, defined once in
// lib/bloomops/service-catalog.mjs and appended here under the same NOT
// EXISTS guard. That is what gives an existing workspace the catalogue
// without a data migration, because the staging deploy runs this bootstrap
// on every push to main and a second pass inserts nothing.
//
// No email address lives in this file. Inputs come from the caller.

import { catalogStatements } from './service-catalog.mjs';

const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_SHAPE = /^[^\s@'"<>()[\],;:\\]+@[^\s@'"<>()[\],;:\\]+\.[^\s@'"<>()[\],;:\\]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function randomHex(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function literal(value) {
  const s = String(value);
  if (CONTROL_CHARACTERS.test(s)) throw new Error('Bootstrap inputs may not contain control characters.');
  return `'${s.replace(/'/g, "''")}'`;
}

export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function nameFromEmail(email) {
  const local = email.split('@')[0];
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function identity(label, input) {
  const email = String(input?.email || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_SHAPE.test(email)) {
    throw new Error(`${label} email is missing or not an email address.`);
  }
  const name = String(input?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || nameFromEmail(email);
  return { email, name };
}

// Validate and normalise the operator's inputs. Throws on anything unusable,
// because a bootstrap that guesses is worse than one that stops.
export function bootstrapInput({ workspaceName, workspaceSlug, owner, admin } = {}) {
  const name = String(workspaceName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) throw new Error('Workspace name is required.');
  const slug = String(workspaceSlug || '').trim() || slugify(name);
  if (!SLUG_SHAPE.test(slug) || slug.length > 40) throw new Error(`Workspace slug "${slug}" must be lowercase letters, digits, and single hyphens.`);
  const o = identity('Owner', owner);
  const a = identity('Admin', admin);
  if (o.email === a.email) throw new Error('Owner and Admin must be different people.');
  return { workspaceName: name, workspaceSlug: slug, owner: o, admin: a };
}

// The idempotent statements, in order. Ids are generated here for the rows
// this run may create; rows that already exist are left exactly as found.
export function bootstrapPlan(rawInput, { now = new Date(), ids = {} } = {}) {
  const input = bootstrapInput(rawInput);
  const iso = now.toISOString();
  const workspaceId = ids.workspaceId || randomHex();
  const ws = literal(input.workspaceSlug);
  const statements = [];

  statements.push(
    `INSERT INTO workspaces (id, name, slug, status, created_at, updated_at) ` +
      `SELECT ${literal(workspaceId)}, ${literal(input.workspaceName)}, ${ws}, 'active', ${literal(iso)}, ${literal(iso)} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = ${ws});`,
  );
  statements.push(
    `INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, metadata_json, occurred_at) ` +
      `SELECT ${literal(ids.workspaceEventId || randomHex())}, w.id, 'WORKSPACE_CREATED', 'workspace', w.id, '{"source":"bootstrap"}', ${literal(iso)} ` +
      `FROM workspaces w WHERE w.slug = ${ws} ` +
      `AND NOT EXISTS (SELECT 1 FROM activity_events a WHERE a.workspace_id = w.id AND a.event_type = 'WORKSPACE_CREATED');`,
  );

  const people = [
    { role: 'owner', person: input.owner, userId: ids.ownerUserId, membershipId: ids.ownerMembershipId, eventId: ids.ownerEventId },
    { role: 'admin', person: input.admin, userId: ids.adminUserId, membershipId: ids.adminMembershipId, eventId: ids.adminEventId },
  ];
  for (const { role, person, userId, membershipId, eventId } of people) {
    const email = literal(person.email);
    statements.push(
      `INSERT INTO user (id, name, email, email_verified) ` +
        `SELECT ${literal(userId || randomHex())}, ${literal(person.name)}, ${email}, 0 ` +
        `WHERE NOT EXISTS (SELECT 1 FROM user WHERE email = ${email});`,
    );
    statements.push(
      `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, joined_at, created_at, updated_at) ` +
        `SELECT ${literal(membershipId || randomHex())}, w.id, u.id, ${literal(role)}, 'active', ${literal(iso)}, ${literal(iso)}, ${literal(iso)} ` +
        `FROM workspaces w, user u WHERE w.slug = ${ws} AND u.email = ${email} ` +
        `AND NOT EXISTS (SELECT 1 FROM workspace_memberships m WHERE m.workspace_id = w.id AND m.user_id = u.id);`,
    );
    statements.push(
      `INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, actor_membership_id, actor_user_id, metadata_json, occurred_at) ` +
        `SELECT ${literal(eventId || randomHex())}, m.workspace_id, 'MEMBERSHIP_CREATED', 'membership', m.id, m.id, m.user_id, ${literal(JSON.stringify({ role, via: 'bootstrap' }))}, ${literal(iso)} ` +
        `FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id JOIN user u ON u.id = m.user_id ` +
        `WHERE w.slug = ${ws} AND u.email = ${email} ` +
        `AND NOT EXISTS (SELECT 1 FROM activity_events a WHERE a.event_type = 'MEMBERSHIP_CREATED' AND a.subject_type = 'membership' AND a.subject_id = m.id);`,
    );
  }

  // The workspace's own catalogue, after the workspace row exists in the
  // same file. Configuration, not sample data: no client and no engagement
  // is ever created here.
  statements.push(...catalogStatements({ workspaceSlug: input.workspaceSlug, now, ids: ids.catalog || {} }));

  const reportSql =
    `SELECT u.email AS email, u.name AS name, m.role AS role, m.status AS status, w.slug AS workspace ` +
    `FROM workspace_memberships m JOIN user u ON u.id = m.user_id JOIN workspaces w ON w.id = m.workspace_id ` +
    `WHERE w.slug = ${ws} ORDER BY u.email;`;

  return { input, statements, reportSql };
}

// Run the plan through a D1-shaped binding (env.DB, or the test double) and
// return what the workspace looks like afterwards.
export async function runBootstrap(d1, rawInput, options = {}) {
  const plan = bootstrapPlan(rawInput, options);
  for (const sql of plan.statements) await d1.prepare(sql).run();
  return { plan, report: await bootstrapReport(d1, plan) };
}

export async function bootstrapReport(d1, plan) {
  const { results } = await d1.prepare(plan.reportSql).all();
  return assessReport(plan.input, results || []);
}

// Compare what the database holds with what the operator intended. Rows are
// never invented: an existing membership with a different role is reported,
// not rewritten.
export function assessReport(input, rows) {
  const byEmail = new Map(rows.map((r) => [String(r.email).toLowerCase(), r]));
  const expectations = [
    { label: 'Owner', email: input.owner.email, role: 'owner' },
    { label: 'Admin', email: input.admin.email, role: 'admin' },
  ];
  const memberships = expectations.map((e) => {
    const row = byEmail.get(e.email);
    return {
      label: e.label,
      email: e.email,
      expectedRole: e.role,
      role: row?.role || null,
      status: row?.status || null,
      ok: Boolean(row) && row.role === e.role && row.status === 'active',
    };
  });
  return {
    workspace: input.workspaceSlug,
    memberships,
    ok: memberships.every((m) => m.ok),
    otherMembers: rows.length - memberships.filter((m) => m.role).length,
  };
}

// For logs: keep the domain, hide most of the local part.
export function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

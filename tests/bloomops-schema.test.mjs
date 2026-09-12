// The BloomOps domain schema, proven against a real SQLite database built
// from the committed Drizzle migrations in ./drizzle. These tests exercise the
// invariants in docs/DOMAIN_MODEL.md and docs/phases/A2.md, not the mere
// existence of tables: workspace isolation through foreign keys, one client
// with several engagements, client versus service assignment, immutable
// template snapshots, stable onboarding keys, separate status and health,
// roles plus capabilities, and append-only activity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getTableName } from 'drizzle-orm';
import * as schema from '../lib/bloomops/schema.mjs';

function migrationFiles() {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  return journal.entries.map((e) => ({ tag: e.tag, url: new URL(`../drizzle/${e.tag}.sql`, import.meta.url) }));
}

// A fresh database that has only ever seen the BloomOps migrations, in
// journal order, statement by statement, with foreign keys enforced like D1.
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const { url } of migrationFiles()) {
    for (const chunk of readFileSync(url, 'utf8').split('--> statement-breakpoint')) {
      const stmt = chunk.trim();
      if (stmt) db.exec(stmt);
    }
  }
  return db;
}

const run = (db, sql, ...params) => db.prepare(sql).run(...params);
const one = (db, sql, ...params) => db.prepare(sql).get(...params);
const all = (db, sql, ...params) => db.prepare(sql).all(...params);
const tableNames = (db) => all(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
const columnsOf = (db, table) => all(db, `PRAGMA table_info("${table}")`).map((r) => r.name);

// Two workspaces, one user, one membership in each, one client in A.
function twoWorkspaces(db) {
  run(db, "INSERT INTO workspaces (id, name, slug) VALUES ('ws_a', 'Agency A', 'agency-a')");
  run(db, "INSERT INTO workspaces (id, name, slug) VALUES ('ws_b', 'Agency B', 'agency-b')");
  run(db, "INSERT INTO user (id, name, email) VALUES ('u_ellen', 'Ellen', 'ellen@example.com')");
  run(db, "INSERT INTO user (id, name, email) VALUES ('u_ary', 'Ary', 'ary@example.com')");
  run(db, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('m_a_ellen', 'ws_a', 'u_ellen', 'owner', 'active')");
  run(db, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('m_a_ary', 'ws_a', 'u_ary', 'admin', 'active')");
  run(db, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('m_b_ary', 'ws_b', 'u_ary', 'team_member', 'active')");
  run(db, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_james', 'ws_a', 'James', 'james')");
  return db;
}

// ── bootstrap ────────────────────────────────────────────────────────────

test('a fresh database reaches the A2 schema from the committed migrations alone', () => {
  const db = freshDb();
  const expected = schema.BLOOMOPS_TABLES.map(getTableName).sort();
  const present = tableNames(db);
  for (const name of expected) assert.ok(present.includes(name), `missing table ${name}`);
  assert.equal(expected.length, 44, 'D2 2B adds immutable generation provenance and item mappings');
  const extra = present.filter((n) => !expected.includes(n) && n !== 'sqlite_sequence');
  assert.deepEqual(extra, [], 'no unplanned tables');
});

test('migrations are additive and ordered, so applying them is deterministic', () => {
  const files = migrationFiles();
  assert.equal(files.length, 20);
  assert.equal(files[8].tag, '0008_b1_projects_core');
  assert.equal(files[9].tag, '0009_b2_milestones');
  assert.equal(files[10].tag, '0010_b3_actions_dependencies');
  assert.equal(files[11].tag, '0011_b4_deliverables');
  assert.equal(files[12].tag, '0012_b5_files');
  assert.equal(files[13].tag, '0013_c1_content');
  assert.equal(files[14].tag, '0014_c2_content_pipeline');
  assert.equal(files[15].tag, '0015_c3_calendar_platforms');
  assert.equal(files[16].tag, '0016_c4_content_assets');
  assert.equal(files[17].tag, '0017_c5_content_approvals');
  assert.equal(files[18].tag, '0018_d2_slice2a_binding_storage');
  assert.equal(files[19].tag, '0019_d2_slice2b_generation_provenance');
  assert.match(files[0].tag, /^0000_/);
  assert.match(files[1].tag, /^0001_immutability_triggers$/);
  assert.match(files[2].tag, /^0002_a3_auth_membership$/);
  assert.match(files[3].tag, /^0003_a6_primary_contact$/);
  assert.match(files[4].tag, /^0004_a7_open_service_uq$/);
  assert.match(files[5].tag, /^0005_a8_onboarding_templates$/);
  for (const { url } of files) {
    const sql = readFileSync(url, 'utf8');
    assert.doesNotMatch(sql, /\bDROP\s+(TABLE|INDEX|TRIGGER)\b/i, 'Release A migrations only create');
    assert.doesNotMatch(sql, /bloomtrack|412a33ad|leadsthatbloom/i, 'no Leadsthatbloom names');
  }
});

test('the BloomOps client table coexists with the inherited Leadsthatbloom clients table', () => {
  const db = freshDb();
  // The inherited app still owns `clients`; A2 must not claim that name.
  assert.equal(getTableName(schema.clients), 'bloomops_clients');
  db.exec("CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, workspace TEXT NOT NULL DEFAULT 'ary')");
  run(db, "INSERT INTO clients (id, name) VALUES ('legacy', 'Legacy prospect client')");
  run(db, "INSERT INTO workspaces (id, name, slug) VALUES ('ws', 'W', 'w')");
  run(db, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c1', 'ws', 'BloomOps client', 'bc')");
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM clients').n, 1);
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM bloomops_clients').n, 1);
});

// ── workspace isolation ──────────────────────────────────────────────────

test('a child row cannot point at a parent in another workspace', () => {
  const db = twoWorkspaces(freshDb());
  // A contact for James (ws_a) filed under ws_b: the composite key refuses it.
  assert.throws(
    () => run(db, "INSERT INTO client_contacts (id, workspace_id, client_id, name) VALUES ('cc', 'ws_b', 'c_james', 'Cross')"),
    /FOREIGN KEY/,
  );
  // The same row in the right workspace is fine.
  run(db, "INSERT INTO client_contacts (id, workspace_id, client_id, name) VALUES ('cc', 'ws_a', 'c_james', 'James')");
  // A ws_b membership cannot be assigned to a ws_a client.
  assert.throws(
    () => run(db, "INSERT INTO client_assignments (id, workspace_id, client_id, membership_id) VALUES ('ca', 'ws_a', 'c_james', 'm_b_ary')"),
    /FOREIGN KEY/,
  );
  run(db, "INSERT INTO client_assignments (id, workspace_id, client_id, membership_id) VALUES ('ca', 'ws_a', 'c_james', 'm_a_ary')");
  // A service type from ws_b cannot be sold to a ws_a client.
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_b', 'ws_b', 'Social', 'social')");
  assert.throws(
    () => run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se', 'ws_a', 'c_james', 'st_b')"),
    /FOREIGN KEY/,
  );
});

test('every business table carries workspace_id and a workspace foreign key', () => {
  const db = freshDb();
  const authTables = ['user', 'session', 'account', 'verification'];
  for (const table of schema.BLOOMOPS_TABLES.map(getTableName)) {
    if (table === 'workspaces' || authTables.includes(table)) continue;
    assert.ok(columnsOf(db, table).includes('workspace_id'), `${table} lacks workspace_id`);
    const fks = all(db, `PRAGMA foreign_key_list("${table}")`);
    assert.ok(fks.some((fk) => fk.table === 'workspaces' && fk.from === 'workspace_id'), `${table} lacks a workspaces foreign key`);
  }
});

test('the same user can belong to two workspaces with different roles, once each', () => {
  const db = twoWorkspaces(freshDb());
  assert.equal(all(db, "SELECT role FROM workspace_memberships WHERE user_id = 'u_ary' ORDER BY workspace_id").map((r) => r.role).join(','), 'admin,team_member');
  assert.throws(
    () => run(db, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role) VALUES ('dup', 'ws_a', 'u_ary', 'client')"),
    /UNIQUE/,
  );
});

// ── clients and services ─────────────────────────────────────────────────

test('one client holds several simultaneous service engagements, each with its own status', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_social', 'ws_a', 'Social Media', 'social')");
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_ads', 'ws_a', 'Ads', 'ads')");
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_ghl', 'ws_a', 'GHL Systems', 'ghl')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_social', 'ws_a', 'c_james', 'st_social', 'active')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_ads', 'ws_a', 'c_james', 'st_ads', 'paused')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_ghl', 'ws_a', 'c_james', 'st_ghl', 'onboarding')");
  const rows = all(db, "SELECT service_type_id, status FROM service_engagements WHERE client_id = 'c_james' ORDER BY service_type_id");
  assert.equal(rows.length, 3);
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM bloomops_clients').n, 1, 'still one client record');
  // Service status is its own column, separate from the client's relationship status.
  assert.equal(one(db, "SELECT relationship_status FROM bloomops_clients WHERE id = 'c_james'").relationship_status, 'draft');
  assert.throws(
    () => run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('bad', 'ws_a', 'c_james', 'st_ads', 'live')"),
    /CHECK/,
  );
});

test('client assignment and service assignment are distinct scopes', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_social', 'ws_a', 'Social', 'social')");
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_ghl', 'ws_a', 'GHL', 'ghl')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_social', 'ws_a', 'c_james', 'st_social')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_ghl', 'ws_a', 'c_james', 'st_ghl')");
  // A social contractor gets the Social engagement only.
  run(db, "INSERT INTO user (id, name, email) VALUES ('u_contractor', 'Sam', 'sam@example.com')");
  run(db, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('m_sam', 'ws_a', 'u_contractor', 'team_member', 'active')");
  run(db, "INSERT INTO service_assignments (id, workspace_id, service_engagement_id, membership_id) VALUES ('sa', 'ws_a', 'se_social', 'm_sam')");
  // Ary is assigned to the client as a whole.
  run(db, "INSERT INTO client_assignments (id, workspace_id, client_id, membership_id, assignment_role) VALUES ('ca', 'ws_a', 'c_james', 'm_a_ary', 'lead')");
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM service_assignments WHERE membership_id = 'm_sam' AND service_engagement_id = 'se_ghl'").n, 0, 'no GHL scope for the social contractor');
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM client_assignments WHERE membership_id = 'm_sam'").n, 0, 'service scope does not imply client scope');
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM service_assignments WHERE membership_id = 'm_a_ary'").n, 0, 'client scope is not stored as service rows');
  assert.throws(
    () => run(db, "INSERT INTO service_assignments (id, workspace_id, service_engagement_id, membership_id) VALUES ('sa2', 'ws_a', 'se_social', 'm_sam')"),
    /UNIQUE/,
  );
});

test('relationship status and health are separate columns with separate vocabularies', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "UPDATE bloomops_clients SET health = 'at_risk' WHERE id = 'c_james'");
  const row = one(db, "SELECT relationship_status, health FROM bloomops_clients WHERE id = 'c_james'");
  assert.equal(row.relationship_status, 'draft');
  assert.equal(row.health, 'at_risk');
  run(db, "UPDATE bloomops_clients SET relationship_status = 'active' WHERE id = 'c_james'");
  assert.equal(one(db, "SELECT health FROM bloomops_clients WHERE id = 'c_james'").health, 'at_risk', 'status change leaves health alone');
  assert.throws(() => run(db, "UPDATE bloomops_clients SET health = 'active' WHERE id = 'c_james'"), /CHECK/, 'a status word is not a health');
  assert.throws(() => run(db, "UPDATE bloomops_clients SET relationship_status = 'at_risk' WHERE id = 'c_james'"), /CHECK/, 'a health word is not a status');
  assert.throws(
    () => run(db, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('dup', 'ws_a', 'James again', 'james')"),
    /UNIQUE/,
    'slug is unique per workspace',
  );
  run(db, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_james_b', 'ws_b', 'James', 'james')");
});

test('a client contact can be linked to a portal user later, and email is unique per client', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, is_primary) VALUES ('cc1', 'ws_a', 'c_james', 'James', 'james@example.com', 1)");
  assert.equal(one(db, "SELECT user_id FROM client_contacts WHERE id = 'cc1'").user_id, null);
  run(db, "INSERT INTO user (id, name, email) VALUES ('u_james', 'James', 'james@example.com')");
  run(db, "UPDATE client_contacts SET user_id = 'u_james' WHERE id = 'cc1'");
  assert.throws(
    () => run(db, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email) VALUES ('cc2', 'ws_a', 'c_james', 'Dup', 'james@example.com')"),
    /UNIQUE/,
  );
  run(db, "INSERT INTO client_contacts (id, workspace_id, client_id, name) VALUES ('cc3', 'ws_a', 'c_james', 'No email yet')");
  run(db, "INSERT INTO client_contacts (id, workspace_id, client_id, name) VALUES ('cc4', 'ws_a', 'c_james', 'Also no email')");
});

// ── roles and capabilities ───────────────────────────────────────────────

test('five roles are representable and finer permissions are capability rows, not new roles', () => {
  const db = freshDb();
  run(db, "INSERT INTO workspaces (id, name, slug) VALUES ('ws', 'W', 'w')");
  const roles = ['owner', 'admin', 'project_manager', 'team_member', 'client'];
  roles.forEach((role, i) => {
    run(db, `INSERT INTO user (id, name, email) VALUES ('u${i}', 'U${i}', 'u${i}@example.com')`);
    run(db, `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('m${i}', 'ws', 'u${i}', '${role}', 'active')`);
  });
  assert.deepEqual(all(db, 'SELECT role FROM workspace_memberships ORDER BY id').map((r) => r.role), roles);
  assert.throws(
    () => run(db, "INSERT INTO user (id, name, email) VALUES ('ux', 'X', 'x@example.com')") && run(db, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role) VALUES ('mx', 'ws', 'ux', 'finance_admin')"),
    /CHECK/,
    'finance is a capability, not a sixth role',
  );
  run(db, "INSERT INTO member_capabilities (id, workspace_id, membership_id, capability, granted_by_membership_id) VALUES ('cap1', 'ws', 'm3', 'finance.view', 'm0')");
  run(db, "INSERT INTO member_capabilities (id, workspace_id, membership_id, capability) VALUES ('cap2', 'ws', 'm3', 'finance.edit')");
  assert.throws(
    () => run(db, "INSERT INTO member_capabilities (id, workspace_id, membership_id, capability) VALUES ('cap3', 'ws', 'm3', 'finance.view')"),
    /UNIQUE/,
  );
  assert.throws(
    () => run(db, "INSERT INTO member_capabilities (id, workspace_id, membership_id, capability) VALUES ('cap4', 'ws', 'm3', 'Finance')"),
    /CHECK/,
    'capabilities are dotted lowercase keys',
  );
  assert.throws(
    () => run(db, "UPDATE workspace_memberships SET status = 'banned' WHERE id = 'm1'"),
    /CHECK/,
  );
  run(db, "UPDATE workspace_memberships SET status = 'suspended', suspended_at = '2026-09-05T00:00:00.000Z' WHERE id = 'm1'");
});

test('department membership is separate from client access', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO departments (id, workspace_id, name, slug) VALUES ('d_social', 'ws_a', 'Social', 'social')");
  run(db, "INSERT INTO department_memberships (id, workspace_id, department_id, membership_id) VALUES ('dm', 'ws_a', 'd_social', 'm_a_ary')");
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM client_assignments WHERE membership_id = 'm_a_ary'").n, 0, 'joining Social grants no client');
  assert.throws(
    () => run(db, "INSERT INTO department_memberships (id, workspace_id, department_id, membership_id) VALUES ('dm2', 'ws_a', 'd_social', 'm_b_ary')"),
    /FOREIGN KEY/,
    'a ws_b membership cannot join a ws_a department',
  );
  assert.throws(
    () => run(db, "INSERT INTO departments (id, workspace_id, name, slug) VALUES ('d_dup', 'ws_a', 'Social again', 'social')"),
    /UNIQUE/,
  );
});

test('an invitation stores only a token hash and can be scoped to a client', () => {
  const db = twoWorkspaces(freshDb());
  assert.ok(!columnsOf(db, 'workspace_invitations').includes('token'), 'no raw token column');
  run(db, "INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, client_id, invited_by_membership_id, expires_at) VALUES ('inv', 'ws_a', 'james@example.com', 'client', 'hash1', 'c_james', 'm_a_ellen', '2026-10-01T00:00:00.000Z')");
  assert.throws(
    () => run(db, "INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, expires_at) VALUES ('inv2', 'ws_a', 'x@example.com', 'client', 'hash1', '2026-10-01T00:00:00.000Z')"),
    /UNIQUE/,
  );
  assert.throws(
    () => run(db, "INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, client_id, expires_at) VALUES ('inv3', 'ws_b', 'y@example.com', 'client', 'hash3', 'c_james', '2026-10-01T00:00:00.000Z')"),
    /FOREIGN KEY/,
    'a ws_b invitation cannot name a ws_a client',
  );
});

// ── templates ────────────────────────────────────────────────────────────

test('template versions are immutable snapshots separate from the template', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO templates (id, workspace_id, kind, name, slug) VALUES ('t_kajabi', 'ws_a', 'onboarding', 'Kajabi onboarding', 'kajabi')");
  run(db, "INSERT INTO template_versions (id, workspace_id, template_id, version_number, status, definition_json, definition_hash) VALUES ('tv1', 'ws_a', 't_kajabi', 1, 'published', '{\"items\":[{\"key\":\"kajabi.admin_access\"}]}', 'h1')");
  run(db, "INSERT INTO template_versions (id, workspace_id, template_id, version_number, status, definition_json, definition_hash) VALUES ('tv2', 'ws_a', 't_kajabi', 2, 'draft', '{\"items\":[{\"key\":\"kajabi.admin_access\"},{\"key\":\"kajabi.brand_kit\"}]}', 'h2')");
  // Editing the master template row does not touch either snapshot.
  run(db, "UPDATE templates SET name = 'Kajabi onboarding v2' WHERE id = 't_kajabi'");
  assert.equal(one(db, "SELECT definition_hash FROM template_versions WHERE id = 'tv1'").definition_hash, 'h1');
  // The snapshot itself cannot be rewritten.
  assert.throws(() => run(db, "UPDATE template_versions SET definition_json = '{}' WHERE id = 'tv1'"), /immutable/);
  assert.throws(() => run(db, "UPDATE template_versions SET version_number = 5 WHERE id = 'tv1'"), /immutable/);
  // Lifecycle status may still move.
  run(db, "UPDATE template_versions SET status = 'retired' WHERE id = 'tv1'");
  run(db, "UPDATE template_versions SET status = 'published', published_at = '2026-09-05T00:00:00.000Z' WHERE id = 'tv2'");
  assert.throws(
    () => run(db, "INSERT INTO template_versions (id, workspace_id, template_id, version_number, definition_json, definition_hash) VALUES ('tv_dup', 'ws_a', 't_kajabi', 2, '{}', 'h')"),
    /UNIQUE/,
    'one row per version number',
  );
  assert.throws(() => run(db, "DELETE FROM templates WHERE id = 't_kajabi'"), /FOREIGN KEY/, 'a template with snapshots cannot vanish');
  assert.throws(
    () => run(db, "INSERT INTO templates (id, workspace_id, kind, name, slug) VALUES ('t_bad', 'ws_a', 'finance', 'Nope', 'nope')"),
    /CHECK/,
  );
});

test('an engagement records the template version it was instantiated from', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st', 'ws_a', 'Kajabi', 'kajabi')");
  run(db, "INSERT INTO templates (id, workspace_id, kind, name, slug) VALUES ('t', 'ws_a', 'onboarding', 'Kajabi', 'kajabi')");
  run(db, "INSERT INTO template_versions (id, workspace_id, template_id, version_number, definition_json, definition_hash) VALUES ('tv', 'ws_a', 't', 1, '{}', 'h')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, source_template_version_id) VALUES ('se', 'ws_a', 'c_james', 'st', 'tv')");
  assert.throws(() => run(db, "DELETE FROM template_versions WHERE id = 'tv'"), /FOREIGN KEY/, 'a used snapshot cannot be deleted');
});

// ── onboarding ───────────────────────────────────────────────────────────

test('onboarding items carry stable logical keys and serve several engagements', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_social', 'ws_a', 'Social', 'social')");
  run(db, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_ads', 'ws_a', 'Ads', 'ads')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_social', 'ws_a', 'c_james', 'st_social')");
  run(db, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_ads', 'ws_a', 'c_james', 'st_ads')");
  run(db, "INSERT INTO onboarding_instances (id, workspace_id, client_id, status) VALUES ('ob', 'ws_a', 'c_james', 'in_progress')");
  // Social calls it "Meta Business access", Ads calls it "Facebook ads access". Same key, one item.
  run(db, "INSERT INTO onboarding_items (id, workspace_id, onboarding_instance_id, logical_key, title, responsible_party) VALUES ('it_meta', 'ws_a', 'ob', 'meta.business_access', 'Meta Business access', 'client')");
  assert.throws(
    () => run(db, "INSERT INTO onboarding_items (id, workspace_id, onboarding_instance_id, logical_key, title) VALUES ('it_meta2', 'ws_a', 'ob', 'meta.business_access', 'Facebook ads access')"),
    /UNIQUE/,
    'deduplicated by key, not by label',
  );
  run(db, "INSERT INTO onboarding_items (id, workspace_id, onboarding_instance_id, logical_key, title) VALUES ('it_brand', 'ws_a', 'ob', 'common.brand_kit', 'Meta Business access')");
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM onboarding_items WHERE title = 'Meta Business access'").n, 2, 'labels may repeat');
  assert.throws(
    () => run(db, "INSERT INTO onboarding_items (id, workspace_id, onboarding_instance_id, logical_key, title) VALUES ('it_bad', 'ws_a', 'ob', 'Meta.Business_Access', 'x')"),
    /CHECK/,
    'keys are normalised lowercase',
  );
  run(db, "INSERT INTO onboarding_item_services (workspace_id, onboarding_item_id, service_engagement_id) VALUES ('ws_a', 'it_meta', 'se_social')");
  run(db, "INSERT INTO onboarding_item_services (workspace_id, onboarding_item_id, service_engagement_id) VALUES ('ws_a', 'it_meta', 'se_ads')");
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM onboarding_item_services WHERE onboarding_item_id = 'it_meta'").n, 2);
  assert.throws(
    () => run(db, "INSERT INTO onboarding_item_services (workspace_id, onboarding_item_id, service_engagement_id) VALUES ('ws_a', 'it_meta', 'se_ads')"),
    /UNIQUE/,
  );
  // Item state is relational, with its own vocabulary and responsible party.
  run(db, "UPDATE onboarding_items SET status = 'waived' WHERE id = 'it_brand'");
  assert.throws(() => run(db, "UPDATE onboarding_items SET status = 'done' WHERE id = 'it_brand'"), /CHECK/);
  assert.throws(() => run(db, "UPDATE onboarding_items SET responsible_party = 'ellen' WHERE id = 'it_brand'"), /CHECK/);
  run(db, "UPDATE onboarding_items SET responsible_party = 'user', responsible_membership_id = 'm_a_ary' WHERE id = 'it_brand'");
  // Items disappear with their instance, links with their item.
  run(db, "UPDATE onboarding_instances SET status = 'complete' WHERE id = 'ob'");
  run(db, "DELETE FROM onboarding_instances WHERE id = 'ob'");
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM onboarding_items').n, 0);
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM onboarding_item_services').n, 0);
});

test('a client has at most one open onboarding instance, so activation can be retried safely', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO onboarding_instances (id, workspace_id, client_id, status) VALUES ('ob1', 'ws_a', 'c_james', 'not_started')");
  assert.throws(
    () => run(db, "INSERT INTO onboarding_instances (id, workspace_id, client_id, status) VALUES ('ob2', 'ws_a', 'c_james', 'in_progress')"),
    /UNIQUE/,
  );
  run(db, "UPDATE onboarding_instances SET status = 'complete', completed_at = '2026-09-05T00:00:00.000Z' WHERE id = 'ob1'");
  run(db, "INSERT INTO onboarding_instances (id, workspace_id, client_id, status) VALUES ('ob2', 'ws_a', 'c_james', 'not_started')");
  assert.throws(() => run(db, "UPDATE onboarding_instances SET status = 'finished' WHERE id = 'ob2'"), /CHECK/);
});

// ── activity ─────────────────────────────────────────────────────────────

test('activity events are append-only and can be scoped to a client and engagement', () => {
  const db = twoWorkspaces(freshDb());
  run(db, "INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, actor_membership_id, client_id, metadata_json) VALUES ('ev1', 'ws_a', 'CLIENT_CREATED', 'client', 'c_james', 'm_a_ellen', 'c_james', '{\"via\":\"test\"}')");
  assert.throws(() => run(db, "UPDATE activity_events SET event_type = 'CLIENT_ENDED' WHERE id = 'ev1'"), /immutable/);
  assert.throws(() => run(db, "DELETE FROM activity_events WHERE id = 'ev1'"), /immutable/);
  assert.throws(
    () => run(db, "INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id) VALUES ('ev2', 'ws_a', 'client_created', 'client', 'c_james')"),
    /CHECK/,
    'event types are upper-case constants',
  );
  assert.throws(
    () => run(db, "INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, client_id) VALUES ('ev3', 'ws_b', 'CLIENT_CREATED', 'client', 'c_james', 'c_james')"),
    /FOREIGN KEY/,
    'a ws_b event cannot cite a ws_a client',
  );
  assert.ok(one(db, "SELECT occurred_at FROM activity_events WHERE id = 'ev1'").occurred_at.endsWith('Z'));
});

// ── auth foundation ──────────────────────────────────────────────────────

test('the auth tables match the Better Auth 1.7.2 core schema and cascade from user', () => {
  const db = freshDb();
  assert.deepEqual(columnsOf(db, 'user').sort(), ['created_at', 'email', 'email_verified', 'id', 'image', 'name', 'updated_at']);
  assert.deepEqual(columnsOf(db, 'session').sort(), ['created_at', 'expires_at', 'id', 'ip_address', 'token', 'updated_at', 'user_agent', 'user_id']);
  assert.deepEqual(
    columnsOf(db, 'account').sort(),
    ['access_token', 'access_token_expires_at', 'account_id', 'created_at', 'id', 'id_token', 'issuer', 'password', 'provider_id', 'refresh_token', 'refresh_token_expires_at', 'scope', 'updated_at', 'user_id'],
  );
  assert.deepEqual(columnsOf(db, 'verification').sort(), ['created_at', 'expires_at', 'id', 'identifier', 'updated_at', 'value']);
  run(db, "INSERT INTO user (id, name, email) VALUES ('u', 'U', 'u@example.com')");
  assert.throws(() => run(db, "INSERT INTO user (id, name, email) VALUES ('u2', 'U2', 'u@example.com')"), /UNIQUE/, 'email is unique');
  run(db, "INSERT INTO session (id, expires_at, token, user_id, updated_at) VALUES ('s', 1, 'tok', 'u', 1)");
  assert.throws(() => run(db, "INSERT INTO session (id, expires_at, token, user_id, updated_at) VALUES ('s2', 1, 'tok', 'u', 1)"), /UNIQUE/, 'token is unique');
  run(db, "DELETE FROM user WHERE id = 'u'");
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM session').n, 0, 'sessions cascade from user');
  // No table in the schema stores a third-party platform password.
  for (const table of schema.BLOOMOPS_TABLES.map(getTableName)) {
    if (table === 'account') continue;
    assert.ok(!columnsOf(db, table).some((c) => /password/i.test(c)), `${table} must not hold passwords`);
  }
});

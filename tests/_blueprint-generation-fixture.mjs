// Synthetic storage fixture shared by SQLite tests and disposable workerd/D1.
// It does not implement generation, authorization or provisioning.
import { createHash } from 'node:crypto';
import { canonicalJson } from '../lib/bloomops/onboarding-definition.mjs';
import { GHL_BUILD_BLUEPRINT_V1 } from '../lib/bloomops/systems-blueprint-defaults.mjs';
import { compileSystemsBlueprint } from '../lib/bloomops/systems-blueprint-compiler.mjs';

export const generationTable = 'systems_blueprint_generations';
export const itemTable = 'systems_blueprint_generation_items';
export const plan = compileSystemsBlueprint({ definition: GHL_BUILD_BLUEPRINT_V1, selectedComponentKeys: ['funnel'] });
export const definitionJson = canonicalJson(GHL_BUILD_BLUEPRINT_V1);
export const hash = text => createHash('sha256').update(text).digest('hex');
export const requestId = '11111111-1111-4111-8111-111111111111';
export const receipt = {
  id: 'generation', workspace_id: 'w', project_id: 'project', client_id: 'client',
  service_engagement_id: 'service', service_type_id: 'type', binding_id: 'binding', binding_revision: 1,
  template_id: 'template', template_version_id: 'version', template_version_number: 1,
  request_id: requestId, blueprint_key: 'ghl_build', definition_schema_version: 1, compiler_version: 1,
  definition_json: definitionJson, definition_hash: hash(definitionJson),
  plan_json: canonicalJson(plan), plan_hash: hash(canonicalJson(plan)), created_by_membership_id: 'member',
  created_at: '2026-09-11T00:00:00.000Z',
};
export function insertStatement(table, values, verb = 'INSERT') {
  return { sql: `${verb} INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`, params: Object.values(values) };
}
export const seedStatements = [
  ...['w', 'other'].map(id => insertStatement('workspaces', { id, name: id, slug: id })),
  insertStatement('user', { id: 'user', name: 'Synthetic', email: 'storage@example.test' }),
  ...['w', 'other'].map((workspace_id, n) => insertStatement('workspace_memberships', { id: n ? 'foreign-member' : 'member', workspace_id, user_id: 'user', role: 'team_member', status: 'active' })),
  ...['w', 'other'].map((workspace_id, n) => insertStatement('bloomops_clients', { id: n ? 'foreign-client' : 'client', workspace_id, name: 'Client', slug: 'client' })),
  ...['w', 'other'].map((workspace_id, n) => insertStatement('service_types', { id: n ? 'foreign-type' : 'type', workspace_id, name: 'Systems', slug: 'systems' })),
  ...['w', 'other'].map((workspace_id, n) => insertStatement('service_engagements', { id: n ? 'foreign-service' : 'service', workspace_id, client_id: n ? 'foreign-client' : 'client', service_type_id: n ? 'foreign-type' : 'type' })),
  ...['w', 'other'].map((workspace_id, n) => insertStatement('templates', { id: n ? 'foreign-template' : 'template', workspace_id, kind: 'systems', name: 'Build', slug: 'build' })),
  ...['w', 'other'].map((workspace_id, n) => insertStatement('template_versions', { id: n ? 'foreign-version' : 'version', workspace_id, template_id: n ? 'foreign-template' : 'template', version_number: 1, definition_json: definitionJson, definition_hash: hash(definitionJson) })),
  ...['w', 'other'].map((workspace_id, n) => insertStatement('service_type_blueprint_bindings', { id: n ? 'foreign-binding' : 'binding', workspace_id, service_type_id: n ? 'foreign-type' : 'type', template_id: n ? 'foreign-template' : 'template' })),
  ...['project', 'second', 'foreign-project'].map(id => insertStatement('projects', { id, workspace_id: id.startsWith('foreign') ? 'other' : 'w', client_id: id.startsWith('foreign') ? 'foreign-client' : 'client', service_engagement_id: id.startsWith('foreign') ? 'foreign-service' : 'service', name: id })),
];
export const liveRows = {
  milestone: { id: 'milestone', workspace_id: 'w', project_id: 'project', creation_request_id: requestId, name: 'Funnel', position: 10 },
  action: { id: 'action', workspace_id: 'w', project_id: 'project', creation_request_id: requestId, title: 'Build funnel' },
  deliverable: { id: 'deliverable', workspace_id: 'w', project_id: 'project', creation_request_id: requestId, title: 'GHL funnel' },
};
export const item = kind => ({ id: `mapping-${kind}`, workspace_id: 'w', generation_id: 'generation', kind,
  logical_key: plan[`${kind}s`][0].logicalKey, record_id: kind, created_at: receipt.created_at });

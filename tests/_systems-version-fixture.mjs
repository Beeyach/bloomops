import { seedStatements as blueprintSeed, insertStatement } from './_blueprint-generation-fixture.mjs';
export { insertStatement };
export const publicationTime = '2026-09-12T00:00:00.000Z';
export const version = {
  rowid: 100, id: 'sys-v1', workspace_id: 'w', template_id: 'sys-template',
  version_number: 1, definition_json: '{}', definition_hash: '0'.repeat(64),
  notes: 'Snapshot notes', created_by_membership_id: 'member',
  created_at: '2026-09-11T00:00:00.000Z', updated_at: '2026-09-11T00:00:00.000Z',
};
export const seedStatements = [
  ...blueprintSeed,
  insertStatement('templates', {rowid:1000,id:'sys-template',workspace_id:'w',kind:'systems',name:'Unbound Systems',slug:'unbound-systems'}),
  insertStatement('templates', {rowid:2000,id:'other-template',workspace_id:'w',kind:'onboarding',name:'Onboarding',slug:'onboarding'}),
  insertStatement('templates', {rowid:3000,id:'empty-template',workspace_id:'w',kind:'systems',name:'Empty Systems',slug:'empty-systems'}),
  insertStatement('template_versions', version),
  insertStatement('template_versions', {...version,rowid:101,id:'sys-v2',version_number:2}),
  insertStatement('template_versions', {...version,rowid:200,id:'other-v1',template_id:'other-template'}),
];

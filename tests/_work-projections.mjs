import { setup as projects } from './_projects.mjs';
import { all, one, run } from './_bloomops-db.mjs';
import { homeProjection, listProjectSummaries } from '../lib/bloomops/work-projections.mjs';

export const NOW = new Date('2026-09-09T00:30:00.000Z');

// Valid relational fixtures, built against every committed domain migration.
// Browser acceptance separately creates records through the canonical APIs.
export async function setup(options = {}) {
  const t = await projects(options);
  const insert = (table, row) => run(t.raw, `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row));
  t.projectId = 'website';
  t.project = (id, patch = {}) => { insert('projects', { id, workspace_id: 'a', client_id: 'james', name: `Project ${id}`, visibility: 'client', ...patch }); return id; };
  t.project(t.projectId, { service_engagement_id: 'social-service' });
  t.action = (id, patch = {}) => {
    const status = patch.status || 'to_do';
    insert('actions', { id, workspace_id: 'a', project_id: t.projectId, creation_request_id: crypto.randomUUID(), title: `Action ${id}`,
      status, waiting_type: status === 'waiting' ? 'client' : null, waiting_reason: status === 'waiting' ? 'Client feedback' : null,
      completed_at: status === 'done' ? NOW.toISOString() : null, ...patch });
    return id;
  };
  t.milestone = (id, patch = {}) => {
    const project = patch.project_id || t.projectId;
    insert('milestones', { id, workspace_id: 'a', project_id: project, creation_request_id: crypto.randomUUID(), name: `Milestone ${id}`,
      position: one(t.raw, 'SELECT count(*) AS n FROM milestones WHERE project_id=?', project).n,
      completed_at: patch.status === 'completed' ? NOW.toISOString() : null, ...patch }); return id;
  };
  t.deliverable = (id, patch = {}) => {
    insert('deliverables', { id, workspace_id: 'a', project_id: t.projectId, creation_request_id: crypto.randomUUID(), title: `Deliverable ${id}`,
      delivered_at: patch.status === 'delivered' ? NOW.toISOString() : null, ...patch }); return id;
  };
  t.file = (id, patch = {}, link = {}) => {
    const status = patch.status || 'ready', usable = ['ready', 'archived'].includes(status);
    insert('assets', { id, workspace_id: 'a', creation_request_id: crypto.randomUUID(), filename: `${id}.txt`, mime_type: 'text/plain', byte_size: 10,
      sha256: 'a'.repeat(64), uploader_membership_id: 'm-ellen', initial_visibility: 'internal', visibility: 'internal',
      object_key: `SECRET_KEY_${id}`, status, ready_at: usable ? NOW.toISOString() : null, etag: usable ? `etag-${id}` : null,
      archived_at: status === 'archived' ? NOW.toISOString() : null, lease_until: status === 'uploading' ? NOW.toISOString() : null, ...patch });
    insert('asset_links', { asset_id: id, workspace_id: patch.workspace_id || 'a', project_id: t.projectId, ...link }); return id;
  };
  t.event = (subject, id, { at = NOW.toISOString(), metadata = null, workspaceId = 'a', clientId = 'james' } = {}) => {
    const eventId = crypto.randomUUID();
    insert('activity_events', { id: eventId, workspace_id: workspaceId, client_id: clientId, subject_type: subject, subject_id: id,
      event_type: subject === 'file' ? 'FILE_UPLOADED' : 'DELIVERABLE_STATUS_CHANGED', occurred_at: at,
      metadata_json: JSON.stringify(metadata || (subject === 'file' ? { filename: `OLD_${id}.txt` } : { to: 'delivered', deliverableTitle: `OLD_${id}` })) });
    return eventId;
  };
  t.tree = (projectId = t.projectId, prefix = projectId) => {
    t.milestone(`${prefix}-milestone`, { project_id: projectId, status: 'completed', visibility: 'client' });
    t.action(`${prefix}-action`, { project_id: projectId, due_date: '2026-09-08' });
    t.deliverable(`${prefix}-deliverable`, { project_id: projectId, status: 'client_review', visibility: 'client' });
    t.deliverable(`${prefix}-delivered`, { project_id: projectId, status: 'delivered', visibility: 'client' }); t.event('deliverable', `${prefix}-delivered`);
    t.file(`${prefix}-file`, { visibility: 'client' }, { project_id: projectId, deliverable_id: `${prefix}-deliverable` }); t.event('file', `${prefix}-file`);
  };
  t.assign = (scope = 'project', member = 'sam', id = null) => {
    const column = { project: 'project_id', client: 'client_id', service: 'service_engagement_id' }[scope];
    insert(`${scope}_assignments`, { workspace_id: 'a', [column]: id || { project: t.projectId, client: 'james', service: 'social-service' }[scope], membership_id: `m-${member}` });
  };
  t.home = (actor = t.owner, options = {}) => homeProjection(t.db, actor, { now: NOW, ...options });
  t.summaries = (actor = t.owner, options = {}) => listProjectSummaries(t.db, actor, { now: NOW, ...options });
  t.summary = async (actor = t.owner, options = {}) => (await t.summaries(actor, { projectId: t.projectId, ...options })).items[0];
  t.snapshot = () => ['projects','milestones','actions','action_dependencies','deliverables','assets','asset_links','asset_upload_attempts','activity_events','bloomops_clients','service_engagements','onboarding_instances','onboarding_items'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  return t;
}

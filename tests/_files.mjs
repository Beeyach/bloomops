import { setup as projects } from './_projects.mjs';
import { run, one, all } from './_bloomops-db.mjs';
import { uploadFile, retryFile, getFile, listFiles, changeFile, downloadFile } from '../lib/bloomops/files.mjs';
import { createDeliverable } from '../lib/bloomops/deliverables.mjs';

// Fault injection around actual stored bytes and checksums. The independent
// workerd/R2 smoke exercises the binding contract without this double.
export function memoryBucket() {
  const objects = new Map(), calls = [];
  const bucket = { objects, calls, beforePut: null, afterPut: null, beforeGet: null, beforeHead: null, beforeDelete: null,
    async put(key, value, options) {
      calls.push(['put', key]); await bucket.beforePut?.(key);
      const bytes = new Uint8Array(value).slice(), hash = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Buffer.from(hash).toString('hex');
      if (options?.sha256 !== hex) throw new Error('Incorrect checksum');
      const object = { key, size: bytes.length, etag: hex.slice(0, 32), checksums: { sha256: hash }, httpMetadata: { ...options.httpMetadata } };
      objects.set(key, { object, bytes }); await bucket.afterPut?.(key);
      return structuredClone(object);
    },
    async head(key) { calls.push(['head', key]); await bucket.beforeHead?.(key); return objects.has(key) ? structuredClone(objects.get(key).object) : null; },
    async get(key) {
      calls.push(['get', key]); const stored = objects.get(key), object = stored ? { ...structuredClone(stored.object), body: new Response(stored.bytes).body } : null;
      await bucket.beforeGet?.(key); return object;
    },
    async delete(key) { calls.push(['delete', key]); await bucket.beforeDelete?.(key); objects.delete(key); },
  };
  return bucket;
}

export async function setup(options = {}) {
  const t = await projects(options);
  t.projectId = (await t.create({ visibility: 'client', serviceEngagementId: 'social-service' })).projectId;
  t.deliverableId = (await createDeliverable(t.db, { actor: t.owner, projectId: t.projectId, requestId: crypto.randomUUID(), input: { title: 'PRIVATE_TITLE', clientLabel: 'Your website', visibility: 'client' } })).deliverableId;
  t.bucket = memoryBucket(); if (t.env) t.env.FILES = t.bucket;
  t.bytes = new TextEncoder().encode('BloomOps handoff');
  t.input = extra => ({ requestId: crypto.randomUUID(), filename: 'handoff.txt', mimeType: 'text/plain', byteSize: t.bytes.length, ...extra });
  t.upload = (input = {}, extra = {}) => uploadFile(t.db, { bucket: t.bucket, actor: t.owner, projectId: t.projectId, bytes: t.bytes, input: t.input(input), ...extra });
  t.retry = (fileId, extra = {}) => retryFile(t.db, { bucket: t.bucket, actor: t.owner, fileId, bytes: t.bytes, input: { filename: 'handoff.txt', mimeType: 'text/plain', byteSize: t.bytes.length }, ...extra });
  t.file = (id, actor = t.owner, opts) => getFile(t.db, actor, id, opts);
  t.list = (actor = t.owner, opts) => listFiles(t.db, actor, t.projectId, opts);
  t.download = (fileId, actor = t.owner, extra = {}) => downloadFile(t.db, { bucket: t.bucket, actor, fileId, ...extra });
  t.change = async (fileId, operation, extra = {}) => changeFile(t.db, { bucket: t.bucket, actor: t.owner, fileId, operation, expectedRevision: (await t.file(fileId)).revision, ...extra });
  t.assign = (id = 'sam') => run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,?)", t.projectId, `m-${id}`);
  t.stored = id => one(t.raw, 'SELECT * FROM assets WHERE id=?', id);
  t.events = type => all(t.raw, "SELECT * FROM activity_events WHERE subject_type='file'" + (type ? ' AND event_type=?' : '') + ' ORDER BY rowid', ...type ? [type] : []);
  t.snapshot = () => ['assets', 'asset_links', 'asset_upload_attempts', 'activity_events'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  t.parents = () => ['projects', 'milestones', 'actions', 'action_dependencies', 'deliverables', 'bloomops_clients', 'service_engagements', 'onboarding_instances', 'onboarding_items'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  return t;
}

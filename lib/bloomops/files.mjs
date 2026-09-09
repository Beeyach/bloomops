import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { activityForMutation } from './activity.mjs';
import { newId } from './clients.mjs';
import { authorizeProject } from './projects.mjs';
import { fileReadCondition, fileSubjectCondition, fileWritable, loadFileResource } from './file-access.mjs';
import { FILE_LEASE_MS, FILE_LIMIT, validateFileInput } from './file-values.mjs';

const f = schema.assets, l = schema.assetLinks, p = schema.projects, d = schema.deliverables, attempts = schema.assetUploadAttempts;
const missing = () => ({ ok: false, reason: 'not_found' });
const conflict = () => ({ ok: false, reason: 'conflict' });
const success = (fileId, unchanged = false) => ({ ok: true, fileId, ...(unchanged ? { unchanged: true } : {}) });
const joined = (db, selection) => db.select(selection).from(f).innerJoin(l, eq(l.assetId, f.id)).innerJoin(p, eq(p.id, l.projectId)).leftJoin(d, eq(d.id, l.deliverableId));
const internalFields = { id: f.id, filename: f.filename, mimeType: f.mimeType, byteSize: f.byteSize, status: f.status, visibility: f.visibility,
  revision: f.revision, createdAt: f.createdAt, readyAt: f.readyAt, projectId: l.projectId, deliverableId: l.deliverableId, deliverableTitle: d.title };
const portalFields = { id: f.id, filename: f.filename, mimeType: f.mimeType, byteSize: f.byteSize, readyAt: f.readyAt,
  attachmentLabel: sql`CASE WHEN ${l.deliverableId} IS NULL THEN NULL ELSE coalesce(${d.clientLabel}, 'Deliverable') END` };

export async function getFile(db, actor, fileId, { portal = false } = {}) {
  const [row] = await joined(db, portal ? portalFields : internalFields).where(and(eq(f.id, String(fileId)), fileReadCondition(actor, { portal }))).limit(1);
  return row || null;
}

export async function listFiles(db, actor, projectId, { portal = false } = {}) {
  const items = await joined(db, portal ? portalFields : internalFields)
    .where(and(eq(l.projectId, String(projectId)), sql`${f.status}<>'archived'`, fileReadCondition(actor, { portal })))
    .orderBy(desc(f.createdAt), asc(f.id)).limit(FILE_LIMIT);
  return { items };
}

// Private storage rows never leave this module, even through mutation results.
async function storedFile(db, actor, fileId, { portal = false, ready = false } = {}) {
  const [row] = await joined(db, { ...getTableColumns(f), projectId: l.projectId, deliverableId: l.deliverableId,
    clientId: p.clientId, serviceEngagementId: p.serviceEngagementId })
    .where(and(eq(f.id, String(fileId)), fileReadCondition(actor, { portal, ready }))).limit(1);
  return row || null;
}

async function managedFile(db, actor, fileId) {
  const resource = await loadFileResource(db, actor, fileId);
  if (!resource) return missing();
  const decision = evaluate(actor, { action: 'file.manage', resource });
  if (!decision.allowed) return { ok: false, reason: decision.outcome };
  const file = await storedFile(db, actor, fileId);
  return file ? { ok: true, file } : missing();
}

function event(actor, file, eventType, now) {
  return { workspaceId: actor.workspaceId, actorMembershipId: actor.membershipId, actorUserId: actor.userId,
    clientId: file.clientId, serviceEngagementId: file.serviceEngagementId, subjectType: 'file', subjectId: file.id,
    eventType, metadata: { filename: file.filename }, occurredAt: now.toISOString() };
}

const selectedValues = (table, values) => Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, sql`${values[key]}`.as(key)]));
const objectKey = (workspaceId, assetId) => `bloomops-files/${encodeURIComponent(workspaceId)}/${assetId}/${newId()}`;
const digestHex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

function objectMatches(object, file, { etag = false } = {}) {
  return Boolean(object && object.key === file.objectKey && object.size === file.byteSize && object.etag
    && object.httpMetadata?.contentType === file.mimeType && object.checksums?.sha256
    && digestHex(object.checksums.sha256) === file.sha256 && (!etag || object.etag === file.etag));
}

// Cleanup is possible only after a generation is permanently fenced. Failed
// attempts are never reused: recovery gets a fresh key. Ready/archived-ready
// keys cannot match this predicate. Keep attempt records even after deletion:
// an interrupted old PUT may finish late; a later explicit retry revisits it.
async function cleanupAttempts(db, bucket, fileId, preferredKey = null) {
  try {
    const rows = await db.select({ id: attempts.id, objectKey: attempts.objectKey }).from(attempts).innerJoin(f, and(eq(f.id, attempts.assetId), eq(f.workspaceId, attempts.workspaceId)))
      .where(and(eq(f.id, fileId), preferredKey ? eq(attempts.objectKey, preferredKey) : undefined,
        sql`(${attempts.objectKey}<>${f.objectKey} OR ${f.status}='failed' OR (${f.status}='archived' AND ${f.readyAt} IS NULL))`))
      .orderBy(asc(attempts.cleanupCheckedAt), asc(attempts.createdAt)).limit(10);
    for (const row of rows) {
      try { await bucket.delete(row.objectKey); } catch { /* Retain the key. */ }
      // This is a last-check timestamp, not a deletion receipt. Rotate failed
      // checks too, so ten persistently failing keys cannot starve later ones.
      try { await db.update(attempts).set({ cleanupCheckedAt: new Date().toISOString() }).where(eq(attempts.id, row.id)); } catch {}
    }
  } catch { /* Without positive D1 evidence, delete nothing. */ }
}

async function failAttempt(db, bucket, file) {
  try {
    await db.update(f).set({ status: 'failed', leaseUntil: null, revision: sql`${f.revision}+1`, updatedAt: new Date().toISOString() })
      .where(and(eq(f.id, file.id), eq(f.workspaceId, file.workspaceId), eq(f.objectKey, file.objectKey), eq(f.status, 'uploading')));
  } catch { /* An uncertain finalize may have committed. Never delete blindly. */ }
  await cleanupAttempts(db, bucket, file.id, file.objectKey);
}

const projectPolicy = { storedFile, fileWritable, managedFile };

// Fixed-parent adapters share one storage protocol; no request supplies policy.
async function writeAttempt(db, bucket, actor, file, bytes, policy = projectPolicy) {
  const { storedFile, fileWritable } = policy;
  try {
    const object = await bucket.put(file.objectKey, bytes, { sha256: file.sha256, httpMetadata: { contentType: file.mimeType } });
    if (!objectMatches(object, file)) throw new Error('Unconfirmed object');
    const condition = and(eq(f.id, file.id), eq(f.objectKey, file.objectKey), eq(f.status, 'uploading'), eq(f.revision, file.revision), fileWritable(actor));
    const now = new Date();
    const results = await db.batch([
      activityForMutation(db, f, condition, event(actor, file, 'FILE_UPLOADED', now)),
      db.update(f).set({ status: 'ready', readyAt: now.toISOString(), etag: object.etag, leaseUntil: null, revision: sql`${f.revision}+1`, updatedAt: now.toISOString() })
        .where(condition).returning({ id: f.id }),
    ]);
    if (!results[1].length) throw new Error('Finalization lost');
    await cleanupAttempts(db, bucket, file.id);
    return await storedFile(db, actor, file.id, { ready: true }) ? success(file.id) : missing();
  } catch {
    await failAttempt(db, bucket, file);
    // A lost D1 commit response is success only with positive current evidence.
    // If D1 cannot answer, leave the known attempt for explicit recovery.
    try {
      const current = await storedFile(db, actor, file.id);
      if (!current) return missing();
      if (current.status === 'ready' && current.objectKey === file.objectKey) {
        const object = await bucket.head(current.objectKey);
        const fresh = await storedFile(db, actor, file.id, { ready: true });
        if (fresh && fresh.revision === current.revision && fresh.objectKey === current.objectKey && objectMatches(object, fresh, { etag: true })) return success(file.id, true);
      }
    } catch {}
    return { ok: false, reason: 'upload_failed' };
  }
}

async function resume(db, bucket, actor, current, bytes, sha256, now, policy = projectPolicy) {
  const { storedFile, fileWritable } = policy;
  if (current.sha256 !== sha256) return conflict();
  if (current.status === 'archived') return conflict();
  if (current.status === 'ready') {
    const object = await bucket.head(current.objectKey);
    const fresh = await storedFile(db, actor, current.id, { ready: true });
    if (!fresh || fresh.revision !== current.revision || !objectMatches(object, fresh, { etag: true })) return missing();
    await cleanupAttempts(db, bucket, current.id);
    return await storedFile(db, actor, current.id, { ready: true }) ? success(current.id, true) : missing();
  }
  if (current.status === 'uploading' && current.leaseUntil > now.toISOString()) return conflict();
  const key = objectKey(actor.workspaceId, current.id), iso = now.toISOString(), leaseUntil = new Date(now.getTime() + FILE_LEASE_MS).toISOString();
  const condition = and(eq(f.id, current.id), eq(f.revision, current.revision), fileWritable(actor),
    sql`(${f.status}='failed' OR (${f.status}='uploading' AND ${f.leaseUntil}<=${iso}))`);
  const claimed = await db.batch([
    db.update(f).set({ status: 'uploading', objectKey: key, leaseUntil, revision: sql`${f.revision}+1`, updatedAt: iso }).where(condition).returning({ id: f.id }),
    db.insert(attempts).select(db.select(selectedValues(attempts, { id: newId(), workspaceId: actor.workspaceId, assetId: current.id, objectKey: key, cleanupCheckedAt: null, createdAt: iso }))
      .from(f).where(and(eq(f.id, current.id), eq(f.objectKey, key)))),
  ]);
  if (!claimed[0].length) return conflict();
  await cleanupAttempts(db, bucket, current.id);
  return writeAttempt(db, bucket, actor, { ...current, objectKey: key, leaseUntil, revision: current.revision + 1 }, bytes, policy);
}

export async function uploadFile(db, { bucket, actor, projectId, input, bytes, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'file.manage');
  if (!access.ok) return access;
  const checked = validateFileInput(input);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== value.byteSize) return { ok: false, reason: 'invalid', errors: { byteSize: 'The file length changed. Select it again.' } };
  const subject = and(eq(p.id, String(projectId)), fileSubjectCondition(actor, value));
  if (!(await db.select({ id: p.id }).from(p).where(subject).limit(1)).length) return missing();
  const sha256 = digestHex(await crypto.subtle.digest('SHA-256', bytes));
  const previous = async () => {
    const [found] = await db.select({ id: f.id }).from(f).where(and(eq(f.workspaceId, actor.workspaceId), eq(f.creationRequestId, value.requestId))).limit(1);
    if (!found) return null;
    const current = await storedFile(db, actor, found.id);
    if (!current) return missing();
    if (current.projectId !== String(projectId) || current.deliverableId !== value.deliverableId || current.initialVisibility !== value.visibility
      || ['filename', 'mimeType', 'byteSize'].some(key => current[key] !== value[key])) return conflict();
    return resume(db, bucket, actor, current, bytes, sha256, now);
  };
  const retry = await previous();
  if (retry) return retry;
  const id = newId(), key = objectKey(actor.workspaceId, id), iso = now.toISOString();
  const file = { id, workspaceId: actor.workspaceId, creationRequestId: value.requestId, filename: value.filename, mimeType: value.mimeType,
    byteSize: value.byteSize, sha256, uploaderMembershipId: actor.membershipId, initialVisibility: value.visibility, visibility: value.visibility,
    status: 'uploading', objectKey: key, leaseUntil: new Date(now.getTime() + FILE_LEASE_MS).toISOString(), etag: null,
    revision: 1, readyAt: null, archivedAt: null, createdAt: iso, updatedAt: iso };
  const reserved = await db.batch([
    db.insert(f).select(db.select(selectedValues(f, file)).from(p).where(and(subject,
      sql`(SELECT count(*) FROM asset_links WHERE workspace_id=${actor.workspaceId} AND project_id=${String(projectId)})<${FILE_LIMIT}`)))
      .onConflictDoNothing({ target: [f.workspaceId, f.creationRequestId] }).returning({ id: f.id }),
    db.insert(l).select(db.select(selectedValues(l, { assetId: id, workspaceId: actor.workspaceId, projectId: String(projectId), deliverableId: value.deliverableId, createdAt: iso }))
      .from(f).where(eq(f.id, id))),
    db.insert(attempts).select(db.select(selectedValues(attempts, { id: newId(), workspaceId: actor.workspaceId, assetId: id, objectKey: key, cleanupCheckedAt: null, createdAt: iso }))
      .from(f).where(eq(f.id, id))),
  ]);
  if (!reserved[0].length) return (await previous()) || conflict();
  return writeAttempt(db, bucket, actor, { ...file, clientId: access.project.clientId, serviceEngagementId: access.project.serviceEngagementId }, bytes);
}

export async function retryFile(db, { bucket, actor, fileId, input, bytes, now = new Date() }, policy = projectPolicy) {
  const { managedFile } = policy;
  const access = await managedFile(db, actor, fileId);
  if (!access.ok) return access;
  const checked = validateFileInput(input, { retry: true });
  if (!checked.ok) return checked;
  const current = access.file;
  if (['filename', 'mimeType', 'byteSize'].some(key => current[key] !== checked.value[key]) || !(bytes instanceof Uint8Array) || bytes.byteLength !== current.byteSize) return conflict();
  return resume(db, bucket, actor, current, bytes, digestHex(await crypto.subtle.digest('SHA-256', bytes)), now, policy);
}

export async function changeFile(db, { bucket, actor, fileId, operation, visibility, expectedRevision, now = new Date() }, policy = projectPolicy) {
  const { managedFile, storedFile, fileWritable } = policy;
  const access = await managedFile(db, actor, fileId);
  if (!access.ok) return access;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !['archive', 'visibility'].includes(operation)
    || (operation === 'visibility' && !schema.VISIBILITIES.includes(visibility))) return { ok: false, reason: 'invalid', errors: { form: 'Refresh this File and choose an available change.' } };
  const current = access.file;
  if (operation === 'archive' && current.status === 'archived') { await cleanupAttempts(db, bucket, fileId); return success(fileId, true); }
  if (operation === 'visibility' && current.status === 'ready' && current.visibility === visibility) return success(fileId, true);
  if (current.revision !== expectedRevision || current.status === 'archived' || (operation === 'visibility' && current.status !== 'ready')) return conflict();
  const condition = and(eq(f.id, current.id), eq(f.revision, expectedRevision), fileWritable(actor, visibility));
  const patch = operation === 'archive' ? { status: 'archived', archivedAt: now.toISOString(), leaseUntil: null } : { visibility };
  const results = await db.batch([
    activityForMutation(db, f, condition, event(actor, current, operation === 'archive' ? 'FILE_ARCHIVED' : 'FILE_VISIBILITY_CHANGED', now)),
    db.update(f).set({ ...patch, revision: sql`${f.revision}+1`, updatedAt: now.toISOString() }).where(condition).returning({ id: f.id }),
  ]);
  if (!results[1].length) {
    const fresh = await storedFile(db, actor, fileId);
    return fresh && (operation === 'archive' ? fresh.status === 'archived' : fresh.status === 'ready' && fresh.visibility === visibility) ? success(fileId, true) : conflict();
  }
  if (operation === 'archive') await cleanupAttempts(db, bucket, fileId);
  return success(fileId);
}

export async function downloadFile(db, { bucket, actor, fileId }, policy = projectPolicy) {
  const { storedFile } = policy;
  const options = { portal: actor?.role === 'client', ready: true };
  const current = await storedFile(db, actor, fileId, options);
  if (!current) return null;
  const object = await bucket.get(current.objectKey);
  // Recheck after the external await; a loaded actor/session is never a lease
  // on access. No read repairs, cached grants or unconditional R2 redirects.
  const fresh = await storedFile(db, actor, fileId, options);
  if (!fresh || fresh.revision !== current.revision || fresh.objectKey !== current.objectKey || !objectMatches(object, fresh, { etag: true }) || !object.body) {
    try { await object?.body?.cancel(); } catch {}
    return null;
  }
  return { filename: fresh.filename, mimeType: fresh.mimeType, byteSize: fresh.byteSize, body: object.body };
}

// Server-only helpers for additive, fixed attachment families. Never DTOs.
export const fileStorage = { selectedValues, objectKey, digestHex, writeAttempt, resume };

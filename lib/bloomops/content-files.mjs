import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { loadContentResource, contentReadCondition } from './content-access.mjs';
import { contentFileReadCondition, contentFileVisibilityCondition, recordingRequestCondition, loadRecordingResource } from './content-file-access.mjs';
import { FILE_LEASE_MS, FILE_LIMIT } from './file-values.mjs';
import { validateContentFileInput } from './content-file-values.mjs';
import { fileStorage, retryFile, changeFile, downloadFile } from './files.mjs';
import { newId } from './clients.mjs';

const f = schema.assets, c = schema.contentItems, l = schema.contentAssetLinks, attempts = schema.assetUploadAttempts;
const missing = () => ({ ok: false, reason: 'not_found' }), conflict = () => ({ ok: false, reason: 'conflict' });
const joined = (db, fields) => db.select(fields).from(f).innerJoin(l, and(eq(l.assetId, f.id), eq(l.workspaceId, f.workspaceId)))
  .innerJoin(c, and(eq(c.id, l.contentId), eq(c.workspaceId, l.workspaceId)));
const safeFields = { id: f.id, filename: f.filename, mimeType: f.mimeType, byteSize: f.byteSize, status: f.status, readyAt: f.readyAt };
const internalFields = { ...safeFields, visibility: f.visibility, revision: f.revision, createdAt: f.createdAt, purpose: l.purpose };

export async function authorizeContentFiles(db, actor, contentId, { portal = false, upload = false } = {}) {
  const resource = await (portal ? loadRecordingResource : loadContentResource)(db, actor, contentId);
  if (!resource) return missing();
  const decision = evaluate(actor, { action: portal ? upload ? 'recording.upload' : 'recording.view' : 'content.file.manage', resource });
  return decision.allowed ? { ok: true, resource } : { ok: false, reason: decision.outcome };
}

export async function listContentFiles(db, actor, contentId, { portal = false } = {}) {
  const items = await joined(db, portal ? safeFields : internalFields).where(and(contentFileReadCondition(actor, { contentId, portal }),
    portal ? sql`(${f.status}='ready' OR ${f.uploaderMembershipId}=${actor?.membershipId || ''})` : undefined))
    .orderBy(desc(f.createdAt), asc(f.id)).limit(FILE_LIMIT);
  return { items };
}

// Internal storage evidence stays inside the domain. The adapter fixes parent,
// family, and operation-specific authority; callers cannot send a policy.
function policyFor(contentId = null, { portal = false, upload = false } = {}) {
  const options = { contentId, portal, upload, includeArchived: !portal };
  const storedFile = async (db, actor, fileId, extra = {}) => {
    const [row] = await joined(db, { ...getTableColumns(f), contentId: l.contentId, purpose: l.purpose,
      clientId: c.clientId, serviceEngagementId: c.serviceEngagementId }).where(and(eq(f.id, String(fileId)),
      contentFileReadCondition(actor, { ...options, ready: Boolean(extra.ready) }))).limit(1);
    return row || null;
  };
  const fileWritable = (actor, visibility) => and(contentFileReadCondition(actor, options),
    visibility === undefined ? undefined : sql`EXISTS (SELECT 1 FROM content_asset_links JOIN content_items
      ON ${c.id}=${l.contentId} AND ${c.workspaceId}=${l.workspaceId}
      WHERE ${l.assetId}=${f.id} AND ${l.workspaceId}=${f.workspaceId} AND ${contentFileVisibilityCondition(actor, visibility)})`);
  return { storedFile, fileWritable, managedFile: async (db, actor, fileId) => {
    const access = await authorizeContentFiles(db, actor, contentId, { portal, upload });
    if (!access.ok) return access;
    const file = await storedFile(db, actor, fileId);
    return file ? { ok: true, file } : missing();
  } };
}

export async function uploadContentFile(db, { bucket, actor, contentId, input, bytes, portal = false, now = new Date() }) {
  const access = await authorizeContentFiles(db, actor, contentId, { portal, upload: true });
  if (!access.ok) return access;
  const checked = validateContentFileInput(input, { portal });
  if (!checked.ok) return checked;
  const value = checked.value;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== value.byteSize) return { ok: false, reason: 'invalid', errors: { byteSize: 'Select the original file again.' } };
  const policy = policyFor(String(contentId), { portal, upload: true });
  const subject = and(eq(c.id, String(contentId)), portal ? recordingRequestCondition(actor) : contentReadCondition(actor), contentFileVisibilityCondition(actor, value.visibility));
  const sha256 = fileStorage.digestHex(await crypto.subtle.digest('SHA-256', bytes));
  const previous = async () => {
    const [found] = await db.select({ id: f.id }).from(f).where(and(eq(f.workspaceId, actor.workspaceId), eq(f.creationRequestId, value.requestId))).limit(1);
    if (!found) return null;
    // Resolve the accessible family before comparing requested parent. This
    // reports a safe conflict for accessible incompatible Content, never IDs.
    const current = await policyFor(null, { portal, upload: true }).storedFile(db, actor, found.id);
    if (!current) return missing();
    if (current.contentId !== String(contentId) || current.purpose !== value.purpose || current.initialVisibility !== value.visibility
      || ['filename', 'mimeType', 'byteSize'].some(key => current[key] !== value[key])) return conflict();
    return fileStorage.resume(db, bucket, actor, current, bytes, sha256, now, policy);
  };
  const prior = await previous();
  if (prior) return prior;
  const id = newId(), key = fileStorage.objectKey(actor.workspaceId, id), iso = now.toISOString();
  const file = { id, workspaceId: actor.workspaceId, creationRequestId: value.requestId, filename: value.filename, mimeType: value.mimeType,
    byteSize: value.byteSize, sha256, uploaderMembershipId: actor.membershipId, initialVisibility: value.visibility, visibility: value.visibility,
    status: 'uploading', objectKey: key, leaseUntil: new Date(now.getTime() + FILE_LEASE_MS).toISOString(), etag: null,
    revision: 1, readyAt: null, archivedAt: null, createdAt: iso, updatedAt: iso };
  const reserved = await db.batch([
    db.insert(f).select(db.select(fileStorage.selectedValues(f, file)).from(c).where(and(subject,
      sql`(SELECT count(*) FROM content_asset_links WHERE workspace_id=${actor.workspaceId} AND content_id=${String(contentId)})<${FILE_LIMIT}`)))
      .onConflictDoNothing({ target: [f.workspaceId, f.creationRequestId] }).returning({ id: f.id }),
    db.insert(l).select(db.select(fileStorage.selectedValues(l, { assetId: id, workspaceId: actor.workspaceId, contentId: String(contentId), purpose: value.purpose, createdAt: iso }))
      .from(f).where(eq(f.id, id))),
    db.insert(attempts).select(db.select(fileStorage.selectedValues(attempts, { id: newId(), workspaceId: actor.workspaceId, assetId: id, objectKey: key, cleanupCheckedAt: null, createdAt: iso }))
      .from(f).where(eq(f.id, id))),
  ]);
  if (!reserved[0].length) return (await previous()) || conflict();
  return fileStorage.writeAttempt(db, bucket, actor, { ...file, clientId: access.resource.clientId, serviceEngagementId: access.resource.serviceEngagementId }, bytes, policy);
}

export const retryContentFile = (db, options) => retryFile(db, options, policyFor(String(options.contentId), { portal: Boolean(options.portal), upload: true }));
export const changeContentFile = (db, options) => changeFile(db, options, policyFor(String(options.contentId)));
export const downloadContentFile = (db, options) => downloadFile(db, options, policyFor(null, { portal: options.actor?.role === 'client' }));

// Title is intentionally the only editorial field in the portal projection.
// No hidden counts or internal waiting/revision context. Bounded SQL, no R2.
export async function recordingRequests(db, actor) {
  return db.select({ id: c.id, title: c.title }).from(c).where(recordingRequestCondition(actor))
    .orderBy(asc(c.createdAt), asc(c.id)).limit(200);
}

export async function canRestrictContentFiles(db, actor, contentId) {
  const [row] = await db.select({ id: c.id }).from(c).where(and(eq(c.id, String(contentId)), contentReadCondition(actor), contentFileVisibilityCondition(actor, 'restricted'))).limit(1);
  return Boolean(row);
}

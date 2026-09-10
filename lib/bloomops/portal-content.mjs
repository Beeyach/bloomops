import { and, asc, desc, eq, gte, lte, ne, or, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { contentClientReadCondition } from './content-access.mjs';
import { recordingRequestCondition, contentFileReadCondition } from './content-file-access.mjs';
import { approvalJoin, requestedApprovalCondition } from './content-approval-access.mjs';
import { contentFilesQuery } from './content-files.mjs';
import { contentPlatformSelection } from './content-platform-read.mjs';
import { PORTAL_CONTENT_PAGE_SIZE, PORTAL_CONTENT_STATUS, portalContentFilters } from './portal-content-values.mjs';

const c = schema.contentItems, r = schema.contentApprovalRounds, f = schema.assets, cl = schema.clients;
// The existing approval predicate owns actionability. General Content never
// selects review copy, a revision, completed rounds, or request provenance.
const approvalId = () => sql`(SELECT ${r.id} FROM content_approval_rounds WHERE ${approvalJoin()} AND ${requestedApprovalCondition()} LIMIT 1)`;
const filesAvailable = actor => sql`EXISTS (SELECT 1 FROM assets WHERE ${f.id} IN
  (SELECT portal_links.asset_id FROM content_asset_links portal_links
   WHERE portal_links.workspace_id=${c.workspaceId} AND portal_links.content_id=${c.id})
  AND ${contentFileReadCondition(actor, { portal: true, ready: true })})`;
const selection = actor => ({ id: c.id, title: c.title, type: c.type, clientName: cl.name, stage: c.stage,
  targetPublishDate: c.targetPublishDate, publishedAt: c.publishedAt, platforms: contentPlatformSelection(),
  recordingNeeded: sql`CASE WHEN ${recordingRequestCondition(actor)} THEN 1 ELSE 0 END`.mapWith(Boolean),
  approvalRoundId: approvalId(), hasFiles: filesAvailable(actor).mapWith(Boolean) });
// Explicit serialization allowlist, including the derived stage label and
// display-only platform labels. No raw row crosses the portal boundary.
const dto = row => ({ id: row.id, title: row.title, type: row.type, clientName: row.clientName,
  statusLabel: PORTAL_CONTENT_STATUS[row.stage], targetPublishDate: row.targetPublishDate,
  publishedAt: row.publishedAt, platforms: row.platforms.map(platform => platform.label),
  recordingNeeded: row.recordingNeeded, approvalRoundId: row.approvalRoundId, hasFiles: row.hasFiles });
const readable = (db, actor) => db.select(selection(actor)).from(c)
  .innerJoin(cl, and(eq(cl.workspaceId, c.workspaceId), eq(cl.id, c.clientId)));

const currentContentCondition = () => ne(c.stage, 'published');
const recentPublishedCondition = now => and(eq(c.stage, 'published'),
  gte(c.publishedAt, new Date(now.getTime() - 30 * 86400000).toISOString()), lte(c.publishedAt, now.toISOString()));
// Navigation and the index gate share the union of discoverable views. C4/C5
// actions are a subset of current work; older publications cannot activate it.
const destinationCondition = (actor, now) => and(contentClientReadCondition(actor),
  or(currentContentCondition(), recentPublishedCondition(now)));

export async function hasPortalContent(db, actor, { now = new Date() } = {}) {
  const rows = await db.select({ id: c.id }).from(c).where(destinationCondition(actor, now)).limit(1);
  return rows.length > 0;
}

export async function portalContent(db, actor, query = {}, { now = new Date() } = {}) {
  if (!evaluate(actor, { action: 'portal.content.list' }).allowed) return { ok: false, reason: 'forbidden' };
  const parsed = portalContentFilters(query);
  if (!parsed.ok) return parsed;
  const { view, page } = parsed;
  const condition = view === 'published'
    ? recentPublishedCondition(now)
    : view === 'action' ? sql`(${recordingRequestCondition(actor)} OR ${approvalId()} IS NOT NULL)` : currentContentCondition();
  const order = view === 'published' ? [desc(c.publishedAt), asc(c.id)] : [asc(sql`${c.targetPublishDate} IS NULL`), asc(c.targetPublishDate), asc(c.id)];
  const rows = await readable(db, actor).where(and(contentClientReadCondition(actor), condition)).orderBy(...order)
    .limit(PORTAL_CONTENT_PAGE_SIZE + 1).offset((page - 1) * PORTAL_CONTENT_PAGE_SIZE);
  return { ok: true, items: rows.slice(0, PORTAL_CONTENT_PAGE_SIZE).map(dto), view, page, hasMore: rows.length > PORTAL_CONTENT_PAGE_SIZE };
}

export async function getPortalContent(db, actor, contentId) {
  // Both metadata queries share one D1 read transaction: File and parent
  // authority cannot change between assembling the two parts of this response.
  const [rows, files] = await db.batch([
    readable(db, actor).where(and(contentClientReadCondition(actor), eq(c.id, String(contentId)))).limit(1),
    contentFilesQuery(db, actor, contentId, { portal: true, ready: true }),
  ]);
  return rows[0] ? { ...dto(rows[0]), files: { items: files } } : null;
}

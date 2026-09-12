import { and, eq } from 'drizzle-orm';
import { schema } from './db.mjs';
import { requireAuthorized } from './access.mjs';
import { workQueryAccess } from './work-api-input.mjs';
import { loadInternalContentResource as loadContentResource } from './content-internal-access.mjs';
import { loadRecordingResource, contentFileReadCondition } from './content-file-access.mjs';
import { validateContentFileInput } from './content-file-values.mjs';
import { readFileUpload } from './file-api.mjs';

export const contentFilesAccess = (req, contentId, { portal = false, upload = false, fileId = null } = {}) => workQueryAccess(req,
  requireAuthorized(req, { action: portal ? upload ? 'recording.upload' : 'recording.view' : 'content.file.manage', resource: async access => {
    const { db, actor } = access;
    const parent = await (portal ? loadRecordingResource : loadContentResource)(db, actor, contentId);
    if (!parent || fileId === null) return parent;
    const [file] = await db.select({ id: schema.assets.id }).from(schema.assets).where(and(eq(schema.assets.id, String(fileId)),
      contentFileReadCondition(actor, { contentId, portal, upload, includeArchived: !portal }))).limit(1);
    return file ? parent : null;
  } }));

export const readContentFileUpload = (req, { portal = false, retry = false } = {}) => readFileUpload(req,
  { retry, validate: (input, options) => validateContentFileInput(input, { ...options, portal }) });

// Generic retry admits only an actual Ads Content asset. Social's historical
// parent-scoped retry and Work File authorization remain unchanged.
export async function adsFileRetryAccess(req,fileId) {
  return workQueryAccess(req,requireAuthorized(req,{action:'content.file.manage',resource:async({db,actor})=>{
    const c=schema.contentItems,l=schema.contentAssetLinks,f=schema.assets;
    const [row]=await db.select({contentId:c.id}).from(f).innerJoin(l,and(eq(l.assetId,f.id),eq(l.workspaceId,f.workspaceId)))
      .innerJoin(c,and(eq(c.id,l.contentId),eq(c.workspaceId,l.workspaceId)))
      .where(and(eq(f.id,String(fileId)),eq(c.productionArea,'ads'),contentFileReadCondition(actor,{write:true,includeArchived:true}))).limit(1);
    return row?loadContentResource(db,actor,row.contentId,{write:true}):null;
  }}));
}

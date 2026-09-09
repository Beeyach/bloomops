import { sql } from 'drizzle-orm';
import { schema } from './db.mjs';
// One bounded aggregate in the Content query, not a per-item API/DB loop.
export const contentPlatformSelection = () => sql`(SELECT json_group_array(json_object('key',platform_key,'label',label)) FROM
  (SELECT cp.platform_key,cp.label FROM content_platforms cp WHERE cp.workspace_id=${schema.contentItems.workspaceId} AND cp.content_id=${schema.contentItems.id} ORDER BY cp.platform_key))`.mapWith(JSON.parse);
export const contentPlatformCondition = key => sql`EXISTS (SELECT 1 FROM content_platforms cp WHERE cp.workspace_id=${schema.contentItems.workspaceId} AND cp.content_id=${schema.contentItems.id} AND cp.platform_key=${key})`;

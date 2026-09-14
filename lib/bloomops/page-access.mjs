import {previewContext,previewLiveCondition} from './preview-policy.mjs';
import {sql} from 'drizzle-orm';
import {administratorCondition} from './workspaces.mjs';
export {PAGE_ICONS} from './page-icons.mjs';
export function activePageMember(actor){
 if(!actor||actor.status!=='active')return sql`0`;
 return sql`${previewLiveCondition(actor)} AND EXISTS(SELECT 1 FROM workspace_memberships wm JOIN workspaces ws ON ws.id=wm.workspace_id WHERE wm.id=${actor.membershipId} AND wm.user_id=${actor.userId} AND wm.workspace_id=${actor.workspaceId} AND wm.status='active' AND ws.status='active')`;
}
// The nearest explicit grant wins, including "none". Stop walking at a
// restricted page. The membership/contact checks are part of this SQL, not
// an earlier permission snapshot, so revocation also gates pending writes.
export function pagePermission(actor,pageId){
 if(!actor||actor.status!=='active')return sql`NULL`;
 const preview=previewContext(actor);
 return sql`CASE WHEN NOT (${previewLiveCondition(actor)}) THEN NULL WHEN ${administratorCondition(actor)} THEN 'edit' ELSE (
  WITH RECURSIVE lineage(id,depth) AS (
   SELECT ${pageId},0
   UNION ALL SELECT loc.parent_id,lineage.depth+1 FROM lineage
    JOIN bloomops_page_locations loc ON loc.page_id=lineage.id AND loc.workspace_id=${actor.workspaceId}
    LEFT JOIN bloomops_page_settings prefs ON prefs.page_id=lineage.id AND prefs.workspace_id=${actor.workspaceId}
    WHERE loc.parent_id IS NOT NULL AND COALESCE(prefs.inherit_access,1)=1 AND lineage.depth<4
  )
  SELECT CASE WHEN ${preview ? sql`EXISTS(SELECT 1 FROM client_contacts selected_contact WHERE selected_contact.id=g.contact_id AND selected_contact.workspace_id=g.workspace_id AND selected_contact.client_id=${preview.clientId})` : sql`1`} THEN g.permission ELSE 'none' END FROM lineage JOIN bloomops_page_grants g ON g.page_id=lineage.id AND g.workspace_id=${actor.workspaceId}
  JOIN workspace_memberships wm ON wm.id=g.membership_id AND wm.workspace_id=g.workspace_id
  JOIN workspaces ws ON ws.id=wm.workspace_id
  WHERE wm.id=${actor.membershipId} AND wm.user_id=${actor.userId} AND wm.status='active' AND ws.status='active' AND wm.role=g.recipient_role
   AND (wm.role IN ('project_manager','team_member') OR (wm.role='client' AND EXISTS(SELECT 1 FROM client_contacts cc WHERE cc.id=g.contact_id AND cc.workspace_id=wm.workspace_id AND cc.user_id=wm.user_id)))
  ORDER BY lineage.depth LIMIT 1
 ) END`;
}
export const pageReadCondition=(actor,id)=>sql`${pagePermission(actor,id)} IN ('view','comment','edit')`;
export const pageEditCondition=(actor,id)=>previewContext(actor)?sql`0`:sql`${pagePermission(actor,id)}='edit'`;

export const pageCommentCondition=(actor,id)=>previewContext(actor)?sql`0`:sql`${pagePermission(actor,id)} IN ('comment','edit')`;

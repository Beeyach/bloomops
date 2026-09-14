import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getProspectOutreach} from '@/lib/bloomops/prospect-outreach.mjs';
import {previewProspectSchedule} from '@/lib/bloomops/prospect-schedule.mjs';
import {exact} from '@/lib/bloomops/prospect-outreach-values.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const input=await readStructuredBody(req,{maxBytes:4096});
 if(!exact(input,['workspaceId','prospectId','expectedRevision','expectedProfileRevision','expectedSenderRevision','earliestAt'])||input.workspaceId!==access.actor.workspaceId)return json({error:'Reload the draft before previewing.'},400);
 const data=await getProspectOutreach(access.db,access.actor,input.prospectId);if(!data)return notFound();
 if(data.conflict||!data.draft||data.draft.revision!==input.expectedRevision||data.profile.revision!==input.expectedProfileRevision||(data.sender?.revision||0)!==input.expectedSenderRevision)return json({error:'The saved draft changed. Reload before previewing.'},409);
 try{return json(previewProspectSchedule(data.draft.timeZone,input.earliestAt));}catch(e){return json({error:e.message},400);}
});

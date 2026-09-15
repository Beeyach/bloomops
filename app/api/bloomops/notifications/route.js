import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {listNotifications,notificationSettings,changeNotification} from '@/lib/bloomops/notifications.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req)=>{
 const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),q=new URL(req.url).searchParams;
 const keys=q.get('settings')==='true'?['settings','threadId','kind']:['page','category','unread'];
 if([...q.keys()].some(k=>!keys.includes(k)||q.getAll(k).length!==1)||q.has('unread')&&!['true','false'].includes(q.get('unread'))||q.has('threadId')!==q.has('kind'))return json({error:'Invalid notification query.'},400);
 const data=q.get('settings')==='true'?await notificationSettings(access.db,actor,{threadId:q.get('threadId'),kind:q.get('kind')}):await listNotifications(access.db,actor,{page:Number(q.get('page')||1),category:q.get('category')||'all',unread:q.get('unread')==='true'});
 return data?json({...data,scope:{workspaceId:actor.workspaceId,userId:actor.userId,membershipId:actor.membershipId}}):notFound();
});
export const POST=withApiErrors(async(req)=>{const {access,response}=await requireAccess(req);if(response)return response;
 const result=await changeNotification(access.db,await getActor(access),await readStructuredBody(req,{maxBytes:2000}));return result.reason==='not_found'?notFound():json(result,result.ok?200:400);
});

import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getPageRecordContext,pageRecordOptions,savePageRecordContext} from '@/lib/bloomops/page-record-context.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAuthorized(req,{action:'pages.shared'});if(response)return response;
 const id=(await params).id,q=new URL(req.url).searchParams;
 if([...q.keys()].some(k=>!['kind','clientId','search','page'].includes(k)||q.getAll(k).length!==1)||q.size&&!q.has('kind'))return json({error:'Unsupported context query.'},400);
 const result=q.has('kind')?await pageRecordOptions(access.db,access.actor,id,{kind:q.get('kind'),clientId:q.get('clientId'),search:q.get('search')||'',page:q.has('page')?Number(q.get('page')):1}):await getPageRecordContext(access.db,access.actor,id);
 return result?json({scope:{userId:access.user.id,workspaceId:access.workspace.id},...(q.has('kind')?{options:result}:{context:result})}):notFound();
});
export const PUT=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAuthorized(req,{action:'pages.manage'});if(response)return response;
 const result=await savePageRecordContext(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:4096}));
 if(result.reason==='not_found')return notFound();
 return json({...result,scope:{userId:access.user.id,workspaceId:access.workspace.id},...(!result.ok?{error:result.error||(result.reason==='conflict'?'The saved context changed. Your selection is still here. Reopen the saved context before editing again.':'Check the selected Client and Project.')}: {})},result.ok?200:result.reason==='conflict'?409:400);
});

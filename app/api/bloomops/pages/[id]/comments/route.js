import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getPageComments,postPageComment,resolvePageComment} from '@/lib/bloomops/page-comments.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.shared'});if(response)return response;const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>!['threadId','page','resolved'].includes(k))||['threadId','page','resolved'].some(k=>q.getAll(k).length>1)||q.has('resolved')&&!['true','false'].includes(q.get('resolved')))return json({error:'Invalid discussion query.'},400);const result=await getPageComments(access.db,access.actor,(await params).id,{threadId:q.get('threadId'),page:q.has('page')?Number(q.get('page')):1,resolved:q.get('resolved')==='true'});return result?json(result):notFound();});
const mutate=command=>withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.shared'});if(response)return response;const result=await command(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:12000}));return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);});
export const POST=mutate(postPageComment);
export const PUT=mutate(resolvePageComment);

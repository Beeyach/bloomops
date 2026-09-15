import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {listPublishedReports} from '@/lib/bloomops/client-report-publications.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access);if(actor.role!=='client'||actor.preview)return notFound();const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>k!=='page'))return json({error:'Invalid query.'},400);const view=await listPublishedReports(access.db,actor,{portal:true,page:Number(q.get('page')||1)});return view?json({...view,scope:{userId:actor.userId,workspaceId:actor.workspaceId}}):json({error:'Invalid page.'},400);});

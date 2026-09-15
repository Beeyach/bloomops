import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {getPublishedReport,reportPublicationReview} from '@/lib/bloomops/client-report-publications.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),{id,reportId,publicationId}=await params;if(new URL(req.url).search)return json({error:'Invalid query.'},400);if(!await reportPublicationReview(access.db,actor,id,reportId))return notFound();const report=await getPublishedReport(access.db,actor,publicationId);return report?.reportId===reportId?json({report,scope:{userId:actor.userId,workspaceId:actor.workspaceId}}):notFound();});

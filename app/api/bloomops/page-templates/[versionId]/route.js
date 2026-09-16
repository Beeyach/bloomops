import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {getPageTemplate} from '@/lib/bloomops/page-templates.mjs';
import {renderPageDocument} from '@/lib/bloomops/page-document.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.manage'});if(response)return response;if(new URL(req.url).search)return json({error:'Unsupported query.'},400);const template=await getPageTemplate(access.db,access.actor,(await params).versionId);return template?json({template:{...template,body:renderPageDocument(template.body)},scope:{userId:access.user.id,workspaceId:access.workspace.id}}):notFound();});

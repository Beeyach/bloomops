import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {getWorkspacePageTree} from '@/lib/bloomops/page-hierarchy.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await requireAuthorized(req,{action:'pages.shared'});if(response)return response;const tree=await getWorkspacePageTree(access.db,access.actor);return tree?json(tree):notFound();});

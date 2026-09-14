import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {listProspectSheet} from '@/lib/bloomops/prospect-sheet.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;const url=new URL(req.url);if([...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))return json({error:'Duplicate filter.'},400);const r=await listProspectSheet(access.db,access.actor,Object.fromEntries(url.searchParams));return r?json(r,r.invalid?400:200):notFound();});

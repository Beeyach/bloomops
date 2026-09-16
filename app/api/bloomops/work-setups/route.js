import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {json} from '@/lib/bloomops/access.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {listWorkSetups,saveWorkSetup} from '@/lib/bloomops/work-setups.mjs';
import {workSetupAccess,workSetupResponse} from '@/lib/bloomops/work-setup-api.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,actor,response}=await workSetupAccess(req);if(response)return response;const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>!['page','archived'].includes(k))||[...q.keys()].some(k=>q.getAll(k).length>1)||q.has('archived')&&!['true','false'].includes(q.get('archived')))return json({error:'Unsupported query.'},400);return workSetupResponse(actor,await listWorkSetups(access.db,actor,{page:q.has('page')?Number(q.get('page')):1,archived:q.get('archived')==='true'}));});
export const POST=withApiErrors(async req=>{const {access,actor,response}=await workSetupAccess(req);if(response)return response;return workSetupResponse(actor,await saveWorkSetup(access.db,actor,await readStructuredBody(req,{maxBytes:140000})));});

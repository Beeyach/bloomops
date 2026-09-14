import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {previewCsv,commitCsv,csvReceipt} from '@/lib/bloomops/prospect-csv.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;const input=await readStructuredBody(req,{maxBytes:600000});if(!input||!['preview','commit'].includes(input.action)||Object.keys(input).some(k=>!['action','input'].includes(k)))return json({error:'Choose preview or import.'},400);const r=await (input.action==='preview'?previewCsv:commitCsv)(access.db,access.actor,input.input);return r?json(r,r.invalid?400:r.conflict?409:200):notFound();});
export const GET=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>k!=='id')||q.getAll('id').length!==1)return json({error:'Choose a receipt.'},400);const r=await csvReceipt(access.db,access.actor,q.get('id'));return r?json(r):notFound();});

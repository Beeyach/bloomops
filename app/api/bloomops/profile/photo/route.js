import { getActor,json,notFound,requireAccess } from '@/lib/bloomops/access.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { readStructuredBody } from '@/lib/bloomops/structured-body.mjs';
import { changeProfilePhoto,downloadProfilePhoto,getProfilePhoto,profilePhotoResponse } from '@/lib/bloomops/profile-photos.mjs';
import { PHOTO_MAX_BYTES } from '@/lib/bloomops/profile-png.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
  const {access,response}=await requireAccess(req);if(response)return response;
  const actor=await getActor(access);
  if(new URL(req.url).searchParams.get('info')==='1'){
    const result=await getProfilePhoto(access.db,actor);return result?json(result):notFound();
  }
  return profilePhotoResponse(await downloadProfilePhoto(access.db,{bucket:access.env.FILES,actor,context:{kind:'self'}}))||notFound();
});
export const PUT=withApiErrors(async req=>{
  const {access,response}=await requireAccess(req);if(response)return response;
  if(req.headers.get('content-type')!=='image/png')return json({error:'Select and crop a photo first.'},400);
  const chunks=[],reader=req.body?.getReader();let length=0;
  if(!reader)return json({error:'Choose a photo.'},400);
  for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>PHOTO_MAX_BYTES){await reader.cancel();return json({error:'The cropped photo is too large.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  const result=await changeProfilePhoto(access.db,{bucket:access.env.FILES,actor:await getActor(access),bytes,input:{requestId:req.headers.get('x-request-id'),expectedVersion:req.headers.get('if-match')}});
  return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:result.reason==='storage'?503:400);
});
export const DELETE=withApiErrors(async req=>{
  const {access,response}=await requireAccess(req);if(response)return response;
  const result=await changeProfilePhoto(access.db,{bucket:access.env.FILES,actor:await getActor(access),input:await readStructuredBody(req,{maxBytes:1024})});
  return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);
});
